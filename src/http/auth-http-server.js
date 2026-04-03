const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const { hashPassword, verifyPassword } = require("../security/password");
const { getClientIp } = require("../services/ip-lookup");
const { listUaProfiles, generateUserAgentByProfile } = require("../services/user-agent");
const { normalizeCoordSystem } = require("../services/coord-system");

function truncateText(text, max = 800) {
  if (text === null || text === undefined) {
    return "";
  }
  const raw = String(text);
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function parseNullableDateInput(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid date format");
  }
  return d.toISOString();
}

function normalizeDateOnlyInput(value, fieldName = "date", fallback = undefined) {
  if (value === undefined) {
    return fallback;
  }
  if (value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    throw new Error(`invalid ${fieldName} format, expected YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    throw new Error(`invalid ${fieldName} value`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeStatus(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === "active" || value === "disabled") {
    return value;
  }
  throw new Error("invalid status, expected active|disabled");
}

function toEnabledInt(value, fallback = 1) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === true || value === "true" || value === 1 || value === "1") {
    return 1;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return 0;
  }
  throw new Error("invalid enabled value");
}

function parseNullableNumberInput(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`invalid number: ${fieldName}`);
  }
  return num;
}

function parseRequiredNumberInput(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`invalid number: ${fieldName}`);
  }
  return num;
}

function parseNullableNonNegativeIntInput(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throw new Error(`invalid integer: ${fieldName}`);
  }
  return num;
}

function parseNullableTextInput(value, fieldName, maxLength = 300) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  if (text.length > maxLength) {
    throw new Error(`invalid text length: ${fieldName}`);
  }
  return text;
}

function parseRequiredTextInput(value, fieldName, maxLength = 300) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} required`);
  }
  if (text.length > maxLength) {
    throw new Error(`invalid text length: ${fieldName}`);
  }
  return text;
}

function parseBooleanInput(value, fieldName) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  throw new Error(`invalid boolean: ${fieldName}`);
}

function normalizeWarningTimeInput(value, fallback = "23:00") {
  const fallbackText = String(fallback || "23:00").trim() || "23:00";
  const raw = value === undefined || value === null ? "" : String(value).trim();
  const text = raw || fallbackText;
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) {
    throw new Error("invalid warningTime format, expected HH:mm");
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("invalid warningTime range, expected HH:mm");
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseNotificationProvider(value) {
  const provider = String(value || "bark")
    .trim()
    .toLowerCase();
  if (provider !== "bark" && provider !== "serverchan") {
    throw new Error("unsupported notification provider");
  }
  return provider;
}

const SERVERCHAN_FORWARD_URL = "https://sct.ftqq.com/forward";
const SERVERCHAN_SEND_API_BASE = "https://sctapi.ftqq.com";
const SERVERCHAN_SENDKEY_RE = /^SCT[A-Za-z0-9]{6,}$/i;

function normalizeServerChanForwardUrlInput(rawValue, fieldName = "serverChanServerUrl") {
  const text = String(rawValue || "").trim();
  if (!text) {
    return "";
  }
  let parsed = null;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw new Error(
      `${fieldName} invalid, only supports https://sct.ftqq.com/forward or https://sctapi.ftqq.com/{SendKey}.send`
    );
  }
  const protocol = String(parsed.protocol || "").toLowerCase();
  const host = String(parsed.host || "").toLowerCase();
  const pathname = String(parsed.pathname || "").replace(/\/+$/, "");
  if (protocol !== "https:") {
    throw new Error(
      `${fieldName} invalid, only supports https://sct.ftqq.com/forward or https://sctapi.ftqq.com/{SendKey}.send`
    );
  }
  if (host === "sct.ftqq.com" && pathname === "/forward") {
    return SERVERCHAN_FORWARD_URL;
  }
  if (
    host === "sctapi.ftqq.com" &&
    (pathname === "" || pathname === "/" || /^\/[^/]+\.send$/i.test(String(parsed.pathname || "")))
  ) {
    return SERVERCHAN_SEND_API_BASE;
  }
  throw new Error(
    `${fieldName} invalid, only supports https://sct.ftqq.com/forward or https://sctapi.ftqq.com/{SendKey}.send`
  );
}

function normalizeServerChanSendKeyInput(rawValue, fieldName = "serverChanSendKey") {
  const text = String(rawValue || "").trim();
  if (!text) {
    return "";
  }
  if (!SERVERCHAN_SENDKEY_RE.test(text)) {
    throw new Error(`${fieldName} invalid, expected SendKey like SCTxxxx`);
  }
  return text;
}

function looksLikeServerChanInput(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return false;
  }
  if (/^sct[a-z0-9_-]{8,}$/i.test(text)) {
    return true;
  }
  if (!/^https?:\/\//i.test(text)) {
    return false;
  }
  try {
    const parsed = new URL(text);
    const host = String(parsed.host || "").toLowerCase();
    if (host.includes("ftqq.com")) {
      return true;
    }
    return false;
  } catch (_error) {
    return false;
  }
}

function parseBarkDeviceKeyFromOneClickUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  let parsed = null;
  try {
    parsed = new URL(input);
  } catch (_error) {
    throw new Error("invalid bark link");
  }
  const protocol = String(parsed.protocol || "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("invalid bark link protocol");
  }
  const rawPathSegments = String(parsed.pathname || "")
    .split("/")
    .filter(Boolean);
  if (!rawPathSegments.length) {
    throw new Error("invalid bark link, missing device key");
  }
  const keySegmentRegex = /^[A-Za-z0-9_-]{6,128}$/;
  let keyIndex = -1;
  let barkDeviceKey = "";
  for (let i = 0; i < rawPathSegments.length; i += 1) {
    let decoded = rawPathSegments[i];
    try {
      decoded = decodeURIComponent(rawPathSegments[i]);
    } catch (_error) {
      decoded = rawPathSegments[i];
    }
    if (keySegmentRegex.test(decoded)) {
      keyIndex = i;
      barkDeviceKey = decoded;
      break;
    }
  }
  if (keyIndex < 0 || !barkDeviceKey) {
    throw new Error("invalid bark link, missing device key");
  }
  let barkServerUrl = `${parsed.protocol}//${parsed.host}`;
  const prefix = rawPathSegments.slice(0, keyIndex).join("/");
  if (prefix) {
    barkServerUrl += `/${prefix}`;
  }
  return {
    barkDeviceKey,
    barkServerUrl
  };
}

function parseBarkDeviceKeyInput(rawValue, options = {}) {
  const opts = options || {};
  if (rawValue === undefined) {
    return {
      provided: false,
      barkDeviceKey: null,
      impliedServerUrl: null
    };
  }
  const text = String(rawValue === null ? "" : rawValue).trim();
  if (!text) {
    if (opts.required) {
      throw new Error("barkDeviceKey required");
    }
    return {
      provided: true,
      barkDeviceKey: null,
      impliedServerUrl: null
    };
  }
  if (text.length > 2048) {
    throw new Error("invalid text length: barkDeviceKey");
  }
  if (/^https?:\/\//i.test(text)) {
    const extracted = parseBarkDeviceKeyFromOneClickUrl(text);
    return {
      provided: true,
      barkDeviceKey: parseRequiredTextInput(
        extracted.barkDeviceKey,
        "barkDeviceKey",
        240
      ),
      impliedServerUrl: parseNullableTextInput(
        extracted.barkServerUrl,
        "barkServerUrl",
        240
      )
    };
  }
  return {
    provided: true,
    barkDeviceKey: opts.required
      ? parseRequiredTextInput(text, "barkDeviceKey", 240)
      : parseNullableTextInput(text, "barkDeviceKey", 240),
    impliedServerUrl: null
  };
}

function parseServerChanSendKeyFromUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  let parsed = null;
  try {
    parsed = new URL(input);
  } catch (_error) {
    throw new Error(
      "invalid serverchan link, only supports https://sct.ftqq.com/forward or https://sctapi.ftqq.com/{SendKey}.send"
    );
  }
  const serverUrl = normalizeServerChanForwardUrlInput(
    input,
    "serverchan link"
  );
  const querySendKey =
    serverUrl === SERVERCHAN_FORWARD_URL
      ? String(parsed.searchParams.get("sendkey") || parsed.searchParams.get("sendKey") || "").trim()
      : String((String(parsed.pathname || "").match(/^\/([^/]+)\.send$/i) || [])[1] || "").trim();
  return {
    serverChanSendKey: querySendKey || "",
    serverChanServerUrl: serverUrl
  };
}

function parseServerChanSendKeyInput(rawValue, options = {}) {
  const opts = options || {};
  if (rawValue === undefined) {
    return {
      provided: false,
      serverChanSendKey: null,
      impliedServerUrl: null
    };
  }
  const text = String(rawValue === null ? "" : rawValue).trim();
  if (!text) {
    if (opts.required) {
      throw new Error("serverChanSendKey required");
    }
    return {
      provided: true,
      serverChanSendKey: null,
      impliedServerUrl: null
    };
  }
  if (text.length > 4096) {
    throw new Error("invalid text length: serverChanSendKey");
  }
  if (/^https?:\/\//i.test(text)) {
    const extracted = parseServerChanSendKeyFromUrl(text);
    const sendKey = normalizeServerChanSendKeyInput(
      extracted.serverChanSendKey,
      "serverChanSendKey"
    );
    if (!sendKey) {
      throw new Error(
        "invalid serverchan link, missing sendkey (use SendKey, https://sct.ftqq.com/forward?sendkey=... or https://sctapi.ftqq.com/{SendKey}.send)"
      );
    }
    return {
      provided: true,
      serverChanSendKey: sendKey,
      impliedServerUrl: extracted.serverChanServerUrl
    };
  }
  return {
    provided: true,
    serverChanSendKey: normalizeServerChanSendKeyInput(text, "serverChanSendKey"),
    impliedServerUrl: null
  };
}

function readNotificationChannelIdFromBody(body) {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body, "channelId")) {
    return body.channelId;
  }
  if (Object.prototype.hasOwnProperty.call(body, "notificationChannelId")) {
    return body.notificationChannelId;
  }
  return undefined;
}

function parseCoordSystemInput(value, fallback = "auto") {
  if (value === undefined || value === null || value === "") {
    return normalizeCoordSystem(fallback);
  }
  return normalizeCoordSystem(value);
}

function getSubscriptionStatus(expiresAt) {
  if (!expiresAt) {
    return "lifetime";
  }
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) {
    return "unknown";
  }
  return expires > Date.now() ? "active" : "expired";
}

function sanitizeAppUser(user, groups = []) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    registeredAt: user.registered_at,
    purchasedAt: user.purchased_at,
    expiresAt: user.expires_at,
    subscriptionStatus: getSubscriptionStatus(user.expires_at),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      maxCheckinAccounts: g.max_checkin_accounts
    })),
    lastLoginAt: user.last_login_at,
    lastLoginIp: user.last_login_ip,
    lastLoginGeoStatus: user.last_login_geo_status
  };
}

function sanitizeGroup(group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    maxCheckinAccounts: group.max_checkin_accounts,
    createdAt: group.created_at,
    updatedAt: group.updated_at
  };
}

function maskSecret(text) {
  const raw = String(text || "");
  if (!raw) {
    return "";
  }
  if (raw.length <= 8) {
    return `${raw.slice(0, 2)}***${raw.slice(-1)}`;
  }
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function isInternalChannelOwnerUsername(username) {
  return String(username || "") === "__dailyflow_admin_channel_owner__";
}

function getNotificationChannelServerUrlRaw(row) {
  const raw = row && typeof row === "object" ? row : {};
  return String(
    raw.serverChanServerUrl ||
      raw.server_chan_server_url ||
      raw.barkServerUrl ||
      raw.bark_server_url ||
      ""
  ).trim();
}

function inferNotificationChannelProvider(row, fallback = "bark") {
  const raw = row && typeof row === "object" ? row : {};
  const rawProvider = String(raw.provider || fallback || "bark")
    .trim()
    .toLowerCase();
  const serverUrl = getNotificationChannelServerUrlRaw(raw);
  let isServerChanServer = false;
  if (serverUrl) {
    try {
      isServerChanServer = Boolean(
        normalizeServerChanForwardUrlInput(serverUrl, "serverChanServerUrl")
      );
    } catch (_error) {
      isServerChanServer = false;
    }
  }
  if (rawProvider === "serverchan") {
    return "serverchan";
  }
  if (rawProvider === "bark") {
    return isServerChanServer ? "serverchan" : "bark";
  }
  return isServerChanServer ? "serverchan" : "bark";
}

function sanitizeNotificationChannel(row, options = {}) {
  if (!row) {
    return null;
  }
  const opts = options || {};
  const includeSecret = Boolean(opts.includeSecret);
  const rawUsername = row.username || null;
  const isAdminOwner = isInternalChannelOwnerUsername(rawUsername);
  const ownerUsername = isAdminOwner ? "admin" : rawUsername;
  const provider = inferNotificationChannelProvider(row, "bark");
  const secretValue = row.bark_device_key || null;
  const serverValue = row.bark_server_url || null;
  const maskedSecret = maskSecret(secretValue);
  const isBark = provider === "bark";
  const isServerChan = provider === "serverchan";
  return {
    id: row.id,
    appUserId: row.app_user_id,
    username: ownerUsername || null,
    ownerType: isAdminOwner ? "admin" : "user",
    name: row.name,
    provider,
    barkServerUrl: isBark ? serverValue : null,
    barkDeviceKey: includeSecret && isBark ? secretValue : null,
    barkDeviceKeyMasked: isBark ? maskedSecret : "",
    hasBarkDeviceKey: isBark ? Boolean(secretValue) : false,
    serverChanServerUrl: isServerChan ? serverValue : null,
    serverChanSendKey: includeSecret && isServerChan ? secretValue : null,
    serverChanSendKeyMasked: isServerChan ? maskedSecret : "",
    hasServerChanSendKey: isServerChan ? Boolean(secretValue) : false,
    enabled: Number(row.enabled) === 1,
    extraJson: row.extra_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const REGISTRATION_ENABLED_KEY = "registration_enabled";
const REGISTRATION_REQUIRE_INVITE_KEY = "registration_require_invite";
const REGISTRATION_DEFAULT_GROUP_ID_KEY = "registration_default_group_id";
const INVITE_CODE_PATTERN = /^[A-Z0-9_-]{4,64}$/;
const INTERNAL_ADMIN_CHANNEL_OWNER_USERNAME = "__dailyflow_admin_channel_owner__";

function parseBooleanSettingValue(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") {
    return Boolean(fallback);
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return Boolean(fallback);
}

function parseNullablePositiveIntSetting(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatInviteCode(input) {
  const code = String(input || "").trim().toUpperCase();
  if (!INVITE_CODE_PATTERN.test(code)) {
    throw new Error("invalid invite code format");
  }
  return code;
}

function generateInviteCode(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  while (output.length < length) {
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < bytes.length && output.length < length; i += 1) {
      output += chars[bytes[i] % chars.length];
    }
  }
  return output;
}

function sanitizeInviteCode(row) {
  if (!row) {
    return null;
  }
  const maxUses =
    row.max_uses === null || row.max_uses === undefined ? null : Number(row.max_uses);
  const usedCount = Number(row.used_count || 0);
  const expiresAt = row.expires_at || null;
  const expiresTs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const isExpired = Number.isFinite(expiresTs) ? expiresTs <= Date.now() : false;
  const isExhausted =
    Number.isFinite(maxUses) && maxUses >= 0 ? usedCount >= Number(maxUses) : false;
  return {
    id: row.id,
    code: row.code,
    enabled: Number(row.enabled) === 1,
    maxUses: maxUses === null || !Number.isFinite(maxUses) ? null : maxUses,
    usedCount,
    remainingUses:
      maxUses === null || !Number.isFinite(maxUses) ? null : Math.max(maxUses - usedCount, 0),
    expiresAt,
    isExpired,
    isExhausted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseAuthStateCookies(authState) {
  const summary = {
    hasAuthState: false,
    authCookieCount: 0,
    authCookies: [],
    authCookieHeader: "",
    authStateParseError: null,
    authStateUpdatedAt: authState && authState.updated_at ? authState.updated_at : null
  };
  if (!authState || !authState.storage_state_json) {
    return summary;
  }

  summary.hasAuthState = true;
  try {
    const storageState = JSON.parse(authState.storage_state_json);
    const rawCookies = Array.isArray(storageState && storageState.cookies)
      ? storageState.cookies
      : [];
    summary.authCookies = rawCookies.map((cookie) => ({
      name: String(cookie && cookie.name ? cookie.name : ""),
      value: String(cookie && cookie.value ? cookie.value : ""),
      domain: String(cookie && cookie.domain ? cookie.domain : ""),
      path: String(cookie && cookie.path ? cookie.path : "/"),
      expires:
        cookie && cookie.expires !== undefined && cookie.expires !== null
          ? Number(cookie.expires)
          : null,
      httpOnly: Boolean(cookie && cookie.httpOnly),
      secure: Boolean(cookie && cookie.secure),
      sameSite: cookie && cookie.sameSite ? String(cookie.sameSite) : ""
    }));
    summary.authCookieCount = summary.authCookies.length;
    summary.authCookieHeader = summary.authCookies
      .filter((cookie) => cookie.name)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  } catch (error) {
    summary.authStateParseError = String(error.message || "invalid storage state");
  }
  return summary;
}

function sanitizeCheckinUser(
  user,
  locationProfile,
  mapRows = [],
  authState = null,
  sharedStatus = null,
  notificationBinding = null,
  availableNotificationChannels = []
) {
  const authSummary = parseAuthStateCookies(authState);
  return {
    id: user.id,
    userKey: user.user_key,
    displayName: user.display_name,
    enabled: Number(user.enabled) === 1,
    debugMode: Number(user.debug_mode) === 1,
    cronExpr: user.cron_expr,
    timezone: user.timezone,
    targetUrl: user.target_url,
    userAgent: user.user_agent,
    checkinButtonText: user.checkin_button_text,
    signedMarkerText: user.signed_marker_text,
    locationRefreshText: user.location_refresh_text,
    radioOptionText: user.radio_option_text,
    warningTime: user.warning_time,
    autoCheckinPauseUntil: user.auto_checkin_pause_until,
    notificationChannelId:
      user.notification_channel_id === null || user.notification_channel_id === undefined
        ? null
        : Number(user.notification_channel_id),
    notificationChannel: sanitizeNotificationChannel(notificationBinding),
    availableNotificationChannels: (availableNotificationChannels || [])
      .map((item) => sanitizeNotificationChannel(item))
      .filter(Boolean),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    locationProfile: locationProfile
      ? {
          id: locationProfile.id,
          name: locationProfile.name,
          latitude: locationProfile.latitude,
          longitude: locationProfile.longitude,
          accuracy: locationProfile.accuracy,
          altitude: locationProfile.altitude,
          altitudeAccuracy: locationProfile.altitude_accuracy,
          heading: locationProfile.heading,
          speed: locationProfile.speed,
          coordSystem: locationProfile.coord_system,
          submitAddressText: locationProfile.submit_address_text,
          submitAddressSource: locationProfile.submit_address_source,
          submitAddressUpdatedAt: locationProfile.submit_address_updated_at,
          submitAddressRawJson: locationProfile.submit_address_raw_json,
          source: locationProfile.source
        }
      : null,
    mappings: mapRows.map((m) => ({
      id: m.id,
      appUserId: m.app_user_id,
      username: m.username
    })),
    hasAuthState: authSummary.hasAuthState,
    authCookieCount: authSummary.authCookieCount,
    authCookies: authSummary.authCookies,
    authCookieHeader: authSummary.authCookieHeader,
    authStateParseError: authSummary.authStateParseError,
    authStateUpdatedAt: authSummary.authStateUpdatedAt,
    cookieStatus: sharedStatus && sharedStatus.cookieStatus ? sharedStatus.cookieStatus : null,
    checkinStatus: sharedStatus && sharedStatus.checkinStatus ? sharedStatus.checkinStatus : null,
    executionStatus:
      sharedStatus && sharedStatus.executionStatus ? sharedStatus.executionStatus : null
  };
}

function parseRawCheckinResult(rawText) {
  if (rawText === null || rawText === undefined || rawText === "") {
    return null;
  }
  const text = String(rawText);
  const MAX_SIZE = 200000;
  if (text.length > MAX_SIZE) {
    return {
      truncated: true,
      originalSize: text.length,
      text: `${text.slice(0, MAX_SIZE)}...`
    };
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      text
    };
  }
}

function getSharedStatusSettingKey(type, checkinUserId) {
  return `checkin_status_snapshot:${type}:${checkinUserId}`;
}

function safeParseJson(text) {
  if (text === null || text === undefined || text === "") {
    return null;
  }
  try {
    return JSON.parse(String(text));
  } catch (_error) {
    return null;
  }
}

function normalizeSharedCookieStatus(result) {
  const value = result && typeof result === "object" ? result : {};
  return {
    ok: Boolean(value.ok),
    status: String(value.status || "unknown"),
    message: truncateText(String(value.message || ""), 320),
    finalUrl: truncateText(String(value.finalUrl || ""), 500),
    checkedAt: String(value.checkedAt || new Date().toISOString())
  };
}

function normalizeSharedCheckinStatus(result) {
  const value = result && typeof result === "object" ? result : {};
  const checkWindow = value.checkWindow && typeof value.checkWindow === "object" ? value.checkWindow : {};
  const student = value.student && typeof value.student === "object" ? value.student : {};
  return {
    ok: Boolean(value.ok),
    status: String(value.status || "unknown"),
    message: truncateText(String(value.message || ""), 320),
    checkedAt: String(value.checkedAt || new Date().toISOString()),
    checkWindow: {
      start: String(checkWindow.start || ""),
      end: String(checkWindow.end || ""),
      currentHHmm: String(checkWindow.currentHHmm || ""),
      within: Boolean(checkWindow.within)
    },
    student: {
      formInstId: String(student.formInstId || ""),
      lastCheckTimestamp:
        Number.isFinite(Number(student.lastCheckTimestamp)) && Number(student.lastCheckTimestamp) > 0
          ? Number(student.lastCheckTimestamp)
          : null,
      lastCheckTime: String(student.lastCheckTime || ""),
      checkType: String(student.checkType || ""),
      addressText: truncateText(String(student.addressText || ""), 200)
    }
  };
}

function normalizeSharedExecutionStatus(result) {
  const value = result && typeof result === "object" ? result : {};
  return {
    status: String(value.status || "unknown"),
    message: truncateText(String(value.message || ""), 320),
    trigger: String(value.trigger || "unknown"),
    startedAt: String(value.startedAt || ""),
    finishedAt: String(value.finishedAt || ""),
    durationMs:
      Number.isFinite(Number(value.durationMs)) && Number(value.durationMs) >= 0
        ? Number(value.durationMs)
        : null,
    runDate: String(value.runDate || "")
  };
}

function sanitizeCheckinLog(log, options = {}) {
  if (!log || typeof log !== "object") {
    return null;
  }
  const opts = options || {};
  const output = {
    id: log.id,
    userId: log.user_id,
    runDate: log.run_date,
    runAt: log.run_at,
    status: log.status,
    durationMs: log.duration_ms,
    message: truncateText(log.message || "", 240),
    createdAt: log.created_at,
    hasRawResult:
      Number(log.has_raw_result) === 1 ||
      (typeof log.raw_result_json === "string" && log.raw_result_json.trim().length > 0)
  };
  if (opts.includeRawResult) {
    output.rawResult = parseRawCheckinResult(log.raw_result_json);
  }
  return output;
}

function generateSequentialUserKey(repo) {
  const rows = repo.listAllUsers();
  let maxId = 0;
  for (const row of rows) {
    const id = Number(row.id);
    if (Number.isFinite(id) && id > maxId) {
      maxId = id;
    }
  }
  const next = maxId + 1;
  return `user_${String(next).padStart(4, "0")}`;
}

async function lookupGeo(ipLookupService, ip) {
  try {
    return await ipLookupService.lookup(ip);
  } catch (error) {
    return {
      geoStatus: "failed",
      geoJson: null,
      geoError: String(error.message || "ip lookup error")
    };
  }
}

function createAuthHttpServer({
  config,
  repo,
  worker,
  notifier,
  jwtService,
  adminSecretManager,
  ipLookupService,
  qrSessionManager,
  logger
}) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  const webStaticDir = path.resolve(__dirname, "public");
  const safeQrSessionManager = qrSessionManager || {
    async startSession() {
      throw new Error("qr session manager unavailable");
    },
    getSession() {
      return null;
    },
    onSessionUpdate() {
      return () => {};
    }
  };
  const safeNotifier = notifier || {
    async sendViaBark() {
      throw new Error("notifier unavailable");
    },
    async sendViaServerChan() {
      throw new Error("notifier unavailable");
    }
  };
  app.use("/web/assets", express.static(webStaticDir, { index: false }));

  app.get("/", (_req, res) => {
    res.redirect("/web/login");
  });
  app.get("/web/login", (_req, res) => {
    res.sendFile(path.join(webStaticDir, "login.html"));
  });
  app.get("/web/admin", (_req, res) => {
    res.sendFile(path.join(webStaticDir, "admin.html"));
  });
  app.get("/web/user", (_req, res) => {
    res.sendFile(path.join(webStaticDir, "user.html"));
  });
  app.get("/public/runtime-config", (_req, res) => {
    const rawProvider = String(config.mapSdkProvider || "amap")
      .trim()
      .toLowerCase();
    const amapKey = String(config.mapSdkAmapKey || "").trim();
    const defaultCoordSystem = String(config.mapSdkDefaultCoordSystem || "gcj02")
      .trim()
      .toLowerCase();
    const amapEnabled =
      Boolean(config.mapSdkEnabled) &&
      rawProvider === "amap" &&
      Boolean(amapKey);
    const osmFallbackEnabled = Boolean(config.mapSdkEnabled) && !amapEnabled;
    const provider = amapEnabled ? "amap" : osmFallbackEnabled ? "osm" : rawProvider;
    const enabled = amapEnabled || osmFallbackEnabled;
    res.json({
      map: {
        enabled,
        provider,
        amapKey: amapEnabled ? amapKey : "",
        defaultCoordSystem: provider === "osm" ? "wgs84" : defaultCoordSystem
      }
    });
  });

  function isInternalAdminChannelOwnerUser(value) {
    const username =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? String(value.username || "")
          : "";
    return isInternalChannelOwnerUsername(username);
  }

  function ensureAdminChannelOwnerUser() {
    let row = repo.getAppUserByUsername(INTERNAL_ADMIN_CHANNEL_OWNER_USERNAME);
    if (row) {
      return row;
    }
    try {
      repo.createAppUser({
        username: INTERNAL_ADMIN_CHANNEL_OWNER_USERNAME,
        password_hash: String(config.adminPasswordHash || "disabled"),
        role: "user",
        status: "disabled",
        purchased_at: null,
        expires_at: null
      });
    } catch (error) {
      if (!String(error.message || "").includes("UNIQUE")) {
        throw error;
      }
    }
    row = repo.getAppUserByUsername(INTERNAL_ADMIN_CHANNEL_OWNER_USERNAME);
    return row || null;
  }

  function getAdminChannelOwnerId() {
    const row = ensureAdminChannelOwnerUser();
    if (!row) {
      return null;
    }
    const id = Number(row.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function listAdminNotificationChannels() {
    const ownerId = getAdminChannelOwnerId();
    if (!ownerId) {
      return [];
    }
    return repo.listNotificationChannelsByAppUserId(ownerId);
  }

  function listAvailableNotificationChannelsForAdminCheckinUser(checkinUserId) {
    const merged = new Map();
    const mapped = repo.listNotificationChannelsByCheckinUserId(checkinUserId) || [];
    for (const row of mapped) {
      const id = Number(row && row.id);
      if (Number.isFinite(id) && id > 0) {
        merged.set(id, row);
      }
    }
    const adminRows = listAdminNotificationChannels();
    for (const row of adminRows) {
      const id = Number(row && row.id);
      if (Number.isFinite(id) && id > 0) {
        merged.set(id, row);
      }
    }
    return Array.from(merged.values()).sort(
      (left, right) => Number(left.id || 0) - Number(right.id || 0)
    );
  }

  function getSharedStatusSnapshotByUserId(checkinUserId) {
    const cookieRow = repo.getAppSettingByKey(
      getSharedStatusSettingKey("cookie", checkinUserId)
    );
    const checkinRow = repo.getAppSettingByKey(
      getSharedStatusSettingKey("checkin", checkinUserId)
    );
    const executionRow = repo.getAppSettingByKey(
      getSharedStatusSettingKey("execution", checkinUserId)
    );
    return {
      cookieStatus:
        cookieRow && cookieRow.value
          ? normalizeSharedCookieStatus(safeParseJson(cookieRow.value))
          : null,
      checkinStatus:
        checkinRow && checkinRow.value
          ? normalizeSharedCheckinStatus(safeParseJson(checkinRow.value))
          : null,
      executionStatus:
        executionRow && executionRow.value
          ? normalizeSharedExecutionStatus(safeParseJson(executionRow.value))
          : null
    };
  }

  function saveSharedCookieStatus(checkinUserId, result) {
    repo.upsertAppSetting(
      getSharedStatusSettingKey("cookie", checkinUserId),
      JSON.stringify(normalizeSharedCookieStatus(result))
    );
  }

  function saveSharedCheckinStatus(checkinUserId, result) {
    repo.upsertAppSetting(
      getSharedStatusSettingKey("checkin", checkinUserId),
      JSON.stringify(normalizeSharedCheckinStatus(result))
    );
  }

  function listCheckinUsersForAdmin() {
    return repo.listAllUsers().map((row) => {
      const location = repo.getDefaultLocationProfile(row.id);
      const mappings = repo.listUserCheckinMapByCheckinUserId(row.id);
      const authState = repo.getAuthStateByUserId(row.id);
      const sharedStatus = getSharedStatusSnapshotByUserId(row.id);
      const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(row.id);
      const availableChannels = listAvailableNotificationChannelsForAdminCheckinUser(row.id);
      return sanitizeCheckinUser(
        row,
        location,
        mappings,
        authState,
        sharedStatus,
        notificationBinding,
        availableChannels
      );
    });
  }

  function listCheckinUsersForAppUser(appUserId) {
    const mappedRows = repo.listUserCheckinMapByAppUserId(appUserId);
    return mappedRows
      .map((row) => repo.getUserById(row.checkin_user_id))
      .filter(Boolean)
      .map((row) => {
        const location = repo.getDefaultLocationProfile(row.id);
        const mappings = repo.listUserCheckinMapByCheckinUserId(row.id);
        const authState = repo.getAuthStateByUserId(row.id);
        const sharedStatus = getSharedStatusSnapshotByUserId(row.id);
        const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(row.id);
        const availableChannels = repo.listNotificationChannelsByAppUserId(appUserId);
        return sanitizeCheckinUser(
          row,
          location,
          mappings,
          authState,
          sharedStatus,
          notificationBinding,
          availableChannels
        );
      });
  }

  function validateNotificationChannelAccessForCheckinUser(checkinUserId, channelId, options = {}) {
    const opts = options || {};
    if (channelId === null || channelId === undefined) {
      return null;
    }
    const safeChannelId = Number(channelId);
    if (!Number.isFinite(safeChannelId) || safeChannelId <= 0) {
      throw new Error("invalid notification channel id");
    }
    const channel = repo.getNotificationChannelById(safeChannelId);
    if (!channel) {
      throw new Error("notification channel not found");
    }
    if (!opts.allowDisabled && Number(channel.enabled) !== 1) {
      throw new Error("notification channel is disabled");
    }
    if (opts.restrictAppUserId) {
      const restrictAppUserId = Number(opts.restrictAppUserId);
      if (
        !Number.isFinite(restrictAppUserId) ||
        restrictAppUserId <= 0 ||
        Number(channel.app_user_id) !== restrictAppUserId
      ) {
        throw new Error("notification channel permission denied");
      }
    } else {
      const channelOwnerId = Number(channel.app_user_id);
      const adminOwnerId = getAdminChannelOwnerId();
      const isAdminOwnedChannel =
        Number.isFinite(adminOwnerId) &&
        adminOwnerId > 0 &&
        channelOwnerId === adminOwnerId;
      if (!isAdminOwnedChannel && !repo.isCheckinMappedToAppUser(checkinUserId, channelOwnerId)) {
        throw new Error("notification channel owner not mapped to checkin user");
      }
    }
    return channel;
  }

  function canAccessCheckinUser(auth, checkinUserId) {
    if (!auth) {
      return false;
    }
    if (auth.role === "admin") {
      return true;
    }
    const appUserId = Number(auth.sub);
    if (!Number.isFinite(appUserId) || appUserId <= 0) {
      return false;
    }
    const rows = repo.listUserCheckinMapByAppUserId(appUserId);
    return rows.some((row) => Number(row.checkin_user_id) === checkinUserId);
  }

  function getCheckinQuotaByAppUserId(appUserId) {
    const groups = repo.listGroupsByUserId(appUserId);
    const used = repo.countUserCheckinMapByAppUserId(appUserId);
    const hasUnlimited = groups.some((g) => {
      const value = g && g.max_checkin_accounts;
      return value === null || value === undefined || String(value).trim() === "";
    });
    if (hasUnlimited) {
      return {
        limit: null,
        used,
        remaining: null
      };
    }
    const limits = groups
      .map((g) => Number(g.max_checkin_accounts))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const limit = limits.length > 0 ? Math.max(...limits) : 0;
    return {
      limit,
      used,
      remaining: Math.max(limit - used, 0)
    };
  }

  function normalizeChannelNameForCompare(name) {
    return String(name || "").trim().toLowerCase();
  }

  function hasNotificationChannelNameConflict(appUserId, channelName, excludeChannelId = null) {
    const ownerId = Number(appUserId);
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      return false;
    }
    const normalized = normalizeChannelNameForCompare(channelName);
    if (!normalized) {
      return false;
    }
    const row =
      excludeChannelId === null || excludeChannelId === undefined
        ? repo.getNotificationChannelByOwnerAndName(ownerId, channelName)
        : repo.getNotificationChannelByOwnerAndNameExcludingId(
            ownerId,
            channelName,
            Number(excludeChannelId)
          );
    if (!row) {
      return false;
    }
    return normalizeChannelNameForCompare(row.name) === normalized;
  }

  function getAdminOverviewSummary() {
    const managedAppUsers = repo
      .listAppUsers()
      .filter((row) => !isInternalAdminChannelOwnerUser(row));
    const regularUserCount = managedAppUsers.length;
    const totalUsers = regularUserCount + 1; // admin + regular users
    return {
      totalUsers,
      totalRegularUsers: regularUserCount,
      totalCheckinAccounts: repo.countCheckinUsers(),
      totalScheduledTasks: repo.countEnabledScheduledCheckinUsers(),
      totalNotificationChannels: repo.countNotificationChannels(),
      checkinSuccessCount: repo.countCheckinLogsSuccess(),
      checkinFailedCount: repo.countCheckinLogsFailed(),
      generatedAt: new Date().toISOString()
    };
  }

  function isDebugModeEnabled() {
    const row = repo.getAppSettingByKey("checkin_debug_mode");
    return Boolean(row && String(row.value || "") === "1");
  }

  function setDebugModeEnabled(enabled) {
    repo.upsertAppSetting("checkin_debug_mode", enabled ? "1" : "0");
  }

  function getRegistrationSettings() {
    const enabledSetting = repo.getAppSettingByKey(REGISTRATION_ENABLED_KEY);
    const requireInviteSetting = repo.getAppSettingByKey(REGISTRATION_REQUIRE_INVITE_KEY);
    const defaultGroupSetting = repo.getAppSettingByKey(REGISTRATION_DEFAULT_GROUP_ID_KEY);

    const registrationEnabled = parseBooleanSettingValue(
      enabledSetting && enabledSetting.value,
      config.registrationEnabled
    );
    const requireInvite = parseBooleanSettingValue(
      requireInviteSetting && requireInviteSetting.value,
      config.registrationRequireInvite
    );
    const configuredGroupId = parseNullablePositiveIntSetting(
      defaultGroupSetting && defaultGroupSetting.value
    );
    const fallbackGroupName = String(config.registrationDefaultGroupName || "user").trim() || "user";
    const defaultGroup =
      (configuredGroupId ? repo.getGroupById(configuredGroupId) : null) ||
      repo.getGroupByName(fallbackGroupName) ||
      repo.getGroupByName("user") ||
      null;

    return {
      registrationEnabled,
      requireInvite,
      defaultGroupId: defaultGroup ? Number(defaultGroup.id) : null,
      defaultGroupName: defaultGroup ? String(defaultGroup.name || "") : null,
      defaultGroup
    };
  }

  function saveRegistrationSettings(settings) {
    repo.upsertAppSetting(
      REGISTRATION_ENABLED_KEY,
      settings.registrationEnabled ? "1" : "0"
    );
    repo.upsertAppSetting(
      REGISTRATION_REQUIRE_INVITE_KEY,
      settings.requireInvite ? "1" : "0"
    );
    repo.upsertAppSetting(
      REGISTRATION_DEFAULT_GROUP_ID_KEY,
      settings.defaultGroupId ? String(settings.defaultGroupId) : ""
    );
  }

  async function sendNotificationChannelTest(channel, options = {}) {
    const row = channel && typeof channel === "object" ? channel : null;
    if (!row) {
      throw new Error("notification channel not found");
    }
    const provider = inferNotificationChannelProvider(row, "bark");
    if (provider !== "bark" && provider !== "serverchan") {
      throw new Error("unsupported notification provider");
    }
    const secretKey = String(row.bark_device_key || row.barkDeviceKey || "").trim();
    if (!secretKey) {
      throw new Error(provider === "serverchan" ? "missing serverchan send key" : "missing bark device key");
    }
    const operator = String(options.operator || "system").trim() || "system";
    const now = new Date();
    const beijingTime = now.toLocaleString("zh-CN", {
      hour12: false,
      timeZone: "Asia/Shanghai"
    });
    const channelName = String(row.name || "-").trim() || "-";
    const title = "DayFlow 通道测试";
    const message =
      `这是一条${provider === "serverchan" ? " Server酱" : " Bark"} 测试消息。\n` +
      `通道：${channelName}\n` +
      `操作者：${operator}\n` +
      `时间：${beijingTime}`;
    if (provider === "serverchan") {
      await safeNotifier.sendViaServerChan(
        {},
        title,
        message,
        {
          channel: {
            provider: "serverchan",
            bark_device_key: secretKey,
            bark_server_url: row.bark_server_url || row.barkServerUrl || null
          }
        }
      );
    } else {
      await safeNotifier.sendViaBark(
        {},
        title,
        message,
        {
          channel: {
            provider: "bark",
            bark_device_key: secretKey,
            bark_server_url: row.bark_server_url || row.barkServerUrl || null
          },
          level: "active",
          isArchive: false
        }
      );
    }
    return {
      sentAt: now.toISOString(),
      message: "测试消息已发送"
    };
  }

  function parseNotificationChannelPayload(body, options = {}) {
    const opts = options || {};
    const raw = body && typeof body === "object" ? body : {};
    const name = parseRequiredTextInput(raw.name, "name", 64);
    const providerFallback = looksLikeServerChanInput(
      raw.serverChanSendKey !== undefined
        ? raw.serverChanSendKey
        : raw.server_chan_send_key !== undefined
          ? raw.server_chan_send_key
          : raw.barkDeviceKey !== undefined
            ? raw.barkDeviceKey
            : raw.bark_device_key
    ) ||
      looksLikeServerChanInput(
        raw.serverChanServerUrl !== undefined
          ? raw.serverChanServerUrl
          : raw.server_chan_server_url !== undefined
            ? raw.server_chan_server_url
            : raw.barkServerUrl !== undefined
              ? raw.barkServerUrl
              : raw.bark_server_url
      )
      ? "serverchan"
      : "bark";
    const provider = parseNotificationProvider(
      raw.provider === undefined || raw.provider === null || raw.provider === ""
        ? providerFallback
        : raw.provider
    );

    let serverUrl = null;
    let secretKey = null;
    if (provider === "serverchan") {
      const explicitServerUrl = parseNullableTextInput(
        raw.serverChanServerUrl !== undefined
          ? raw.serverChanServerUrl
          : raw.server_chan_server_url !== undefined
            ? raw.server_chan_server_url
            : raw.serverChanEndpoint !== undefined
              ? raw.serverChanEndpoint
              : raw.barkServerUrl !== undefined
                ? raw.barkServerUrl
                : raw.bark_server_url,
        "serverChanServerUrl",
        300
      );
      const normalizedExplicitServerUrl = explicitServerUrl
        ? normalizeServerChanForwardUrlInput(explicitServerUrl, "serverChanServerUrl")
        : null;
      const keyInput =
        raw.serverChanSendKey !== undefined
          ? raw.serverChanSendKey
          : raw.server_chan_send_key !== undefined
            ? raw.server_chan_send_key
            : raw.barkDeviceKey !== undefined
              ? raw.barkDeviceKey
              : raw.bark_device_key;
      const parsed = parseServerChanSendKeyInput(keyInput, {
        required: Boolean(opts.requireDeviceKey)
      });
      secretKey = parsed.serverChanSendKey || null;
      serverUrl =
        normalizedExplicitServerUrl ||
        parsed.impliedServerUrl ||
        SERVERCHAN_FORWARD_URL;
    } else {
      const explicitBarkServerUrl = parseNullableTextInput(
        raw.barkServerUrl !== undefined ? raw.barkServerUrl : raw.bark_server_url,
        "barkServerUrl",
        240
      );
      const keyInput =
        raw.barkDeviceKey !== undefined ? raw.barkDeviceKey : raw.bark_device_key;
      const keyParsed = parseBarkDeviceKeyInput(keyInput, {
        required: Boolean(opts.requireDeviceKey)
      });
      secretKey = keyParsed.barkDeviceKey || null;
      serverUrl = explicitBarkServerUrl || keyParsed.impliedServerUrl || null;
    }
    let enabled = true;
    if (raw.enabled !== undefined) {
      enabled = parseBooleanInput(raw.enabled, "enabled");
    } else if (opts.defaultEnabled !== undefined) {
      enabled = Boolean(opts.defaultEnabled);
    }
    return {
      name,
      provider,
      bark_server_url: serverUrl,
      bark_device_key: secretKey,
      enabled: enabled ? 1 : 0,
      extra_json: null
    };
  }

  function hasNotificationSecretField(body) {
    const raw = body && typeof body === "object" ? body : {};
    return (
      Object.prototype.hasOwnProperty.call(raw, "barkDeviceKey") ||
      Object.prototype.hasOwnProperty.call(raw, "bark_device_key") ||
      Object.prototype.hasOwnProperty.call(raw, "serverChanSendKey") ||
      Object.prototype.hasOwnProperty.call(raw, "server_chan_send_key")
    );
  }

  function createCheckinUserByPayload(body, options = {}) {
    const ownerAppUserId = Number(options.ownerAppUserId || 0);
    const source = options.source || "web";
    const displayName = String(body.displayName || "").trim();
    if (!displayName) {
      throw new Error("displayName required");
    }

    const userKey = generateSequentialUserKey(repo);
    const uaProfile = String(body.uaProfile || "ios")
      .trim()
      .toLowerCase();
    const generatedUserAgent = generateUserAgentByProfile(uaProfile);

    const latitude = parseNullableNumberInput(body.latitude, "latitude");
    const longitude = parseNullableNumberInput(body.longitude, "longitude");
    const accuracy = parseNullableNumberInput(body.accuracy, "accuracy");
    const altitude = parseNullableNumberInput(body.altitude, "altitude");
    const altitudeAccuracy = parseNullableNumberInput(body.altitudeAccuracy, "altitudeAccuracy");
    const heading = parseNullableNumberInput(body.heading, "heading");
    const speed = parseNullableNumberInput(body.speed, "speed");
    const coordSystem = parseCoordSystemInput(body.coordSystem, "auto");
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;
    if (hasLatitude !== hasLongitude) {
      throw new Error("latitude and longitude must be both provided");
    }

    const inserted = repo.insertUser({
      user_key: userKey,
      display_name: displayName,
      enabled: toEnabledInt(body.enabled, 1),
      debug_mode:
        body.debugMode === undefined ? 0 : (parseBooleanInput(body.debugMode, "debugMode") ? 1 : 0),
      cron_expr: String(body.cronExpr || "0 0 8 * * *").trim(),
      timezone: String(body.timezone || config.defaultTimezone || "Asia/Shanghai").trim(),
      target_url: String(body.targetUrl || config.defaultTargetUrl || "").trim(),
      user_agent: generatedUserAgent,
      checkin_button_text: String(
        body.checkinButtonText || config.defaultCheckinButtonText || "立即签到"
      ).trim(),
      signed_marker_text: String(
        body.signedMarkerText || config.defaultSignedMarkerText || "今日已签到"
      ).trim(),
      location_refresh_text: String(
        body.locationRefreshText || config.defaultLocationRefreshText || "重新定位"
      ).trim(),
      radio_option_text: body.radioOptionText ? String(body.radioOptionText).trim() : null,
      warning_time: normalizeWarningTimeInput(body.warningTime, "23:00"),
      auto_checkin_pause_until: null,
      notification_channel_id: null
    });

    const createdId = Number(inserted.lastInsertRowid);
    if (hasLatitude && hasLongitude) {
      repo.upsertLocationProfile({
        user_id: createdId,
        name: "default",
        latitude,
        longitude,
        accuracy: accuracy === null || accuracy === undefined ? 30 : accuracy,
        altitude: altitude === undefined ? null : altitude,
        altitude_accuracy: altitudeAccuracy === undefined ? null : altitudeAccuracy,
        heading: heading === undefined ? null : heading,
        speed: speed === undefined ? null : speed,
        coord_system: coordSystem,
        source
      });
    }

    if (Number.isFinite(ownerAppUserId) && ownerAppUserId > 0) {
      repo.createUserCheckinMap(ownerAppUserId, createdId);
    }

    const created = repo.getUserById(createdId);
    const location = repo.getDefaultLocationProfile(createdId);
    const mappings = repo.listUserCheckinMapByCheckinUserId(createdId);
    const authState = repo.getAuthStateByUserId(createdId);
    const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(createdId);
    const availableChannels = Number.isFinite(ownerAppUserId) && ownerAppUserId > 0
      ? repo.listNotificationChannelsByAppUserId(ownerAppUserId)
      : source === "web-admin"
        ? listAvailableNotificationChannelsForAdminCheckinUser(createdId)
        : repo.listNotificationChannelsByCheckinUserId(createdId);
    return sanitizeCheckinUser(
      created,
      location,
      mappings,
      authState,
      null,
      notificationBinding,
      availableChannels
    );
  }

  function signToken(payload) {
    return jwtService.sign(payload);
  }

  function getBearerToken(req) {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return "";
    }
    return auth.slice("Bearer ".length).trim();
  }

  async function authRequired(req, res, next) {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }

    try {
      const payload = jwtService.verify(token);
      req.auth = payload;
      next();
    } catch (_error) {
      res.status(401).json({ error: "invalid token" });
    }
  }

  async function adminRequired(req, res, next) {
    if (!req.auth || req.auth.role !== "admin") {
      res.status(403).json({ error: "admin required" });
      return;
    }
    next();
  }

  function asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      service: "auth-http",
      time: new Date().toISOString()
    });
  });

  app.get(
    "/auth/register-options",
    asyncHandler(async (_req, res) => {
      const settings = getRegistrationSettings();
      res.json({
        registrationEnabled: settings.registrationEnabled,
        requireInvite: settings.requireInvite,
        defaultGroupId: settings.defaultGroupId,
        defaultGroupName: settings.defaultGroupName
      });
    })
  );

  app.post(
    "/auth/register",
    asyncHandler(async (req, res) => {
      const settings = getRegistrationSettings();
      if (!settings.registrationEnabled) {
        res.status(403).json({ error: "registration disabled" });
        return;
      }

      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const inviteCodeInput = String(req.body?.inviteCode || "").trim();
      if (!username || !password) {
        res.status(400).json({ error: "username and password required" });
        return;
      }
      if (username.toLowerCase() === "admin") {
        res.status(400).json({ error: "username reserved" });
        return;
      }
      if (/\s/.test(username)) {
        res.status(400).json({ error: "username cannot contain whitespace" });
        return;
      }
      if (username.length > 64) {
        res.status(400).json({ error: "username too long" });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: "password too short" });
        return;
      }
      if (repo.getAppUserByUsername(username)) {
        res.status(409).json({ error: "username already exists" });
        return;
      }

      let consumedInviteId = null;
      if (settings.requireInvite) {
        if (!inviteCodeInput) {
          res.status(400).json({ error: "invite code required" });
          return;
        }
        let inviteCode = "";
        try {
          inviteCode = formatInviteCode(inviteCodeInput);
        } catch (_error) {
          res.status(400).json({ error: "invalid invite code" });
          return;
        }
        const invite = repo.getInviteCodeByCode(inviteCode);
        const inviteView = sanitizeInviteCode(invite);
        if (!inviteView || !inviteView.enabled || inviteView.isExpired || inviteView.isExhausted) {
          res.status(403).json({ error: "invite code invalid or expired" });
          return;
        }
        const consumed = repo.consumeInviteCode(inviteView.id);
        if (!consumed || Number(consumed.changes || 0) <= 0) {
          res.status(409).json({ error: "invite code already exhausted or expired" });
          return;
        }
        consumedInviteId = inviteView.id;
      }

      try {
        const passwordHash = await hashPassword(password);
        const inserted = repo.createAppUser({
          username,
          password_hash: passwordHash,
          role: "user",
          status: "active",
          purchased_at: null,
          expires_at: null
        });
        const createdId = Number(inserted.lastInsertRowid);
        const targetGroup =
          settings.defaultGroup ||
          repo.getGroupByName(String(config.registrationDefaultGroupName || "user")) ||
          repo.getGroupByName("user");
        if (targetGroup) {
          repo.assignGroup(createdId, targetGroup.id);
        }
        const created = repo.getAppUserById(createdId);
        res.status(201).json({
          ok: true,
          user: sanitizeAppUser(created, repo.listGroupsByUserId(createdId))
        });
      } catch (error) {
        if (consumedInviteId) {
          repo.rollbackInviteCodeUsage(consumedInviteId);
        }
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "username already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (!username || !password) {
        res.status(400).json({ error: "username and password required" });
        return;
      }

      const ip = getClientIp(req);
      const userAgent = String(req.headers["user-agent"] || "");
      const geo = await lookupGeo(ipLookupService, ip);
      const geoJsonString = geo.geoJson ? JSON.stringify(geo.geoJson) : null;

      if (username === "admin") {
        const ok = await adminSecretManager.verify(String(password));
        if (!ok) {
          repo.insertLoginAudit({
            app_user_id: null,
            username: "admin",
            role: "admin",
            status: "failed",
            login_ip: ip || null,
            login_geo_json: geoJsonString,
            geo_status: geo.geoStatus,
            geo_error: geo.geoError,
            user_agent: userAgent || null,
            failure_reason: "invalid password"
          });
          res.status(401).json({ error: "invalid credentials" });
          return;
        }

        const token = signToken({
          sub: "admin",
          role: "admin",
          username: "admin"
        });

        repo.insertLoginAudit({
          app_user_id: null,
          username: "admin",
          role: "admin",
          status: "success",
          login_ip: ip || null,
          login_geo_json: geoJsonString,
          geo_status: geo.geoStatus,
          geo_error: geo.geoError,
          user_agent: userAgent || null,
          failure_reason: null
        });

        res.json({
          token,
          user: {
            username: "admin",
            role: "admin",
            status: "active",
            groups: [],
            subscriptionStatus: "lifetime",
            registeredAt: null,
            purchasedAt: null,
            expiresAt: null
          }
        });
        return;
      }

      const user = repo.getAppUserByUsername(username);
      if (!user) {
        repo.insertLoginAudit({
          app_user_id: null,
          username,
          role: "user",
          status: "failed",
          login_ip: ip || null,
          login_geo_json: geoJsonString,
          geo_status: geo.geoStatus,
          geo_error: geo.geoError,
          user_agent: userAgent || null,
          failure_reason: "user not found"
        });
        res.status(401).json({ error: "invalid credentials" });
        return;
      }

      if (user.status !== "active") {
        repo.insertLoginAudit({
          app_user_id: user.id,
          username: user.username,
          role: user.role,
          status: "failed",
          login_ip: ip || null,
          login_geo_json: geoJsonString,
          geo_status: geo.geoStatus,
          geo_error: geo.geoError,
          user_agent: userAgent || null,
          failure_reason: "user disabled"
        });
        res.status(403).json({ error: "user disabled" });
        return;
      }

      const passwordOk = await verifyPassword(user.password_hash, String(password));
      if (!passwordOk) {
        repo.insertLoginAudit({
          app_user_id: user.id,
          username: user.username,
          role: user.role,
          status: "failed",
          login_ip: ip || null,
          login_geo_json: geoJsonString,
          geo_status: geo.geoStatus,
          geo_error: geo.geoError,
          user_agent: userAgent || null,
          failure_reason: "invalid password"
        });
        res.status(401).json({ error: "invalid credentials" });
        return;
      }

      repo.updateAppUserLoginInfo({
        id: user.id,
        last_login_at: new Date().toISOString(),
        last_login_ip: ip || null,
        last_login_geo_json: geoJsonString,
        last_login_geo_status: geo.geoStatus,
        last_login_ua: userAgent || null
      });

      repo.insertLoginAudit({
        app_user_id: user.id,
        username: user.username,
        role: user.role,
        status: "success",
        login_ip: ip || null,
        login_geo_json: geoJsonString,
        geo_status: geo.geoStatus,
        geo_error: geo.geoError,
        user_agent: userAgent || null,
        failure_reason: null
      });

      const groups = repo.listGroupsByUserId(user.id);
      const token = signToken({
        sub: user.id,
        role: user.role,
        username: user.username
      });

      res.json({
        token,
        user: sanitizeAppUser(
          {
            ...user,
            last_login_ip: ip || null,
            last_login_geo_status: geo.geoStatus,
            last_login_at: new Date().toISOString()
          },
          groups
        )
      });
    })
  );

  app.get(
    "/auth/me",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.json({
          user: {
            username: "admin",
            role: "admin",
            status: "active",
            groups: [],
            subscriptionStatus: "lifetime",
            registeredAt: null,
            purchasedAt: null,
            expiresAt: null
          }
        });
        return;
      }

      const user = repo.getAppUserById(Number(req.auth.sub));
      if (!user) {
        res.status(401).json({ error: "user not found" });
        return;
      }

      const groups = repo.listGroupsByUserId(user.id);
      res.json({
        user: sanitizeAppUser(user, groups)
      });
    })
  );

  app.get(
    "/admin/users",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      const rows = repo
        .listAppUsers()
        .filter((row) => !isInternalAdminChannelOwnerUser(row));
      const data = rows.map((row) => {
        const groups = repo.listGroupsByUserId(row.id);
        return sanitizeAppUser(row, groups);
      });
      res.json({ users: data });
    })
  );

  app.get(
    "/admin/overview",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      res.json({
        overview: getAdminOverviewSummary()
      });
    })
  );

  app.post(
    "/admin/users",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const { username, password, status, purchasedAt, expiresAt } = req.body || {};
      if (!username || !password) {
        res.status(400).json({ error: "username and password required" });
        return;
      }

      const safeStatus = normalizeStatus(status ?? "active");
      const safePurchasedAt = parseNullableDateInput(purchasedAt);
      const safeExpiresAt = parseNullableDateInput(expiresAt);
      const passwordHash = await hashPassword(String(password));

      try {
        const inserted = repo.createAppUser({
          username: String(username).trim(),
          password_hash: passwordHash,
          role: "user",
          status: safeStatus,
          purchased_at: safePurchasedAt === undefined ? null : safePurchasedAt,
          expires_at: safeExpiresAt === undefined ? null : safeExpiresAt
        });
        const createdId = Number(inserted.lastInsertRowid);
        const userGroup = repo.getGroupByName("user");
        if (userGroup) {
          repo.assignGroup(createdId, userGroup.id);
        }
        const created = repo.getAppUserById(createdId);
        const groups = repo.listGroupsByUserId(createdId);
        res.status(201).json({ user: sanitizeAppUser(created, groups) });
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
          res.status(409).json({ error: "username already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/users/:id",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "invalid user id" });
        return;
      }

      const existing = repo.getAppUserById(id);
      if (!existing) {
        res.status(404).json({ error: "user not found" });
        return;
      }

      const safeStatus = normalizeStatus(req.body?.status);
      const safePurchasedAt = parseNullableDateInput(req.body?.purchasedAt);
      const safeExpiresAt = parseNullableDateInput(req.body?.expiresAt);

      repo.updateAppUserBase({
        id,
        status: safeStatus ?? null,
        purchased_at: safePurchasedAt === undefined ? existing.purchased_at : safePurchasedAt,
        expires_at: safeExpiresAt === undefined ? existing.expires_at : safeExpiresAt
      });

      const updated = repo.getAppUserById(id);
      const groups = repo.listGroupsByUserId(id);
      res.json({ user: sanitizeAppUser(updated, groups) });
    })
  );

  app.patch(
    "/admin/users/:id/password",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const { password } = req.body || {};
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "invalid user id" });
        return;
      }
      if (!password) {
        res.status(400).json({ error: "password required" });
        return;
      }
      const existing = repo.getAppUserById(id);
      if (!existing) {
        res.status(404).json({ error: "user not found" });
        return;
      }

      const passwordHash = await hashPassword(String(password));
      repo.updateAppUserPassword({
        id,
        password_hash: passwordHash
      });
      res.json({ ok: true });
    })
  );

  app.get(
    "/admin/users/:id/notification-channels",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const appUserId = Number(req.params.id);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(400).json({ error: "invalid user id" });
        return;
      }
      const user = repo.getAppUserById(appUserId);
      if (!user) {
        res.status(404).json({ error: "user not found" });
        return;
      }
      const channels = repo
        .listNotificationChannelsByAppUserId(appUserId)
        .map((item) => sanitizeNotificationChannel(item))
        .filter(Boolean);
      res.json({ channels });
    })
  );

  app.post(
    "/admin/users/:id/notification-channels",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const appUserId = Number(req.params.id);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(400).json({ error: "invalid user id" });
        return;
      }
      const user = repo.getAppUserById(appUserId);
      if (!user) {
        res.status(404).json({ error: "user not found" });
        return;
      }
      let payload = null;
      try {
        payload = parseNotificationChannelPayload(req.body || {}, {
          requireDeviceKey: true,
          defaultEnabled: true
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (hasNotificationChannelNameConflict(appUserId, payload.name)) {
        res.status(409).json({ error: "notification channel name already exists in this account" });
        return;
      }
      try {
        const inserted = repo.createNotificationChannel({
          app_user_id: appUserId,
          ...payload
        });
        const created = repo.getNotificationChannelById(inserted.lastInsertRowid);
        res.status(201).json({
          channel: sanitizeNotificationChannel(created)
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "notification channel name already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/users/:id/notification-channels/:channelId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const appUserId = Number(req.params.id);
      const channelId = Number(req.params.channelId);
      if (!Number.isFinite(appUserId) || appUserId <= 0 || !Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const user = repo.getAppUserById(appUserId);
      if (!user) {
        res.status(404).json({ error: "user not found" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing || Number(existing.app_user_id) !== appUserId) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      let payload = null;
      try {
        payload = parseNotificationChannelPayload(
          {
            ...existing,
            ...req.body
          },
          {
            requireDeviceKey: false,
            defaultEnabled: Number(existing.enabled) === 1
          }
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (hasNotificationChannelNameConflict(appUserId, payload.name, channelId)) {
        res.status(409).json({ error: "notification channel name already exists in this account" });
        return;
      }
      try {
        repo.updateNotificationChannel({
          id: channelId,
          app_user_id: appUserId,
          name: payload.name,
          provider: payload.provider,
          bark_server_url: payload.bark_server_url,
          bark_device_key:
            hasNotificationSecretField(req.body)
              ? payload.bark_device_key
              : null,
          enabled: payload.enabled,
          extra_json: payload.extra_json
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "notification channel name already exists in this account" });
          return;
        }
        throw error;
      }
      const updated = repo.getNotificationChannelById(channelId);
      res.json({
        channel: sanitizeNotificationChannel(updated)
      });
    })
  );

  app.delete(
    "/admin/users/:id/notification-channels/:channelId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const appUserId = Number(req.params.id);
      const channelId = Number(req.params.channelId);
      if (!Number.isFinite(appUserId) || appUserId <= 0 || !Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing || Number(existing.app_user_id) !== appUserId) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      repo.clearCheckinUserNotificationChannelByChannelId(channelId);
      repo.deleteNotificationChannel(channelId, appUserId);
      res.json({ ok: true });
    })
  );

  app.post(
    "/admin/users/:id/notification-channels/:channelId/test",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const appUserId = Number(req.params.id);
      const channelId = Number(req.params.channelId);
      if (!Number.isFinite(appUserId) || appUserId <= 0 || !Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing || Number(existing.app_user_id) !== appUserId) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      try {
        const result = await sendNotificationChannelTest(existing, {
          operator: "admin"
        });
        res.json({ ok: true, result });
      } catch (error) {
        res.status(502).json({ error: "test notification failed: " + String(error.message || "unknown error") });
      }
    })
  );

  app.get(
    "/admin/notification-channels",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const scope = String(req.query && req.query.scope ? req.query.scope : "all")
        .trim()
        .toLowerCase();
      const sourceRows =
        scope === "own" ? listAdminNotificationChannels() : repo.listNotificationChannels();
      const includeSecret =
        String(req.query && req.query.includeSecret ? req.query.includeSecret : "")
          .trim()
          .toLowerCase() === "1";
      const channels = sourceRows
        .map((item) => sanitizeNotificationChannel(item, { includeSecret }))
        .filter(Boolean);
      res.json({ channels });
    })
  );

  app.post(
    "/admin/notification-channels",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const ownerInput =
        req.body && Object.prototype.hasOwnProperty.call(req.body, "appUserId")
          ? req.body.appUserId
          : undefined;
      let ownerId = null;
      if (
        ownerInput === undefined ||
        ownerInput === null ||
        ownerInput === "" ||
        ownerInput === "admin" ||
        ownerInput === "__admin__"
      ) {
        ownerId = getAdminChannelOwnerId();
      } else {
        ownerId = Number(ownerInput);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
          res.status(400).json({ error: "invalid app user id" });
          return;
        }
        const ownerUser = repo.getAppUserById(ownerId);
        if (!ownerUser) {
          res.status(404).json({ error: "owner user not found" });
          return;
        }
      }
      if (!ownerId) {
        res.status(500).json({ error: "admin channel owner unavailable" });
        return;
      }
      let payload = null;
      try {
        payload = parseNotificationChannelPayload(req.body || {}, {
          requireDeviceKey: true,
          defaultEnabled: true
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (hasNotificationChannelNameConflict(ownerId, payload.name)) {
        res.status(409).json({ error: "notification channel name already exists in this account" });
        return;
      }
      try {
        const inserted = repo.createNotificationChannel({
          app_user_id: ownerId,
          ...payload
        });
        const created = repo.getNotificationChannelById(inserted.lastInsertRowid);
        res.status(201).json({
          channel: sanitizeNotificationChannel(created)
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "notification channel name already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/notification-channels/:channelId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const channelId = Number(req.params.channelId);
      if (!Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      let payload = null;
      try {
        payload = parseNotificationChannelPayload(
          {
            ...existing,
            ...req.body
          },
          {
            requireDeviceKey: false,
            defaultEnabled: Number(existing.enabled) === 1
          }
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      const existingOwnerId = Number(existing.app_user_id);
      if (hasNotificationChannelNameConflict(existingOwnerId, payload.name, channelId)) {
        res.status(409).json({ error: "notification channel name already exists in this account" });
        return;
      }
      try {
        repo.updateNotificationChannel({
          id: channelId,
          app_user_id: existingOwnerId,
          name: payload.name,
          provider: payload.provider,
          bark_server_url: payload.bark_server_url,
          bark_device_key:
            hasNotificationSecretField(req.body)
              ? payload.bark_device_key
              : null,
          enabled: payload.enabled,
          extra_json: payload.extra_json
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "notification channel name already exists in this account" });
          return;
        }
        throw error;
      }
      const updated = repo.getNotificationChannelById(channelId);
      res.json({
        channel: sanitizeNotificationChannel(updated)
      });
    })
  );

  app.delete(
    "/admin/notification-channels/:channelId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const channelId = Number(req.params.channelId);
      if (!Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      repo.clearCheckinUserNotificationChannelByChannelId(channelId);
      repo.deleteNotificationChannel(channelId, Number(existing.app_user_id));
      res.json({ ok: true });
    })
  );

  app.post(
    "/admin/notification-channels/:channelId/test",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const channelId = Number(req.params.channelId);
      if (!Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      try {
        const result = await sendNotificationChannelTest(existing, {
          operator: "admin"
        });
        res.json({ ok: true, result });
      } catch (error) {
        res.status(502).json({ error: "test notification failed: " + String(error.message || "unknown error") });
      }
    })
  );

  app.get(
    "/admin/groups",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      res.json({ groups: repo.listGroups().map(sanitizeGroup) });
    })
  );

  app.post(
    "/admin/groups",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const { name, description } = req.body || {};
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: "group name required" });
        return;
      }
      let maxCheckinAccounts = null;
      try {
        maxCheckinAccounts = parseNullableNonNegativeIntInput(
          req.body?.maxCheckinAccounts,
          "maxCheckinAccounts"
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      try {
        const inserted = repo.createGroup({
          name: String(name).trim(),
          description: description ?? null,
          max_checkin_accounts: maxCheckinAccounts
        });
        const group = repo.getGroupById(inserted.lastInsertRowid);
        res.status(201).json({ group: sanitizeGroup(group) });
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
          res.status(409).json({ error: "group name already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/groups/:id",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "invalid group id" });
        return;
      }
      const existing = repo.getGroupById(id);
      if (!existing) {
        res.status(404).json({ error: "group not found" });
        return;
      }

      const nextName =
        req.body?.name === undefined ? null : String(req.body?.name || "").trim() || null;
      const nextDescription =
        req.body?.description === undefined
          ? existing.description
          : req.body?.description ?? null;
      let nextMaxCheckinAccounts = existing.max_checkin_accounts;
      if (req.body?.maxCheckinAccounts !== undefined) {
        try {
          nextMaxCheckinAccounts = parseNullableNonNegativeIntInput(
            req.body?.maxCheckinAccounts,
            "maxCheckinAccounts"
          );
        } catch (error) {
          res.status(400).json({ error: error.message });
          return;
        }
      }

      repo.updateGroup({
        id,
        name: nextName,
        description: nextDescription,
        max_checkin_accounts: nextMaxCheckinAccounts
      });
      res.json({ group: sanitizeGroup(repo.getGroupById(id)) });
    })
  );

  app.post(
    "/admin/users/:id/groups/:groupId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.id);
      const groupId = Number(req.params.groupId);
      if (!Number.isFinite(userId) || !Number.isFinite(groupId)) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const user = repo.getAppUserById(userId);
      const group = repo.getGroupById(groupId);
      if (!user || !group) {
        res.status(404).json({ error: "user or group not found" });
        return;
      }

      repo.assignGroup(userId, groupId);
      res.json({
        ok: true,
        groups: repo.listGroupsByUserId(userId).map(sanitizeGroup)
      });
    })
  );

  app.delete(
    "/admin/users/:id/groups/:groupId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const userId = Number(req.params.id);
      const groupId = Number(req.params.groupId);
      if (!Number.isFinite(userId) || !Number.isFinite(groupId)) {
        res.status(400).json({ error: "invalid id" });
        return;
      }

      repo.removeGroup(userId, groupId);
      res.json({
        ok: true,
        groups: repo.listGroupsByUserId(userId).map(sanitizeGroup)
      });
    })
  );

  app.get(
    "/admin/registration-settings",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      const settings = getRegistrationSettings();
      res.json({
        registrationEnabled: settings.registrationEnabled,
        requireInvite: settings.requireInvite,
        defaultGroupId: settings.defaultGroupId,
        defaultGroupName: settings.defaultGroupName
      });
    })
  );

  app.patch(
    "/admin/registration-settings",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const current = getRegistrationSettings();
      let registrationEnabled = current.registrationEnabled;
      let requireInvite = current.requireInvite;
      let defaultGroupId = current.defaultGroupId;

      if (req.body?.registrationEnabled !== undefined) {
        try {
          registrationEnabled = parseBooleanInput(
            req.body?.registrationEnabled,
            "registrationEnabled"
          );
        } catch (error) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      if (req.body?.requireInvite !== undefined) {
        try {
          requireInvite = parseBooleanInput(req.body?.requireInvite, "requireInvite");
        } catch (error) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      if (req.body?.defaultGroupId !== undefined) {
        if (req.body?.defaultGroupId === null || req.body?.defaultGroupId === "") {
          defaultGroupId = null;
        } else {
          const parsedId = Number(req.body?.defaultGroupId);
          if (!Number.isFinite(parsedId) || parsedId <= 0) {
            res.status(400).json({ error: "invalid defaultGroupId" });
            return;
          }
          const targetGroup = repo.getGroupById(parsedId);
          if (!targetGroup) {
            res.status(404).json({ error: "default group not found" });
            return;
          }
          defaultGroupId = parsedId;
        }
      }

      const resolvedGroup =
        (defaultGroupId ? repo.getGroupById(defaultGroupId) : null) ||
        repo.getGroupByName(String(config.registrationDefaultGroupName || "user")) ||
        repo.getGroupByName("user") ||
        null;

      saveRegistrationSettings({
        registrationEnabled,
        requireInvite,
        defaultGroupId: resolvedGroup ? Number(resolvedGroup.id) : null
      });

      const settings = getRegistrationSettings();
      res.json({
        registrationEnabled: settings.registrationEnabled,
        requireInvite: settings.requireInvite,
        defaultGroupId: settings.defaultGroupId,
        defaultGroupName: settings.defaultGroupName
      });
    })
  );

  app.get(
    "/admin/invite-codes",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      res.json({
        inviteCodes: repo.listInviteCodes().map(sanitizeInviteCode).filter(Boolean)
      });
    })
  );

  app.post(
    "/admin/invite-codes",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      let code = "";
      try {
        code = req.body?.code ? formatInviteCode(req.body.code) : generateInviteCode(12);
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      let maxUses = null;
      let expiresAt = null;
      let enabled = 1;
      try {
        const parsedMaxUses = parseNullableNonNegativeIntInput(
          req.body?.maxUses,
          "maxUses"
        );
        maxUses = parsedMaxUses === undefined ? null : parsedMaxUses;
        const parsedExpiresAt = parseNullableDateInput(req.body?.expiresAt);
        expiresAt = parsedExpiresAt === undefined ? null : parsedExpiresAt;
        if (req.body?.enabled !== undefined) {
          enabled = parseBooleanInput(req.body?.enabled, "enabled") ? 1 : 0;
        }
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      try {
        const inserted = repo.createInviteCode({
          code,
          enabled,
          max_uses: maxUses,
          used_count: 0,
          expires_at: expiresAt
        });
        res.status(201).json({
          inviteCode: sanitizeInviteCode(repo.getInviteCodeById(inserted.lastInsertRowid))
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "invite code already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/invite-codes/:id",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "invalid invite code id" });
        return;
      }
      const existing = repo.getInviteCodeById(id);
      if (!existing) {
        res.status(404).json({ error: "invite code not found" });
        return;
      }
      let nextEnabled = Number(existing.enabled) === 1 ? 1 : 0;
      let nextMaxUses =
        existing.max_uses === null || existing.max_uses === undefined
          ? null
          : Number(existing.max_uses);
      let nextExpiresAt = existing.expires_at || null;
      try {
        if (req.body?.enabled !== undefined) {
          nextEnabled = parseBooleanInput(req.body?.enabled, "enabled") ? 1 : 0;
        }
        if (req.body?.maxUses !== undefined) {
          nextMaxUses = parseNullableNonNegativeIntInput(req.body?.maxUses, "maxUses");
        }
        if (req.body?.expiresAt !== undefined) {
          nextExpiresAt = parseNullableDateInput(req.body?.expiresAt);
        }
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      repo.updateInviteCode({
        id,
        enabled: nextEnabled,
        max_uses: nextMaxUses,
        expires_at: nextExpiresAt
      });
      res.json({
        inviteCode: sanitizeInviteCode(repo.getInviteCodeById(id))
      });
    })
  );

  app.get(
    "/admin/checkin-users",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      res.json({
        checkinUsers: listCheckinUsersForAdmin()
      });
    })
  );

  app.get(
    "/admin/ua-profiles",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      res.json({
        profiles: listUaProfiles()
      });
    })
  );

  app.post(
    "/admin/checkin-users",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      try {
        const checkinUser = createCheckinUserByPayload(req.body || {}, {
          source: "web-admin"
        });
        res.status(201).json({ checkinUser });
      } catch (error) {
        if (String(error.message).startsWith("invalid ")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("displayName required")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("unsupported ua profile")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("latitude and longitude")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("UNIQUE")) {
          res.status(409).json({ error: "user_key already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/admin/checkin-users/:id",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const existing = repo.getUserById(id);
      if (!existing) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const body = req.body || {};
      let parsedDebugMode = Number(existing.debug_mode) === 1;
      let nextNotificationChannelId =
        existing.notification_channel_id === null || existing.notification_channel_id === undefined
          ? null
          : Number(existing.notification_channel_id);
      let existingWarningTimeNormalized = "23:00";
      try {
        existingWarningTimeNormalized = normalizeWarningTimeInput(existing.warning_time, "23:00");
      } catch (_error) {
        existingWarningTimeNormalized = "23:00";
      }
      if (body.debugMode !== undefined) {
        try {
          parsedDebugMode = parseBooleanInput(body.debugMode, "debugMode");
        } catch (error) {
          res.status(400).json({ error: error.message });
          return;
        }
      }
      const notificationChannelIdRaw = readNotificationChannelIdFromBody(body);
      if (notificationChannelIdRaw !== undefined) {
        try {
          const channel =
            notificationChannelIdRaw === null || notificationChannelIdRaw === ""
              ? null
              : validateNotificationChannelAccessForCheckinUser(
                  id,
                  Number(notificationChannelIdRaw)
                );
          nextNotificationChannelId = channel ? Number(channel.id) : null;
        } catch (error) {
          res.status(400).json({ error: error.message });
          return;
        }
      }

      repo.updateCheckinUserBase({
        id,
        display_name:
          body.displayName === undefined
            ? existing.display_name
            : String(body.displayName || "").trim() || existing.display_name,
        enabled:
          body.enabled === undefined ? Number(existing.enabled) : toEnabledInt(body.enabled),
        debug_mode: parsedDebugMode ? 1 : 0,
        cron_expr:
          body.cronExpr === undefined
            ? existing.cron_expr
            : String(body.cronExpr || "").trim() || existing.cron_expr,
        timezone:
          body.timezone === undefined
            ? existing.timezone
            : String(body.timezone || "").trim() || existing.timezone,
        target_url:
          body.targetUrl === undefined
            ? existing.target_url
            : String(body.targetUrl || "").trim() || existing.target_url,
        user_agent:
          body.userAgent === undefined
            ? existing.user_agent
            : String(body.userAgent || "").trim() || null,
        checkin_button_text:
          body.checkinButtonText === undefined
            ? existing.checkin_button_text
            : String(body.checkinButtonText || "").trim() || existing.checkin_button_text,
        signed_marker_text:
          body.signedMarkerText === undefined
            ? existing.signed_marker_text
            : String(body.signedMarkerText || "").trim() || existing.signed_marker_text,
        location_refresh_text:
          body.locationRefreshText === undefined
            ? existing.location_refresh_text
            : String(body.locationRefreshText || "").trim() || existing.location_refresh_text,
        radio_option_text:
          body.radioOptionText === undefined ? existing.radio_option_text : body.radioOptionText,
        warning_time:
          body.warningTime === undefined
            ? existingWarningTimeNormalized
            : normalizeWarningTimeInput(body.warningTime, existingWarningTimeNormalized),
        auto_checkin_pause_until:
          body.autoCheckinPauseUntil === undefined
            ? existing.auto_checkin_pause_until
            : normalizeDateOnlyInput(
                body.autoCheckinPauseUntil,
                "autoCheckinPauseUntil",
                existing.auto_checkin_pause_until
              ),
        notification_channel_id: nextNotificationChannelId
      });

      const updated = repo.getUserById(id);
      const location = repo.getDefaultLocationProfile(id);
      const mappings = repo.listUserCheckinMapByCheckinUserId(id);
      const authState = repo.getAuthStateByUserId(id);
      const sharedStatus = getSharedStatusSnapshotByUserId(id);
      const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(id);
      const availableChannels = listAvailableNotificationChannelsForAdminCheckinUser(id);
      res.json({
        checkinUser: sanitizeCheckinUser(
          updated,
          location,
          mappings,
          authState,
          sharedStatus,
          notificationBinding,
          availableChannels
        )
      });
    })
  );

  app.post(
    "/admin/checkin-users/:id/location",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const existing = repo.getUserById(id);
      if (!existing) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const body = req.body || {};
      const latitude = parseRequiredNumberInput(body.latitude, "latitude");
      const longitude = parseRequiredNumberInput(body.longitude, "longitude");
      const accuracy = parseNullableNumberInput(body.accuracy, "accuracy");
      const altitude = parseNullableNumberInput(body.altitude, "altitude");
      const altitudeAccuracy = parseNullableNumberInput(body.altitudeAccuracy, "altitudeAccuracy");
      const heading = parseNullableNumberInput(body.heading, "heading");
      const speed = parseNullableNumberInput(body.speed, "speed");
      const submitAddressText = parseNullableTextInput(
        body.submitAddressText,
        "submitAddressText",
        180
      );
      const submitAddressSource = parseNullableTextInput(
        body.submitAddressSource,
        "submitAddressSource",
        80
      );
      let submitAddressRawJson = undefined;
      if (body.submitAddressRawJson !== undefined) {
        if (body.submitAddressRawJson === null || body.submitAddressRawJson === "") {
          submitAddressRawJson = null;
        } else if (typeof body.submitAddressRawJson === "string") {
          submitAddressRawJson = truncateText(body.submitAddressRawJson, 4000);
        } else {
          submitAddressRawJson = truncateText(
            JSON.stringify(body.submitAddressRawJson),
            4000
          );
        }
      }
      const existingProfile = repo.getDefaultLocationProfile(id);
      const coordSystem = parseCoordSystemInput(
        body.coordSystem,
        existingProfile && existingProfile.coord_system ? existingProfile.coord_system : "auto"
      );
      const hasAddressUpdate =
        submitAddressText !== undefined ||
        submitAddressSource !== undefined ||
        submitAddressRawJson !== undefined;

      repo.upsertLocationProfile({
        user_id: id,
        name: "default",
        latitude,
        longitude,
        accuracy:
          accuracy === undefined
            ? Number(existingProfile && existingProfile.accuracy !== null
              ? existingProfile.accuracy
              : 30)
            : accuracy === null
              ? 30
              : accuracy,
        altitude:
          altitude === undefined
            ? (existingProfile ? existingProfile.altitude : null)
            : altitude,
        altitude_accuracy:
          altitudeAccuracy === undefined
            ? (existingProfile ? existingProfile.altitude_accuracy : null)
            : altitudeAccuracy,
        heading:
          heading === undefined ? (existingProfile ? existingProfile.heading : null) : heading,
        speed: speed === undefined ? (existingProfile ? existingProfile.speed : null) : speed,
        coord_system: coordSystem,
        submit_address_text:
          submitAddressText === undefined
            ? (existingProfile ? existingProfile.submit_address_text : null)
            : submitAddressText,
        submit_address_source:
          submitAddressSource === undefined
            ? (existingProfile ? existingProfile.submit_address_source : null)
            : submitAddressSource,
        submit_address_raw_json:
          submitAddressRawJson === undefined
            ? (existingProfile ? existingProfile.submit_address_raw_json : null)
            : submitAddressRawJson,
        submit_address_updated_at: hasAddressUpdate
          ? new Date().toISOString()
          : (existingProfile ? existingProfile.submit_address_updated_at : null),
        source: "web"
      });

      res.json({
        locationProfile: repo.getDefaultLocationProfile(id)
      });
    })
  );

  app.get(
    "/admin/checkin-users/:id/mappings",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      res.json({
        mappings: repo.listUserCheckinMapByCheckinUserId(checkinUserId)
      });
    })
  );

  app.post(
    "/admin/checkin-users/:id/mappings/:appUserId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      const appUserId = Number(req.params.appUserId);
      if (
        !Number.isFinite(checkinUserId) ||
        checkinUserId <= 0 ||
        !Number.isFinite(appUserId) ||
        appUserId <= 0
      ) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      const appUser = repo.getAppUserById(appUserId);
      if (!checkinUser || !appUser) {
        res.status(404).json({ error: "checkin user or app user not found" });
        return;
      }
      const existingMappings = repo.listUserCheckinMapByAppUserId(appUserId);
      const alreadyMapped = existingMappings.some(
        (row) => Number(row.checkin_user_id) === checkinUserId
      );
      if (!alreadyMapped) {
        const quota = getCheckinQuotaByAppUserId(appUserId);
        if (quota.limit !== null && quota.used >= quota.limit) {
          res.status(403).json({
            error: `checkin account limit reached (${quota.limit})`,
            quota
          });
          return;
        }
      }
      repo.createUserCheckinMap(appUserId, checkinUserId);
      res.json({
        ok: true,
        mappings: repo.listUserCheckinMapByCheckinUserId(checkinUserId)
      });
    })
  );

  app.delete(
    "/admin/checkin-users/:id/mappings/:appUserId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      const appUserId = Number(req.params.appUserId);
      if (
        !Number.isFinite(checkinUserId) ||
        checkinUserId <= 0 ||
        !Number.isFinite(appUserId) ||
        appUserId <= 0
      ) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      repo.removeUserCheckinMapByCheckinUserId(checkinUserId, appUserId);
      const boundChannel = repo.getNotificationChannelBindingByCheckinUserId(checkinUserId);
      if (
        boundChannel &&
        Number.isFinite(Number(boundChannel.app_user_id))
      ) {
        const channelOwnerId = Number(boundChannel.app_user_id);
        const adminOwnerId = getAdminChannelOwnerId();
        const isAdminOwnedChannel =
          Number.isFinite(adminOwnerId) &&
          adminOwnerId > 0 &&
          channelOwnerId === adminOwnerId;
        if (!isAdminOwnedChannel && !repo.isCheckinMappedToAppUser(checkinUserId, channelOwnerId)) {
          repo.updateCheckinUserNotificationChannel({
            id: checkinUserId,
            notification_channel_id: null
          });
        }
      }
      res.json({
        ok: true,
        mappings: repo.listUserCheckinMapByCheckinUserId(checkinUserId)
      });
    })
  );

  app.patch(
    "/admin/checkin-users/:id/notification-channel",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const channelIdRaw = readNotificationChannelIdFromBody(req.body);
      let channel = null;
      try {
        channel = validateNotificationChannelAccessForCheckinUser(
          checkinUserId,
          channelIdRaw === undefined || channelIdRaw === null || channelIdRaw === ""
            ? null
            : Number(channelIdRaw)
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      repo.updateCheckinUserNotificationChannel({
        id: checkinUserId,
        notification_channel_id: channel ? Number(channel.id) : null
      });
      const updated = repo.getUserById(checkinUserId);
      const location = repo.getDefaultLocationProfile(checkinUserId);
      const mappings = repo.listUserCheckinMapByCheckinUserId(checkinUserId);
      const authState = repo.getAuthStateByUserId(checkinUserId);
      const sharedStatus = getSharedStatusSnapshotByUserId(checkinUserId);
      const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(checkinUserId);
      const availableChannels =
        listAvailableNotificationChannelsForAdminCheckinUser(checkinUserId);
      res.json({
        checkinUser: sanitizeCheckinUser(
          updated,
          location,
          mappings,
          authState,
          sharedStatus,
          notificationBinding,
          availableChannels
        )
      });
    })
  );

  app.post(
    "/admin/checkin-users/:id/qr-login",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const session = await safeQrSessionManager.startSession(checkinUser, {
        forceRestart: true
      });
      res.json({ session });
    })
  );

  app.get(
    "/admin/qr-login-sessions/:sessionId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const qrImageVersion = Number(req.query.qrImageVersion);
      const session = safeQrSessionManager.getSession(String(req.params.sessionId || ""), {
        qrImageVersion: Number.isFinite(qrImageVersion) ? qrImageVersion : null
      });
      if (!session) {
        res.status(404).json({ error: "session not found" });
        return;
      }
      res.json({ session });
    })
  );

  app.get(
    "/admin/login-audits",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const rawLimit = Number(req.query.limit || 100);
      const safeLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
      res.json({
        logs: repo.listLoginAuditLogs(safeLimit)
      });
    })
  );

  app.get(
    "/admin/checkin-debug-mode",
    authRequired,
    adminRequired,
    asyncHandler(async (_req, res) => {
      res.json({
        enabled: isDebugModeEnabled()
      });
    })
  );

  app.patch(
    "/admin/checkin-debug-mode",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      let enabled = false;
      try {
        enabled = parseBooleanInput(req.body?.enabled, "enabled");
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      setDebugModeEnabled(enabled);
      res.json({ enabled });
    })
  );

  app.post(
    "/admin/checkin-users/:id/manual-run",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      if (!worker) {
        res.status(503).json({ error: "worker unavailable" });
        return;
      }
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const result = await worker.runUserCheckin(checkinUser, {
        force: true,
        ignoreCheckWindow: true,
        ignoreAlreadySignedToday: true,
        debugMode: false,
        captureDebugTrace: true,
        trigger: "admin_manual"
      });
      const latestLog = repo.getLatestCheckinLogByUserId(checkinUserId);
      res.json({
        result,
        latestLog
      });
    })
  );

  app.post(
    "/admin/checkin-users/:id/check-cookie",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      if (!worker) {
        res.status(503).json({ error: "worker unavailable" });
        return;
      }
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const result = await worker.checkCookieStatus(checkinUser, {
        notifyOnInvalid: true
      });
      saveSharedCookieStatus(checkinUserId, result);
      res.json({ result });
    })
  );

  app.post(
    "/admin/checkin-users/:id/check-checkin-status",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      if (!worker) {
        res.status(503).json({ error: "worker unavailable" });
        return;
      }
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const result = await worker.checkCheckinStatus(checkinUser);
      saveSharedCheckinStatus(checkinUserId, result);
      res.json({ result });
    })
  );

  app.get(
    "/admin/checkin-users/:id/logs",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const rawLimit = Number(req.query.limit || 15);
      const safeLimit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.floor(rawLimit), 1), 15)
        : 15;
      const logs = repo
        .listRecentCheckinLogsByUserId(checkinUserId, safeLimit)
        .map(sanitizeCheckinLog)
        .filter(Boolean);
      res.json({ logs });
    })
  );

  app.delete(
    "/admin/checkin-users/:id/logs",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const result = repo.clearCheckinLogsByUserId(checkinUserId);
      res.json({
        deleted: Number(result && result.changes ? result.changes : 0)
      });
    })
  );

  app.get(
    "/admin/checkin-users/:id/logs/:logId",
    authRequired,
    adminRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      const logId = Number(req.params.logId);
      if (
        !Number.isFinite(checkinUserId) ||
        checkinUserId <= 0 ||
        !Number.isFinite(logId) ||
        logId <= 0
      ) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      const row = repo.getCheckinLogById(checkinUserId, logId);
      if (!row) {
        res.status(404).json({ error: "log not found" });
        return;
      }
      res.json({
        log: sanitizeCheckinLog(row, {
          includeRawResult: true
        })
      });
    })
  );

  app.get(
    "/user/notification-channels",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/users/:id/notification-channels" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(401).json({ error: "invalid user token" });
        return;
      }
      const user = repo.getAppUserById(appUserId);
      if (!user) {
        res.status(404).json({ error: "user not found" });
        return;
      }
      const includeSecret =
        String(req.query && req.query.includeSecret ? req.query.includeSecret : "")
          .trim()
          .toLowerCase() === "1";
      const channels = repo
        .listNotificationChannelsByAppUserId(appUserId)
        .map((item) => sanitizeNotificationChannel(item, { includeSecret }))
        .filter(Boolean);
      res.json({ channels });
    })
  );

  app.patch(
    "/user/password",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use .env admin password management" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(401).json({ error: "invalid user token" });
        return;
      }
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "currentPassword and newPassword required" });
        return;
      }
      if (newPassword.length < 6) {
        res.status(400).json({ error: "new password too short" });
        return;
      }
      const user = repo.getAppUserById(appUserId);
      if (!user) {
        res.status(404).json({ error: "user not found" });
        return;
      }
      const ok = await verifyPassword(user.password_hash, currentPassword);
      if (!ok) {
        res.status(401).json({ error: "current password invalid" });
        return;
      }
      if (currentPassword === newPassword) {
        res.status(400).json({ error: "new password should be different" });
        return;
      }
      const passwordHash = await hashPassword(newPassword);
      repo.updateAppUserById(appUserId, {
        password_hash: passwordHash
      });
      res.json({ ok: true });
    })
  );

  app.post(
    "/user/notification-channels",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/users/:id/notification-channels" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(401).json({ error: "invalid user token" });
        return;
      }
      let payload = null;
      try {
        payload = parseNotificationChannelPayload(req.body || {}, {
          requireDeviceKey: true,
          defaultEnabled: true
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (hasNotificationChannelNameConflict(appUserId, payload.name)) {
        res.status(409).json({ error: "notification channel name already exists in this account" });
        return;
      }
      try {
        const inserted = repo.createNotificationChannel({
          app_user_id: appUserId,
          ...payload
        });
        const created = repo.getNotificationChannelById(inserted.lastInsertRowid);
        res.status(201).json({
          channel: sanitizeNotificationChannel(created)
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "notification channel name already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.patch(
    "/user/notification-channels/:id",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/users/:id/notification-channels/:channelId" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      const channelId = Number(req.params.id);
      if (!Number.isFinite(appUserId) || appUserId <= 0 || !Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing || Number(existing.app_user_id) !== appUserId) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      let payload = null;
      try {
        payload = parseNotificationChannelPayload(
          {
            ...existing,
            ...req.body
          },
          {
            requireDeviceKey: false,
            defaultEnabled: Number(existing.enabled) === 1
          }
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (hasNotificationChannelNameConflict(appUserId, payload.name, channelId)) {
        res.status(409).json({ error: "notification channel name already exists in this account" });
        return;
      }
      try {
        repo.updateNotificationChannel({
          id: channelId,
          app_user_id: appUserId,
          name: payload.name,
          provider: payload.provider,
          bark_server_url: payload.bark_server_url,
          bark_device_key:
            hasNotificationSecretField(req.body)
              ? payload.bark_device_key
              : null,
          enabled: payload.enabled,
          extra_json: payload.extra_json
        });
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "notification channel name already exists in this account" });
          return;
        }
        throw error;
      }
      const updated = repo.getNotificationChannelById(channelId);
      res.json({
        channel: sanitizeNotificationChannel(updated)
      });
    })
  );

  app.delete(
    "/user/notification-channels/:id",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/users/:id/notification-channels/:channelId" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      const channelId = Number(req.params.id);
      if (!Number.isFinite(appUserId) || appUserId <= 0 || !Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing || Number(existing.app_user_id) !== appUserId) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      repo.clearCheckinUserNotificationChannelByChannelId(channelId);
      repo.deleteNotificationChannel(channelId, appUserId);
      res.json({ ok: true });
    })
  );

  app.post(
    "/user/notification-channels/:id/test",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/notification-channels/:channelId/test" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      const channelId = Number(req.params.id);
      if (!Number.isFinite(appUserId) || appUserId <= 0 || !Number.isFinite(channelId) || channelId <= 0) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const existing = repo.getNotificationChannelById(channelId);
      if (!existing || Number(existing.app_user_id) !== appUserId) {
        res.status(404).json({ error: "notification channel not found" });
        return;
      }
      try {
        const result = await sendNotificationChannelTest(existing, {
          operator: req.auth.username || `user#${appUserId}`
        });
        res.json({ ok: true, result });
      } catch (error) {
        res.status(502).json({ error: "test notification failed: " + String(error.message || "unknown error") });
      }
    })
  );

  app.post(
    "/user/checkin-users",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/checkin-users" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(401).json({ error: "invalid user token" });
        return;
      }
      const appUser = repo.getAppUserById(appUserId);
      if (!appUser || appUser.status !== "active") {
        res.status(403).json({ error: "user disabled or not found" });
        return;
      }

      const quota = getCheckinQuotaByAppUserId(appUserId);
      if (quota.limit !== null && quota.used >= quota.limit) {
        res.status(403).json({
          error: `checkin account limit reached (${quota.limit})`,
          quota
        });
        return;
      }

      try {
        const checkinUser = createCheckinUserByPayload(req.body || {}, {
          ownerAppUserId: appUserId,
          source: "web-user"
        });
        const latestQuota = getCheckinQuotaByAppUserId(appUserId);
        res.status(201).json({
          checkinUser,
          quota: latestQuota
        });
      } catch (error) {
        if (String(error.message).startsWith("invalid ")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("displayName required")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("unsupported ua profile")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("latitude and longitude")) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (String(error.message).includes("UNIQUE")) {
          res.status(409).json({ error: "user_key already exists" });
          return;
        }
        throw error;
      }
    })
  );

  app.get(
    "/user/checkin-users",
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth.role === "admin") {
        res.json({
          checkinUsers: listCheckinUsersForAdmin(),
          quota: null
        });
        return;
      }
      const appUserId = Number(req.auth.sub);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(401).json({ error: "invalid user token" });
        return;
      }
      const checkinUsers = listCheckinUsersForAppUser(appUserId);
      const quota = getCheckinQuotaByAppUserId(appUserId);
      res.json({ checkinUsers, quota });
    })
  );

  app.post(
    "/user/checkin-users/:id/location",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const body = req.body || {};
      const latitude = parseRequiredNumberInput(body.latitude, "latitude");
      const longitude = parseRequiredNumberInput(body.longitude, "longitude");
      const accuracy = parseNullableNumberInput(body.accuracy, "accuracy");
      const altitude = parseNullableNumberInput(body.altitude, "altitude");
      const altitudeAccuracy = parseNullableNumberInput(body.altitudeAccuracy, "altitudeAccuracy");
      const heading = parseNullableNumberInput(body.heading, "heading");
      const speed = parseNullableNumberInput(body.speed, "speed");
      const submitAddressText = parseNullableTextInput(
        body.submitAddressText,
        "submitAddressText",
        180
      );
      const submitAddressSource = parseNullableTextInput(
        body.submitAddressSource,
        "submitAddressSource",
        80
      );
      let submitAddressRawJson = undefined;
      if (body.submitAddressRawJson !== undefined) {
        if (body.submitAddressRawJson === null || body.submitAddressRawJson === "") {
          submitAddressRawJson = null;
        } else if (typeof body.submitAddressRawJson === "string") {
          submitAddressRawJson = truncateText(body.submitAddressRawJson, 4000);
        } else {
          submitAddressRawJson = truncateText(
            JSON.stringify(body.submitAddressRawJson),
            4000
          );
        }
      }
      const existingProfile = repo.getDefaultLocationProfile(checkinUserId);
      const coordSystem = parseCoordSystemInput(
        body.coordSystem,
        existingProfile && existingProfile.coord_system ? existingProfile.coord_system : "auto"
      );
      const hasAddressUpdate =
        submitAddressText !== undefined ||
        submitAddressSource !== undefined ||
        submitAddressRawJson !== undefined;

      repo.upsertLocationProfile({
        user_id: checkinUserId,
        name: "default",
        latitude,
        longitude,
        accuracy:
          accuracy === undefined
            ? Number(existingProfile && existingProfile.accuracy !== null
              ? existingProfile.accuracy
              : 30)
            : accuracy === null
              ? 30
              : accuracy,
        altitude:
          altitude === undefined
            ? (existingProfile ? existingProfile.altitude : null)
            : altitude,
        altitude_accuracy:
          altitudeAccuracy === undefined
            ? (existingProfile ? existingProfile.altitude_accuracy : null)
            : altitudeAccuracy,
        heading:
          heading === undefined ? (existingProfile ? existingProfile.heading : null) : heading,
        speed: speed === undefined ? (existingProfile ? existingProfile.speed : null) : speed,
        coord_system: coordSystem,
        submit_address_text:
          submitAddressText === undefined
            ? (existingProfile ? existingProfile.submit_address_text : null)
            : submitAddressText,
        submit_address_source:
          submitAddressSource === undefined
            ? (existingProfile ? existingProfile.submit_address_source : null)
            : submitAddressSource,
        submit_address_raw_json:
          submitAddressRawJson === undefined
            ? (existingProfile ? existingProfile.submit_address_raw_json : null)
            : submitAddressRawJson,
        submit_address_updated_at: hasAddressUpdate
          ? new Date().toISOString()
          : (existingProfile ? existingProfile.submit_address_updated_at : null),
        source: req.auth.role === "admin" ? "web-admin" : "web-user"
      });

      res.json({
        locationProfile: repo.getDefaultLocationProfile(checkinUserId)
      });
    })
  );

  app.patch(
    "/user/checkin-users/:id/schedule",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const body = req.body || {};
      let existingWarningTimeNormalized = "23:00";
      try {
        existingWarningTimeNormalized = normalizeWarningTimeInput(
          checkinUser.warning_time,
          "23:00"
        );
      } catch (_error) {
        existingWarningTimeNormalized = "23:00";
      }
      const nextCronExpr =
        body.cronExpr === undefined
          ? String(checkinUser.cron_expr || "").trim()
          : String(body.cronExpr || "").trim();
      if (!nextCronExpr) {
        res.status(400).json({ error: "invalid cronExpr" });
        return;
      }
      let nextWarningTime = existingWarningTimeNormalized;
      try {
        nextWarningTime =
          body.warningTime === undefined
            ? existingWarningTimeNormalized
            : normalizeWarningTimeInput(body.warningTime, existingWarningTimeNormalized);
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      repo.updateCheckinUserBase({
        id: checkinUserId,
        display_name: checkinUser.display_name,
        enabled: Number(checkinUser.enabled) === 1 ? 1 : 0,
        debug_mode: Number(checkinUser.debug_mode) === 1 ? 1 : 0,
        cron_expr: nextCronExpr,
        timezone: checkinUser.timezone,
        target_url: checkinUser.target_url,
        user_agent: checkinUser.user_agent,
        checkin_button_text: checkinUser.checkin_button_text,
        signed_marker_text: checkinUser.signed_marker_text,
        location_refresh_text: checkinUser.location_refresh_text,
        radio_option_text: checkinUser.radio_option_text,
        warning_time: nextWarningTime,
        auto_checkin_pause_until: checkinUser.auto_checkin_pause_until,
        notification_channel_id:
          checkinUser.notification_channel_id === null ||
          checkinUser.notification_channel_id === undefined
            ? null
            : Number(checkinUser.notification_channel_id)
      });
      const updated = repo.getUserById(checkinUserId);
      const location = repo.getDefaultLocationProfile(checkinUserId);
      const mappings = repo.listUserCheckinMapByCheckinUserId(checkinUserId);
      const authState = repo.getAuthStateByUserId(checkinUserId);
      const sharedStatus = getSharedStatusSnapshotByUserId(checkinUserId);
      const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(checkinUserId);
      const availableChannels =
        req.auth.role === "admin"
          ? listAvailableNotificationChannelsForAdminCheckinUser(checkinUserId)
          : repo.listNotificationChannelsByAppUserId(Number(req.auth.sub));
      res.json({
        checkinUser: sanitizeCheckinUser(
          updated,
          location,
          mappings,
          authState,
          sharedStatus,
          notificationBinding,
          availableChannels
        )
      });
    })
  );

  app.patch(
    "/user/checkin-users/:id/auto-checkin-pause",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      let pauseUntilDate = null;
      try {
        pauseUntilDate = normalizeDateOnlyInput(
          req.body ? req.body.pauseUntilDate : undefined,
          "pauseUntilDate",
          checkinUser.auto_checkin_pause_until || null
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      repo.updateCheckinUserAutoPause({
        id: checkinUserId,
        auto_checkin_pause_until: pauseUntilDate
      });
      const updated = repo.getUserById(checkinUserId);
      const location = repo.getDefaultLocationProfile(checkinUserId);
      const mappings = repo.listUserCheckinMapByCheckinUserId(checkinUserId);
      const authState = repo.getAuthStateByUserId(checkinUserId);
      const sharedStatus = getSharedStatusSnapshotByUserId(checkinUserId);
      const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(checkinUserId);
      const availableChannels =
        req.auth.role === "admin"
          ? listAvailableNotificationChannelsForAdminCheckinUser(checkinUserId)
          : repo.listNotificationChannelsByAppUserId(Number(req.auth.sub));
      res.json({
        checkinUser: sanitizeCheckinUser(
          updated,
          location,
          mappings,
          authState,
          sharedStatus,
          notificationBinding,
          availableChannels
        )
      });
    })
  );

  app.patch(
    "/user/checkin-users/:id/notification-channel",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      if (req.auth.role === "admin") {
        res.status(403).json({ error: "admin should use /admin/checkin-users/:id/notification-channel" });
        return;
      }
      const appUserId = Number(req.auth.sub);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        res.status(401).json({ error: "invalid user token" });
        return;
      }
      const channelIdRaw = readNotificationChannelIdFromBody(req.body);
      let channel = null;
      try {
        channel = validateNotificationChannelAccessForCheckinUser(
          checkinUserId,
          channelIdRaw === undefined || channelIdRaw === null || channelIdRaw === ""
            ? null
            : Number(channelIdRaw),
          { restrictAppUserId: appUserId }
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      repo.updateCheckinUserNotificationChannel({
        id: checkinUserId,
        notification_channel_id: channel ? Number(channel.id) : null
      });
      const updated = repo.getUserById(checkinUserId);
      const location = repo.getDefaultLocationProfile(checkinUserId);
      const mappings = repo.listUserCheckinMapByCheckinUserId(checkinUserId);
      const authState = repo.getAuthStateByUserId(checkinUserId);
      const sharedStatus = getSharedStatusSnapshotByUserId(checkinUserId);
      const notificationBinding = repo.getNotificationChannelBindingByCheckinUserId(checkinUserId);
      const availableChannels = repo.listNotificationChannelsByAppUserId(appUserId);
      res.json({
        checkinUser: sanitizeCheckinUser(
          updated,
          location,
          mappings,
          authState,
          sharedStatus,
          notificationBinding,
          availableChannels
        )
      });
    })
  );

  app.post(
    "/user/checkin-users/:id/qr-login",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const session = await safeQrSessionManager.startSession(checkinUser, {
        forceRestart: true
      });
      res.json({ session });
    })
  );

  app.post(
    "/user/checkin-users/:id/manual-run",
    authRequired,
    asyncHandler(async (req, res) => {
      if (!worker) {
        res.status(503).json({ error: "worker unavailable" });
        return;
      }
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const result = await worker.runUserCheckin(checkinUser, {
        force: true,
        ignoreCheckWindow: true,
        ignoreAlreadySignedToday: true,
        debugMode: false,
        captureDebugTrace: true,
        trigger: "user_manual"
      });
      const latestLog = repo.getLatestCheckinLogByUserId(checkinUserId);
      res.json({
        result,
        latestLog
      });
    })
  );

  app.post(
    "/user/checkin-users/:id/check-cookie",
    authRequired,
    asyncHandler(async (req, res) => {
      if (!worker) {
        res.status(503).json({ error: "worker unavailable" });
        return;
      }
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const result = await worker.checkCookieStatus(checkinUser, {
        notifyOnInvalid: true
      });
      saveSharedCookieStatus(checkinUserId, result);
      res.json({ result });
    })
  );

  app.post(
    "/user/checkin-users/:id/check-checkin-status",
    authRequired,
    asyncHandler(async (req, res) => {
      if (!worker) {
        res.status(503).json({ error: "worker unavailable" });
        return;
      }
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const result = await worker.checkCheckinStatus(checkinUser);
      saveSharedCheckinStatus(checkinUserId, result);
      res.json({ result });
    })
  );

  app.get(
    "/user/checkin-users/:id/logs",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const rawLimit = Number(req.query.limit || 15);
      const safeLimit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.floor(rawLimit), 1), 15)
        : 15;
      const logs = repo
        .listRecentCheckinLogsByUserId(checkinUserId, safeLimit)
        .map(sanitizeCheckinLog)
        .filter(Boolean);
      res.json({ logs });
    })
  );

  app.delete(
    "/user/checkin-users/:id/logs",
    authRequired,
    asyncHandler(async (req, res) => {
      const checkinUserId = Number(req.params.id);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        res.status(400).json({ error: "invalid checkin user id" });
        return;
      }
      const checkinUser = repo.getUserById(checkinUserId);
      if (!checkinUser) {
        res.status(404).json({ error: "checkin user not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, checkinUserId)) {
        res.status(403).json({ error: "no permission for this checkin user" });
        return;
      }
      const result = repo.clearCheckinLogsByUserId(checkinUserId);
      res.json({
        deleted: Number(result && result.changes ? result.changes : 0)
      });
    })
  );

  app.get(
    "/user/qr-login-sessions/:sessionId",
    authRequired,
    asyncHandler(async (req, res) => {
      const qrImageVersion = Number(req.query.qrImageVersion);
      const session = safeQrSessionManager.getSession(String(req.params.sessionId || ""), {
        qrImageVersion: Number.isFinite(qrImageVersion) ? qrImageVersion : null
      });
      if (!session) {
        res.status(404).json({ error: "session not found" });
        return;
      }
      if (!canAccessCheckinUser(req.auth, Number(session.userId))) {
        res.status(403).json({ error: "no permission for this session" });
        return;
      }
      res.json({ session });
    })
  );

  app.use((error, _req, res, _next) => {
    logger.error("http server error", { error: error.message });
    res.status(500).json({ error: "internal server error" });
  });

  let server = null;
  let wsServer = null;
  let wsUnsubscribe = null;
  let wsHeartbeatTimer = null;
  const wsClients = new Set();
  const WS_OPEN = 1;
  const WS_HEARTBEAT_INTERVAL_MS = 25000;

  function closeUpgradeSocket(socket, statusCode, reason) {
    try {
      socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\n\r\n`);
    } catch (_error) {
      // ignore
    }
    socket.destroy();
  }

  function buildWsSessionSignature(session) {
    return [
      session.id || "",
      session.status || "",
      session.message || "",
      session.done ? "1" : "0",
      Number.isFinite(Number(session.qrImageVersion)) ? Number(session.qrImageVersion) : -1
    ].join("|");
  }

  function sendWsSession(client, options = {}) {
    const force = Boolean(options.force);
    const session = safeQrSessionManager.getSession(client.sessionId, {
      qrImageVersion: Number.isFinite(client.lastQrImageVersion)
        ? client.lastQrImageVersion
        : null
    });
    if (!session) {
      if (client.socket.readyState === WS_OPEN) {
        client.socket.send(JSON.stringify({ error: "session not found" }));
      }
      client.socket.close();
      return;
    }
    if (session.qrImageDataUrl && Number.isFinite(Number(session.qrImageVersion))) {
      client.lastQrImageVersion = Number(session.qrImageVersion);
    }
    const signature = buildWsSessionSignature(session);
    if (!force && signature === client.lastSentSignature) {
      return;
    }
    if (client.socket.readyState === WS_OPEN) {
      client.socket.send(JSON.stringify({ session }));
      client.lastSentSignature = signature;
    }
  }

  function setupWebSocketUpgrade() {
    wsServer = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
      clientTracking: false
    });
    wsUnsubscribe = safeQrSessionManager.onSessionUpdate(({ sessionId }) => {
      for (const client of wsClients) {
        if (client.sessionId !== sessionId) {
          continue;
        }
        sendWsSession(client);
      }
    });
    wsHeartbeatTimer = setInterval(() => {
      for (const client of wsClients) {
        if (client.socket.readyState !== WS_OPEN) {
          wsClients.delete(client);
          continue;
        }
        if (!client.alive) {
          try {
            client.socket.terminate();
          } catch (_error) {
            // ignore
          }
          wsClients.delete(client);
          continue;
        }
        client.alive = false;
        try {
          client.socket.ping();
        } catch (_error) {
          wsClients.delete(client);
        }
      }
    }, WS_HEARTBEAT_INTERVAL_MS);
    if (typeof wsHeartbeatTimer.unref === "function") {
      wsHeartbeatTimer.unref();
    }

    server.on("upgrade", (req, socket, head) => {
      let parsed = null;
      try {
        parsed = new URL(req.url || "", `http://127.0.0.1:${config.authHttpPort}`);
      } catch (_error) {
        closeUpgradeSocket(socket, 400, "Bad Request");
        return;
      }
      if (parsed.pathname !== "/ws/qr-login") {
        closeUpgradeSocket(socket, 404, "Not Found");
        return;
      }

      const token = String(parsed.searchParams.get("token") || "");
      const sessionId = String(parsed.searchParams.get("sessionId") || "");
      const lastQrImageVersion = Number(parsed.searchParams.get("qrImageVersion"));
      if (!token || !sessionId) {
        closeUpgradeSocket(socket, 400, "Bad Request");
        return;
      }

      let auth = null;
      try {
        auth = jwtService.verify(token);
      } catch (_error) {
        closeUpgradeSocket(socket, 401, "Unauthorized");
        return;
      }

      const session = safeQrSessionManager.getSession(sessionId, {
        qrImageVersion: Number.isFinite(lastQrImageVersion) ? lastQrImageVersion : null
      });
      if (!session) {
        closeUpgradeSocket(socket, 404, "Not Found");
        return;
      }
      if (
        auth.role !== "admin" &&
        !canAccessCheckinUser(auth, Number(session.userId))
      ) {
        closeUpgradeSocket(socket, 403, "Forbidden");
        return;
      }

      wsServer.handleUpgrade(req, socket, head, (ws) => {
        const client = {
          socket: ws,
          sessionId,
          lastQrImageVersion: Number.isFinite(lastQrImageVersion)
            ? lastQrImageVersion
            : 0,
          lastSentSignature: "",
          alive: true
        };
        wsClients.add(client);
        ws.on("pong", () => {
          client.alive = true;
        });
        ws.on("close", () => {
          wsClients.delete(client);
        });
        ws.on("error", () => {
          wsClients.delete(client);
        });
        sendWsSession(client, { force: true });
      });
    });
  }

  return {
    async start() {
      await new Promise((resolve) => {
        server = app.listen(config.authHttpPort, () => {
          logger.info("auth http server started", {
            port: config.authHttpPort
          });
          resolve();
        });
      });
      setupWebSocketUpgrade();
    },
    async stop() {
      if (wsUnsubscribe) {
        wsUnsubscribe();
        wsUnsubscribe = null;
      }
      for (const client of wsClients) {
        try {
          client.socket.close();
        } catch (_error) {
          // ignore
        }
      }
      wsClients.clear();
      if (wsHeartbeatTimer) {
        clearInterval(wsHeartbeatTimer);
        wsHeartbeatTimer = null;
      }
      if (wsServer) {
        wsServer.close();
        wsServer = null;
      }
      if (!server) {
        return;
      }
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }
  };
}

module.exports = {
  createAuthHttpServer
};
