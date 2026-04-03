(function initUserPage() {
  const $ = (id) => document.getElementById(id);
  const tbody = document.querySelector("#checkinTable tbody");
  const createCheckinForm = $("createCheckinForm");
  const btnCreateCheckin = $("btnCreateCheckin");
  const btnRefreshCookieStatusAll = $("btnRefreshCookieStatusAll");
  const createNotifyChannelForm = $("createNotifyChannelForm");
  const btnCreateNotifyChannel = $("btnCreateNotifyChannel");
  const btnNotifyBarkCopy = $("btnNotifyBarkCopy");
  const notifyChannelProvider = $("notifyChannelProvider");
  const notifyChannelKeyLabel = $("notifyChannelKeyLabel");
  const notifyChannelServerLabel = $("notifyChannelServerLabel");
  const notifyChannelsTableBody = document.querySelector("#notifyChannelsTable tbody");
  const notifyAdminHint = $("notifyAdminHint");
  const notifyCreateCard = $("notifyCreateCard");
  const quotaText = $("quotaText");
  const menuItems = Array.from(document.querySelectorAll(".menu-item[data-menu-target]"));
  const sectionPanels = Array.from(document.querySelectorAll(".section-panel"));
  const sidebar = $("userSidebar");
  const sidebarBackdrop = $("userSidebarBackdrop");
  const btnMenuToggle = $("btnMenuToggle");
  const mapPickerModal = $("mapPickerModal");
  const btnMapPickerClose = $("btnMapPickerClose");
  const btnMapSearch = $("btnMapSearch");
  const btnMapCenterCurrent = $("btnMapCenterCurrent");
  const btnMapClearOptional = $("btnMapClearOptional");
  const btnMapSave = $("btnMapSave");
  const mapFingerprintDetails = $("mapFingerprintDetails");
  const mapSearchKeyword = $("mapSearchKeyword");
  const mapPickerCanvasWrap = $("mapPickerCanvasWrap");
  const mapTargetUserHint = $("mapTargetUserHint");
  const mapLatInput = $("mapLatInput");
  const mapLngInput = $("mapLngInput");
  const mapCoordSystem = $("mapCoordSystem");
  const mapAccuracyInput = $("mapAccuracyInput");
  const mapSubmitAddressText = $("mapSubmitAddressText");
  const mapAddressSource = $("mapAddressSource");
  const mapAltitudeInput = $("mapAltitudeInput");
  const mapAltitudeAccuracyInput = $("mapAltitudeAccuracyInput");
  const mapHeadingInput = $("mapHeadingInput");
  const mapSpeedInput = $("mapSpeedInput");
  const mapPickerTip = $("mapPickerTip");
  const logModal = $("logModal");
  const btnLogModalClose = $("btnLogModalClose");
  const btnLogClear = $("btnLogClear");
  const btnLogRefresh = $("btnLogRefresh");
  const logModalHint = $("logModalHint");
  const logTableBody = document.querySelector("#logTable tbody");
  const notifyBindModal = $("notifyBindModal");
  const btnNotifyBindClose = $("btnNotifyBindClose");
  const btnNotifyBindSave = $("btnNotifyBindSave");
  const notifyBindHint = $("notifyBindHint");
  const notifyBindSelect = $("notifyBindSelect");
  const changePasswordModal = $("changePasswordModal");
  const btnChangePasswordClose = $("btnChangePasswordClose");
  const btnChangePasswordSave = $("btnChangePasswordSave");
  const autoPauseModal = $("autoPauseModal");
  const btnAutoPauseClose = $("btnAutoPauseClose");
  const btnAutoPauseSave = $("btnAutoPauseSave");
  const btnAutoPauseClear = $("btnAutoPauseClear");
  const autoPauseHint = $("autoPauseHint");
  const autoPauseUntilDate = $("autoPauseUntilDate");
  const autoPauseWeekday = $("autoPauseWeekday");
  const timeSettingsModal = $("timeSettingsModal");
  const btnTimeSettingsClose = $("btnTimeSettingsClose");
  const btnTimeSettingsSave = $("btnTimeSettingsSave");
  const timeSettingsHint = $("timeSettingsHint");
  const timeSettingsCheckinTime = $("timeSettingsCheckinTime");
  const timeSettingsWarningTime = $("timeSettingsWarningTime");
  let checkinUsers = [];
  let notificationChannels = [];
  let currentQuota = null;
  let qrPollTimer = null;
  let qrPollInFlight = false;
  let qrPollErrorCount = 0;
  let currentQrImageVersion = 0;
  let currentQrSessionId = "";
  let currentQrCheckinUserId = null;
  let qrRefreshInFlight = false;
  let lastManualQrRefreshAt = 0;
  let qrWs = null;
  let qrWsConnected = false;
  let currentQrDone = false;
  let qrWsReconnectTimer = null;
  let qrWsReconnectAttempts = 0;
  let runtimeConfig = null;
  let amapSdkPromise = null;
  let leafletSdkPromise = null;
  let mapPickerMap = null;
  let mapPickerMarker = null;
  let mapPickerPlaceSearch = null;
  let mapPickerTargetUser = null;
  let mapPickerAvailable = true;
  let mapPickerProvider = "";
  let logTargetCheckinUserId = null;
  let logTargetCheckinUserLabel = "";
  let notifyBindTargetCheckinUserId = null;
  let currentUserRole = "";
  let currentUsername = "";
  let currentPanelId = "user-panel-profile";
  let notifyChannelEditingById = {};
  let messageHideTimer = null;
  let autoPauseTargetCheckinUserId = null;
  let timeSettingsTargetCheckinUserId = null;
  const QR_WS_RECONNECT_MAX = 10;
  const QR_WS_RECONNECT_BASE_MS = 700;
  const COOKIE_STATUS_CACHE_KEY = "dailyflow.user.cookieStatus.v1";
  const CHECKIN_STATUS_CACHE_KEY = "dailyflow.user.checkinStatus.v1";
  const ACTION_COOLDOWN_MS = 900;
  let cookieStatusByUserId = loadCookieStatusCache();
  let checkinStatusByUserId = loadCheckinStatusCache();
  const actionLocks = new Set();
  const actionLastTriggerAt = new Map();
  const AUTO_CHECKIN_JITTER_HINT = "实际执行会在设定时间前后 ±5 分钟内波动。";

  function loadCookieStatusCache() {
    try {
      const raw = localStorage.getItem(COOKIE_STATUS_CACHE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function persistCookieStatusCache() {
    try {
      localStorage.setItem(COOKIE_STATUS_CACHE_KEY, JSON.stringify(cookieStatusByUserId));
    } catch (_error) {
      // ignore localStorage failure
    }
  }

  function loadCheckinStatusCache() {
    try {
      const raw = localStorage.getItem(CHECKIN_STATUS_CACHE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function persistCheckinStatusCache() {
    try {
      localStorage.setItem(CHECKIN_STATUS_CACHE_KEY, JSON.stringify(checkinStatusByUserId));
    } catch (_error) {
      // ignore localStorage failure
    }
  }

  function normalizeCookieStatusResult(result) {
    const nowIso = new Date().toISOString();
    const r = result && typeof result === "object" ? result : {};
    return {
      ok: Boolean(r.ok),
      status: String(r.status || "unknown"),
      message: String(r.message || ""),
      finalUrl: String(r.finalUrl || ""),
      checkedAt: String(r.checkedAt || nowIso)
    };
  }

  function normalizeCheckinStatusResult(result) {
    const nowIso = new Date().toISOString();
    const r = result && typeof result === "object" ? result : {};
    const checkWindow = r.checkWindow && typeof r.checkWindow === "object" ? r.checkWindow : {};
    return {
      ok: Boolean(r.ok),
      status: String(r.status || "unknown"),
      message: String(r.message || ""),
      checkedAt: String(r.checkedAt || nowIso),
      checkWindowCurrentHHmm: String(checkWindow.currentHHmm || "")
    };
  }

  function updateCookieStatus(userId, result) {
    const key = String(userId || "");
    if (!key) {
      return;
    }
    cookieStatusByUserId[key] = normalizeCookieStatusResult(result);
    persistCookieStatusCache();
  }

  function updateCheckinStatus(userId, result) {
    const key = String(userId || "");
    if (!key) {
      return;
    }
    checkinStatusByUserId[key] = normalizeCheckinStatusResult(result);
    persistCheckinStatusCache();
  }

  function pruneCookieStatusCache(rows) {
    const valid = new Set((rows || []).map((row) => String(row.id)));
    let changed = false;
    for (const key of Object.keys(cookieStatusByUserId)) {
      if (!valid.has(key)) {
        delete cookieStatusByUserId[key];
        changed = true;
      }
    }
    if (changed) {
      persistCookieStatusCache();
    }
  }

  function pruneCheckinStatusCache(rows) {
    const valid = new Set((rows || []).map((row) => String(row.id)));
    let changed = false;
    for (const key of Object.keys(checkinStatusByUserId)) {
      if (!valid.has(key)) {
        delete checkinStatusByUserId[key];
        changed = true;
      }
    }
    if (changed) {
      persistCheckinStatusCache();
    }
  }

  function syncStatusCacheFromServerRows(rows) {
    let cookieChanged = false;
    let checkinChanged = false;
    for (const row of rows || []) {
      const id = String(row && row.id ? row.id : "");
      if (!id) {
        continue;
      }
      if (row.cookieStatus && typeof row.cookieStatus === "object") {
        cookieStatusByUserId[id] = normalizeCookieStatusResult(row.cookieStatus);
        cookieChanged = true;
      } else if (cookieStatusByUserId[id]) {
        delete cookieStatusByUserId[id];
        cookieChanged = true;
      }
      if (row.checkinStatus && typeof row.checkinStatus === "object") {
        checkinStatusByUserId[id] = normalizeCheckinStatusResult(row.checkinStatus);
        checkinChanged = true;
      } else if (checkinStatusByUserId[id]) {
        delete checkinStatusByUserId[id];
        checkinChanged = true;
      }
    }
    if (cookieChanged) {
      persistCookieStatusCache();
    }
    if (checkinChanged) {
      persistCheckinStatusCache();
    }
  }

  function statusLabelZh(status) {
    const key = String(status || "").trim().toLowerCase();
    const map = {
      waiting_scan: "等待扫码",
      starting: "启动中",
      scanning: "扫码中",
      success: "成功",
      failed: "失败",
      timeout: "超时",
      valid: "有效",
      invalid: "无效",
      expired: "已过期",
      missing: "缺失",
      invalid_state: "状态异常",
      error: "错误",
      running: "执行中",
      active: "启用",
      disabled: "禁用",
      inactive: "禁用",
      lifetime: "不设有效期",
      unknown: "未知"
    };
    return map[key] || (status ? String(status) : "未知");
  }

  function cookieStatusLabel(status) {
    const key = String(status || "").trim().toLowerCase();
    const map = {
      valid: "有效",
      expired: "已过期",
      missing: "缺失",
      invalid_state: "状态异常",
      error: "错误",
      unknown: "未知"
    };
    return map[key] || statusLabelZh(key);
  }

  function qrSessionStatusLabel(status) {
    const key = String(status || "").trim().toLowerCase();
    const map = {
      waiting_scan: "等待扫码",
      starting: "启动中",
      success: "成功",
      failed: "失败",
      timeout: "超时",
      unknown: "未知"
    };
    return map[key] || statusLabelZh(key);
  }

  function normalizeNotifyProvider(provider) {
    const key = String(provider || "bark")
      .trim()
      .toLowerCase();
    return key === "serverchan" ? "serverchan" : "bark";
  }

  const SERVERCHAN_FORWARD_URL = "https://sct.ftqq.com/forward";
  const SERVERCHAN_SEND_API_BASE = "https://sctapi.ftqq.com";
  const SERVERCHAN_SENDKEY_RE = /^SCT[A-Za-z0-9]{6,}$/i;

  function normalizeServerChanForwardUrlInput(rawUrl, fieldName = "Server酱地址") {
    const text = String(rawUrl || "").trim();
    if (!text) {
      return "";
    }
    let parsed = null;
    try {
      parsed = new URL(text);
    } catch (_error) {
      throw new Error(
        `${fieldName}仅支持 ${SERVERCHAN_FORWARD_URL} 或 ${SERVERCHAN_SEND_API_BASE}/{SendKey}.send`
      );
    }
    const protocol = String(parsed.protocol || "").toLowerCase();
    const host = String(parsed.host || "").toLowerCase();
    const pathname = String(parsed.pathname || "").replace(/\/+$/, "");
    if (protocol !== "https:") {
      throw new Error(
        `${fieldName}仅支持 ${SERVERCHAN_FORWARD_URL} 或 ${SERVERCHAN_SEND_API_BASE}/{SendKey}.send`
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
      `${fieldName}仅支持 ${SERVERCHAN_FORWARD_URL} 或 ${SERVERCHAN_SEND_API_BASE}/{SendKey}.send`
    );
  }

  function parseServerChanSendKeyFromForwardUrl(rawUrl) {
    const normalized = normalizeServerChanForwardUrlInput(rawUrl, "Server酱链接");
    const parsed = new URL(String(rawUrl || "").trim());
    const sendKey =
      normalized === SERVERCHAN_FORWARD_URL
        ? String(parsed.searchParams.get("sendkey") || parsed.searchParams.get("sendKey") || "").trim()
        : String((String(parsed.pathname || "").match(/^\/([^/]+)\.send$/i) || [])[1] || "").trim();
    return {
      sendKey,
      serverUrl: normalized
    };
  }

  function normalizeServerChanSendKeyInput(rawValue, fieldName = "Server酱 SendKey") {
    const text = String(rawValue || "").trim();
    if (!text) {
      return "";
    }
    if (!SERVERCHAN_SENDKEY_RE.test(text)) {
      throw new Error(`${fieldName}格式错误，请填写形如 SCTxxxx 的 SendKey`);
    }
    return text;
  }

  function normalizeNotifySubmitInput(providerValue, secretInput, serverInput, options = {}) {
    const provider = normalizeNotifyProvider(providerValue);
    const requiredKey = Boolean(options.requiredKey);
    const rawSecret = String(secretInput || "").trim();
    const rawServerUrl = String(serverInput || "").trim();
    if (provider !== "serverchan") {
      if (requiredKey && !rawSecret) {
        throw new Error("Bark Key 不能为空");
      }
      return {
        provider,
        secretKey: rawSecret,
        serverUrl: rawServerUrl || null
      };
    }
    let normalizedKey = rawSecret;
    let impliedServerUrl = "";
    if (/^https?:\/\//i.test(rawSecret)) {
      const parsed = parseServerChanSendKeyFromForwardUrl(rawSecret);
      normalizedKey = parsed.sendKey;
      impliedServerUrl = parsed.serverUrl;
      if (!normalizedKey) {
        throw new Error(
          "Server酱链接缺少 sendkey，仅支持 SendKey、https://sct.ftqq.com/forward?sendkey=... 或 https://sctapi.ftqq.com/{SendKey}.send"
        );
      }
    }
    normalizedKey = normalizeServerChanSendKeyInput(normalizedKey, "Server酱 SendKey");
    if (requiredKey && !normalizedKey) {
      throw new Error("Server酱 SendKey 不能为空");
    }
    const normalizedServerUrl = rawServerUrl
      ? normalizeServerChanForwardUrlInput(rawServerUrl, "Server酱地址")
      : impliedServerUrl || SERVERCHAN_FORWARD_URL;
    return {
      provider,
      secretKey: normalizedKey,
      serverUrl: normalizedServerUrl
    };
  }

  function notifyProviderLabel(provider) {
    return normalizeNotifyProvider(provider) === "serverchan" ? "Server酱" : "Bark";
  }

  function notifyKeyLabel(provider) {
    return normalizeNotifyProvider(provider) === "serverchan" ? "SendKey" : "Bark Key";
  }

  function notifyKeyPlaceholder(provider) {
    return normalizeNotifyProvider(provider) === "serverchan"
      ? "支持 SendKey、forward?sendkey=... 或 sctapi.../{SendKey}.send"
      : "支持 Bark Key 或 https://api.day.app/xxxxxxxxx/这里改成你自己的推送内容";
  }

  function notifyServerLabel(provider) {
    return normalizeNotifyProvider(provider) === "serverchan"
      ? "Server酱地址"
      : "Bark 服务地址";
  }

  function notifyServerPlaceholder(provider) {
    return normalizeNotifyProvider(provider) === "serverchan"
      ? "可空，默认自动使用 https://sctapi.ftqq.com/{SendKey}.send"
      : "可空，默认 https://api.day.app";
  }

  function isServerChanForwardUrlValue(rawUrl) {
    const text = String(rawUrl || "").trim();
    if (!text) {
      return false;
    }
    try {
      return normalizeServerChanForwardUrlInput(text, "Server酱地址") === SERVERCHAN_FORWARD_URL;
    } catch (_error) {
      return false;
    }
  }

  function syncNotifyServerInputForProvider(providerValue, serverInput, prevProviderValue) {
    if (!serverInput) {
      return;
    }
    const nextProvider = normalizeNotifyProvider(providerValue);
    const prevProvider = normalizeNotifyProvider(
      prevProviderValue || serverInput.dataset.providerMode || nextProvider
    );
    const currentValue = String(serverInput.value || "").trim();
    if (prevProvider === "bark") {
      serverInput.dataset.lastBarkServerUrl = currentValue;
    }
    if (nextProvider === "serverchan") {
      serverInput.value = "";
    } else if (isServerChanForwardUrlValue(currentValue) || !currentValue) {
      serverInput.value = String(serverInput.dataset.lastBarkServerUrl || "").trim();
    }
    serverInput.dataset.providerMode = nextProvider;
  }

  function getNotifyChannelSecretRaw(channel) {
    const row = channel && typeof channel === "object" ? channel : {};
    const provider = normalizeNotifyProvider(row.provider);
    if (provider === "serverchan") {
      return String(
        row.serverChanSendKey !== undefined
          ? row.serverChanSendKey
          : row.server_chan_send_key !== undefined
            ? row.server_chan_send_key
            : ""
      ).trim();
    }
    return String(
      row.barkDeviceKey !== undefined
        ? row.barkDeviceKey
        : row.bark_device_key !== undefined
          ? row.bark_device_key
          : ""
    ).trim();
  }

  function getNotifyChannelSecretMasked(channel) {
    const row = channel && typeof channel === "object" ? channel : {};
    const provider = normalizeNotifyProvider(row.provider);
    if (provider === "serverchan") {
      return String(
        row.serverChanSendKeyMasked !== undefined
          ? row.serverChanSendKeyMasked
          : row.server_chan_send_key_masked !== undefined
            ? row.server_chan_send_key_masked
            : row.barkDeviceKeyMasked || "***"
      );
    }
    return String(row.barkDeviceKeyMasked || "***");
  }

  function getNotifyChannelServerUrl(channel) {
    const row = channel && typeof channel === "object" ? channel : {};
    const provider = normalizeNotifyProvider(row.provider);
    if (provider === "serverchan") {
      return String(
        row.serverChanServerUrl !== undefined
          ? row.serverChanServerUrl
          : row.server_chan_server_url !== undefined
            ? row.server_chan_server_url
            : row.barkServerUrl || row.bark_server_url || ""
      ).trim();
    }
    return String(row.barkServerUrl || row.bark_server_url || "").trim();
  }

  function applyNotifyCreateProviderUi() {
    const provider = normalizeNotifyProvider(
      notifyChannelProvider && notifyChannelProvider.value ? notifyChannelProvider.value : "bark"
    );
    const keyLabel = notifyKeyLabel(provider) + " / 一键复制链接";
    if (notifyChannelKeyLabel) {
      notifyChannelKeyLabel.textContent = keyLabel;
    }
    if (notifyChannelServerLabel) {
      notifyChannelServerLabel.textContent = notifyServerLabel(provider) + "（可空）";
    }
    const keyInput = $("notifyChannelBarkKey");
    if (keyInput) {
      keyInput.placeholder = notifyKeyPlaceholder(provider);
    }
    const serverInput = $("notifyChannelServerUrl");
    if (serverInput) {
      serverInput.placeholder = notifyServerPlaceholder(provider);
      syncNotifyServerInputForProvider(provider, serverInput);
    }
  }

  function cookieStatusPillClass(status) {
    if (status === "valid") {
      return "ok";
    }
    if (status === "expired" || status === "error" || status === "invalid_state") {
      return "error";
    }
    if (status === "missing") {
      return "warn";
    }
    return "warn";
  }

  function formatCookieStatusHtml(userId) {
    const state = cookieStatusByUserId[String(userId || "")];
    if (!state) {
      return '<span class="pill warn">未检查</span>';
    }
    const checkedAt = state.checkedAt ? window.DailyFlowWeb.escapeHtml(formatBeijingDateTime(String(state.checkedAt))) : "-";
    const statusLabel = window.DailyFlowWeb.escapeHtml(cookieStatusLabel(state.status));
    const message = state.message ? window.DailyFlowWeb.escapeHtml(String(state.message)) : "-";
    return (
      '<span class="pill ' +
      cookieStatusPillClass(state.status) +
      '">' +
      statusLabel +
      "</span>" +
      '<div class="muted">检查时间: ' +
      checkedAt +
      "</div>" +
      '<div class="muted">结果: ' +
      message +
      "</div>"
    );
  }

  function checkinStatusPillClass(status) {
    if (status === "signed_today") {
      return "ok";
    }
    if (status === "not_signed_today") {
      return "warn";
    }
    if (status === "auth_missing" || status === "auth_expired" || status === "error" || status === "invalid_state") {
      return "error";
    }
    return "warn";
  }

  function checkinStatusLabel(status) {
    const map = {
      signed_today: "今日已签",
      not_signed_today: "今日未签",
      auth_missing: "无登录态",
      auth_expired: "登录失效",
      invalid_state: "登录态异常",
      csrf_missing: "CSRF缺失",
      profile_invalid: "页面参数异常",
      identity_missing: "身份识别失败",
      not_found: "花名册未匹配",
      error: "检查失败"
    };
    return map[status] || "未检查";
  }

  function formatCheckinStatusHtml(userId) {
    const state = checkinStatusByUserId[String(userId || "")];
    if (!state) {
      return '<span class="pill warn">未检查</span>';
    }
    const checkedAt = state.checkedAt ? window.DailyFlowWeb.escapeHtml(formatBeijingDateTime(String(state.checkedAt))) : "-";
    const statusLabel = window.DailyFlowWeb.escapeHtml(checkinStatusLabel(state.status));
    const message = state.message ? window.DailyFlowWeb.escapeHtml(String(state.message)) : "-";
    return (
      '<span class="pill ' +
      checkinStatusPillClass(state.status) +
      '">' +
      statusLabel +
      "</span>" +
      '<div class="muted">检查时间: ' +
      checkedAt +
      "</div>" +
      '<div class="muted">结果: ' +
      message +
      "</div>"
    );
  }

  function executionStatusPillClass(status) {
    if (status === "success") {
      return "ok";
    }
    if (status === "running") {
      return "warn";
    }
    if (status === "failed") {
      return "error";
    }
    return "warn";
  }

  function executionStatusLabel(status) {
    const map = {
      running: "执行中",
      success: "最近成功",
      failed: "最近失败",
      unknown: "未执行"
    };
    return map[String(status || "").trim()] || "未执行";
  }

  function formatExecutionStatusHtml(executionStatus) {
    const obj = executionStatus && typeof executionStatus === "object" ? executionStatus : null;
    if (!obj) {
      return '<span class="pill warn">未执行</span>';
    }
    const status = String(obj.status || "unknown");
    const label = executionStatusLabel(status);
    const when = String(obj.finishedAt || obj.startedAt || "").trim();
    const whenText = when ? formatBeijingDateTime(when) : "";
    const message = String(obj.message || "").trim();
    return (
      '<span class="pill ' +
      executionStatusPillClass(status) +
      '">' +
      window.DailyFlowWeb.escapeHtml(label) +
      "</span>" +
      (whenText
        ? '<div class="muted">时间: ' + window.DailyFlowWeb.escapeHtml(whenText) + "</div>"
        : "") +
      (message ? '<div class="muted">信息: ' + window.DailyFlowWeb.escapeHtml(message) + "</div>" : "")
    );
  }

  function formatShortBeijingDateTime(value) {
    const fullText = formatBeijingDateTime(value);
    if (!fullText || fullText === "-") {
      return "-";
    }
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(fullText);
    if (!match) {
      return fullText;
    }
    return `${match[2]}-${match[3]} ${match[4]}`;
  }

  function formatCompactCheckinStatusPill(userId) {
    const state = checkinStatusByUserId[String(userId || "")];
    if (!state) {
      return '<span class="pill warn">签到未检查</span>';
    }
    return (
      '<span class="pill ' +
      checkinStatusPillClass(state.status) +
      '">' +
      window.DailyFlowWeb.escapeHtml(checkinStatusLabel(state.status)) +
      "</span>"
    );
  }

  function formatCompactExecutionStatusPill(executionStatus) {
    const obj = executionStatus && typeof executionStatus === "object" ? executionStatus : null;
    if (!obj) {
      return '<span class="pill warn">未执行</span>';
    }
    const status = String(obj.status || "unknown");
    return (
      '<span class="pill ' +
      executionStatusPillClass(status) +
      '">' +
      window.DailyFlowWeb.escapeHtml(executionStatusLabel(status)) +
      "</span>"
    );
  }

  function formatCompactCookieStatusPill(userId) {
    const state = cookieStatusByUserId[String(userId || "")];
    if (!state) {
      return '<span class="pill warn">Cookie未检查</span>';
    }
    return (
      '<span class="pill ' +
      cookieStatusPillClass(state.status) +
      '">' +
      window.DailyFlowWeb.escapeHtml(cookieStatusLabel(state.status)) +
      "</span>"
    );
  }

  function formatCompactStatusSummary(userId, executionStatus) {
    const checkinState = checkinStatusByUserId[String(userId || "")];
    const executionObj =
      executionStatus && typeof executionStatus === "object" ? executionStatus : null;
    const lines = [];

    if (checkinState) {
      const checkedAt = formatShortBeijingDateTime(checkinState.checkedAt);
      const messageText = String(checkinState.message || "").trim();
      lines.push(
        '<div class="checkin-summary-line">签到检查 ' +
          window.DailyFlowWeb.escapeHtml(checkedAt) +
          "</div>"
      );
      if (messageText) {
        lines.push(
          '<div class="checkin-summary-line" title="' +
            window.DailyFlowWeb.escapeHtml(messageText) +
            '">' +
            window.DailyFlowWeb.escapeHtml(messageText) +
            "</div>"
        );
      }
    } else {
      lines.push('<div class="checkin-summary-line">签到状态未检查</div>');
    }

    if (executionObj) {
      const whenText = formatShortBeijingDateTime(
        executionObj.finishedAt || executionObj.startedAt || ""
      );
      const messageText = String(executionObj.message || "").trim();
      lines.push(
        '<div class="checkin-summary-line">最近执行 ' +
          window.DailyFlowWeb.escapeHtml(whenText) +
          "</div>"
      );
      if (messageText) {
        lines.push(
          '<div class="checkin-summary-line" title="' +
            window.DailyFlowWeb.escapeHtml(messageText) +
            '">' +
            window.DailyFlowWeb.escapeHtml(messageText) +
            "</div>"
        );
      }
    }

    return lines.join("");
  }

  function formatCompactLocationSummary(checkinUser) {
    const profile =
      checkinUser && checkinUser.locationProfile && typeof checkinUser.locationProfile === "object"
        ? checkinUser.locationProfile
        : null;
    if (!profile) {
      return (
        '<span class="pill warn">未设置</span>' +
        '<div class="checkin-summary-line">尚未配置签到位置</div>'
      );
    }
    const coordText = `${profile.latitude}, ${profile.longitude} (acc ${profile.accuracy}, ${
      profile.coordSystem || "auto"
    })`;
    const submitAddressText = String(profile.submitAddressText || "").trim();
    return (
      '<span class="pill ok">已设置</span>' +
      (submitAddressText
        ? '<div class="checkin-summary-line" title="' +
          window.DailyFlowWeb.escapeHtml(submitAddressText) +
          '">' +
          window.DailyFlowWeb.escapeHtml(submitAddressText) +
          "</div>"
        : '<div class="checkin-summary-line">未填写提交地址文本</div>') +
      '<div class="checkin-summary-line" title="' +
        window.DailyFlowWeb.escapeHtml(coordText) +
        '">' +
        window.DailyFlowWeb.escapeHtml(coordText) +
        "</div>"
    );
  }

  function formatCompactCookieSummary(userId, notificationChannel) {
    const state = cookieStatusByUserId[String(userId || "")];
    const notifyLabel = String(getNotificationChannelLabel(notificationChannel) || "").trim();
    const lines = [];

    if (state) {
      const checkedAt = formatShortBeijingDateTime(state.checkedAt);
      const messageText = String(state.message || "").trim();
      lines.push(
        '<div class="checkin-summary-line">检查 ' +
          window.DailyFlowWeb.escapeHtml(checkedAt) +
          "</div>"
      );
      if (messageText) {
        lines.push(
          '<div class="checkin-summary-line" title="' +
            window.DailyFlowWeb.escapeHtml(messageText) +
            '">' +
            window.DailyFlowWeb.escapeHtml(messageText) +
            "</div>"
        );
      }
    } else {
      lines.push('<div class="checkin-summary-line">Cookie状态未检查</div>');
    }

    lines.push(
      '<div class="checkin-summary-line" title="' +
        window.DailyFlowWeb.escapeHtml("推送通道: " + (notifyLabel || "未绑定")) +
        '">' +
        window.DailyFlowWeb.escapeHtml("推送: " + (notifyLabel || "未绑定")) +
        "</div>"
    );

    return lines.join("");
  }

  function isCompactLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function setSidebarOpen(open) {
    const active = Boolean(open && isCompactLayout());
    if (sidebar) {
      sidebar.classList.toggle("open", active);
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.toggle("open", active);
    }
    if (btnMenuToggle) {
      btnMenuToggle.setAttribute("aria-expanded", active ? "true" : "false");
    }
    document.body.classList.toggle("sidebar-open", active);
  }

  function switchPanel(panelId) {
    currentPanelId = String(panelId || "user-panel-profile");
    sectionPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === currentPanelId);
    });
    menuItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.menuTarget === currentPanelId);
    });
    syncRefreshButtonMeta();
    if (isCompactLayout()) {
      setSidebarOpen(false);
    }
  }

  function getPanelRefreshMeta(panelId) {
    const map = {
      "user-panel-profile": {
        title: "刷新账号信息",
        message: "账号信息已刷新"
      },
      "user-panel-checkin": {
        title: "刷新签到账号状态",
        message: "签到账号状态已刷新"
      },
      "user-panel-notify": {
        title: "刷新推送通道列表",
        message: "推送通道列表已刷新"
      },
      "user-panel-qr": {
        title: "刷新二维码状态",
        message: "二维码状态已刷新"
      }
    };
    return map[String(panelId || "")] || {
      title: "刷新当前面板",
      message: "当前面板已刷新"
    };
  }

  function syncRefreshButtonMeta() {
    const btnRefresh = $("btnRefresh");
    if (!btnRefresh) {
      return;
    }
    const btnRefreshText = $("btnRefreshText");
    const meta = getPanelRefreshMeta(currentPanelId);
    btnRefresh.title = meta.title;
    btnRefresh.setAttribute("aria-label", meta.title);
    if (btnRefreshText) {
      btnRefreshText.textContent = meta.title;
    }
  }

  function computeMessageAutoHideMs(text, isError) {
    const len = String(text || "").length;
    const base = isError ? 3200 : 2200;
    return Math.max(base, Math.min(12000, base + len * 22));
  }

  function showMsg(text, isError, options) {
    const opts = options || {};
    const el = $("msg");
    el.textContent = text || "";
    el.classList.remove("hidden", "ok", "error");
    el.classList.add(isError ? "error" : "ok");
    if (messageHideTimer) {
      clearTimeout(messageHideTimer);
      messageHideTimer = null;
    }
    if (!text || opts.autoHide === false) {
      return;
    }
    const durationMs = Number.isFinite(Number(opts.durationMs))
      ? Number(opts.durationMs)
      : computeMessageAutoHideMs(text, isError);
    messageHideTimer = setTimeout(() => {
      const node = $("msg");
      if (!node) {
        return;
      }
      node.classList.add("hidden");
      node.textContent = "";
      node.classList.remove("ok", "error");
    }, durationMs);
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) {
      return;
    }
    if (loading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }
      const safeText = String(
        loadingText || button.textContent || button.getAttribute("aria-label") || "处理中..."
      );
      button.innerHTML =
        '<span class="btn-loading-content">' +
        '<span class="btn-loading-spinner" aria-hidden="true"></span>' +
        '<span class="btn-loading-label"></span>' +
        "</span>";
      const label = button.querySelector(".btn-loading-label");
      if (label) {
        label.textContent = safeText;
      }
      button.classList.add("is-loading");
      button.disabled = true;
      return;
    }
    button.classList.remove("is-loading");
    const originalHtml = button.dataset.originalHtml;
    if (typeof originalHtml === "string" && originalHtml.length > 0) {
      button.innerHTML = originalHtml;
    }
    delete button.dataset.originalHtml;
    if (button.dataset.restoreDisabled === "1") {
      button.disabled = true;
    } else {
      button.disabled = false;
    }
    delete button.dataset.restoreDisabled;
  }

  function notifyActionBusy() {
    showMsg("操作进行中，请稍候…", true);
  }

  function notifyActionTooFast() {
    showMsg("点击过快，请稍后再试", true);
  }

  async function runGuardedButtonAction(button, options, task) {
    const opts = options || {};
    const cooldownMs = Number.isFinite(Number(opts.cooldownMs))
      ? Number(opts.cooldownMs)
      : ACTION_COOLDOWN_MS;
    const minLoadingMs = Number.isFinite(Number(opts.minLoadingMs))
      ? Math.max(0, Number(opts.minLoadingMs))
      : 0;
    const silentBlocked = Boolean(opts.silentBlocked);
    const lockWidth = Boolean(opts.lockWidth);
    const key =
      String(opts.key || "") ||
      String(button && (button.dataset.action || button.id) ? (button.dataset.action || button.id) : "");
    const startedAt = Date.now();
    const now = Date.now();
    if (key && actionLocks.has(key)) {
      if (!silentBlocked) {
        notifyActionBusy();
      }
      return false;
    }
    const last = key ? Number(actionLastTriggerAt.get(key) || 0) : 0;
    if (key && last > 0 && now - last < cooldownMs) {
      if (!silentBlocked) {
        notifyActionTooFast();
      }
      return false;
    }
    if (key) {
      actionLocks.add(key);
      actionLastTriggerAt.set(key, now);
    }
    if (button) {
      if (lockWidth) {
        const width = button.getBoundingClientRect().width;
        if (Number.isFinite(width) && width > 0) {
          button.style.width = `${Math.ceil(width)}px`;
        }
      }
      button.dataset.restoreDisabled = button.disabled ? "1" : "0";
      setButtonLoading(button, true, opts.loadingText);
    }
    try {
      await task();
      return true;
    } finally {
      if (minLoadingMs > 0) {
        const elapsed = Date.now() - startedAt;
        const waitMs = minLoadingMs - elapsed;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
      if (button) {
        setButtonLoading(button, false);
        if (lockWidth) {
          button.style.width = "";
        }
      }
      if (key) {
        actionLocks.delete(key);
      }
    }
  }

  function showMapTip(text, isError) {
    if (!mapPickerTip) {
      return;
    }
    if (!text) {
      mapPickerTip.classList.add("hidden");
      mapPickerTip.textContent = "";
      mapPickerTip.classList.remove("ok", "error");
      return;
    }
    mapPickerTip.classList.remove("hidden", "ok", "error");
    mapPickerTip.classList.add(isError ? "error" : "ok");
    mapPickerTip.textContent = text;
  }

  function parseDateOnlyToParts(value) {
    const text = String(value || "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(dt.getTime()) ||
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() + 1 !== month ||
      dt.getUTCDate() !== day
    ) {
      return null;
    }
    return { year, month, day, date: dt };
  }

  function formatDateOnlyWithWeekday(dateText) {
    const parsed = parseDateOnlyToParts(dateText);
    if (!parsed) {
      return "";
    }
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return (
      String(parsed.year).padStart(4, "0") +
      "-" +
      String(parsed.month).padStart(2, "0") +
      "-" +
      String(parsed.day).padStart(2, "0") +
      " " +
      weekdays[parsed.date.getUTCDay()]
    );
  }

  function todayDateOnlyText() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return (
      String(year).padStart(4, "0") +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0")
    );
  }

  function closeLogModal() {
    logTargetCheckinUserId = null;
    logTargetCheckinUserLabel = "";
    if (logTableBody) {
      logTableBody.innerHTML = "";
    }
    if (logModalHint) {
      logModalHint.textContent = "-";
    }
    if (logModal) {
      logModal.classList.add("hidden");
    }
  }

  function closeChangePasswordModal() {
    if (!changePasswordModal) {
      return;
    }
    changePasswordModal.classList.add("hidden");
    const currentInput = $("changePasswordCurrent");
    const nextInput = $("changePasswordNext");
    const confirmInput = $("changePasswordConfirm");
    if (currentInput) {
      currentInput.value = "";
    }
    if (nextInput) {
      nextInput.value = "";
    }
    if (confirmInput) {
      confirmInput.value = "";
    }
    document.body.classList.toggle(
      "sidebar-open",
      Boolean(sidebar && sidebar.classList.contains("open"))
    );
  }

  function updateAutoPauseWeekdayHint(value) {
    if (!autoPauseWeekday) {
      return;
    }
    const label = formatDateOnlyWithWeekday(value);
    autoPauseWeekday.textContent = label
      ? `已选择：${label}`
      : "选择日期后会显示截止到周几，到期次日自动恢复自动签到。";
  }

  function closeAutoPauseModal() {
    autoPauseTargetCheckinUserId = null;
    if (autoPauseModal) {
      autoPauseModal.classList.add("hidden");
    }
    if (autoPauseHint) {
      autoPauseHint.textContent = "-";
    }
    if (autoPauseUntilDate) {
      autoPauseUntilDate.value = "";
      autoPauseUntilDate.min = todayDateOnlyText();
    }
    updateAutoPauseWeekdayHint("");
    document.body.classList.toggle(
      "sidebar-open",
      Boolean(sidebar && sidebar.classList.contains("open"))
    );
  }

  function closeTimeSettingsModal() {
    timeSettingsTargetCheckinUserId = null;
    if (timeSettingsModal) {
      timeSettingsModal.classList.add("hidden");
    }
    if (timeSettingsHint) {
      timeSettingsHint.textContent = "-";
    }
    if (timeSettingsCheckinTime) {
      timeSettingsCheckinTime.value = "";
    }
    if (timeSettingsWarningTime) {
      timeSettingsWarningTime.value = "";
    }
    document.body.classList.toggle(
      "sidebar-open",
      Boolean(sidebar && sidebar.classList.contains("open"))
    );
  }

  function openAutoPauseModal(checkinUser) {
    if (!autoPauseModal) {
      return;
    }
    autoPauseTargetCheckinUserId = Number(checkinUser && checkinUser.id);
    if (autoPauseHint) {
      const current = checkinUser && checkinUser.autoCheckinPauseUntil
        ? formatDateOnlyWithWeekday(checkinUser.autoCheckinPauseUntil)
        : "未暂停";
      autoPauseHint.textContent =
        "当前账号：" +
        (checkinUser && checkinUser.userKey ? checkinUser.userKey : "-") +
        " / " +
        (checkinUser && checkinUser.displayName ? checkinUser.displayName : "-") +
        " | 当前自动签到状态：" +
        current;
    }
    if (autoPauseUntilDate) {
      autoPauseUntilDate.min = todayDateOnlyText();
      autoPauseUntilDate.value = String(
        checkinUser && checkinUser.autoCheckinPauseUntil
          ? checkinUser.autoCheckinPauseUntil
          : ""
      );
    }
    updateAutoPauseWeekdayHint(
      checkinUser && checkinUser.autoCheckinPauseUntil
        ? checkinUser.autoCheckinPauseUntil
        : ""
    );
    autoPauseModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
  }

  function openTimeSettingsModal(checkinUser) {
    if (!timeSettingsModal) {
      return;
    }
    timeSettingsTargetCheckinUserId = Number(checkinUser && checkinUser.id);
    if (timeSettingsHint) {
      timeSettingsHint.textContent =
        "当前账号：" +
        (checkinUser && checkinUser.userKey ? checkinUser.userKey : "-") +
        " / " +
        (checkinUser && checkinUser.displayName ? checkinUser.displayName : "-") +
        " | 当前自动签到：" +
        (parseCronToTimeLabel(checkinUser && checkinUser.cronExpr) || "-") +
        " | 当前告警：" +
        (checkinUser && checkinUser.warningTime ? checkinUser.warningTime : "-") +
        " | " +
        AUTO_CHECKIN_JITTER_HINT;
    }
    if (timeSettingsCheckinTime) {
      timeSettingsCheckinTime.value =
        parseCronToTimeLabel(checkinUser && checkinUser.cronExpr) || "08:00";
    }
    if (timeSettingsWarningTime) {
      timeSettingsWarningTime.value = String(
        checkinUser && checkinUser.warningTime ? checkinUser.warningTime : "23:00"
      );
    }
    timeSettingsModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
  }

  async function saveAutoCheckinPauseForTarget(pauseUntilDate) {
    if (!Number.isFinite(Number(autoPauseTargetCheckinUserId)) || Number(autoPauseTargetCheckinUserId) <= 0) {
      throw new Error("未选择签到账号");
    }
    const payload = await window.DailyFlowWeb.api(
      "/user/checkin-users/" + Number(autoPauseTargetCheckinUserId) + "/auto-checkin-pause",
      {
        method: "PATCH",
        body: {
          pauseUntilDate: pauseUntilDate || null
        }
      }
    );
    return payload && payload.checkinUser ? payload.checkinUser : null;
  }

  async function saveTimeSettingsForTarget() {
    if (!Number.isFinite(Number(timeSettingsTargetCheckinUserId)) || Number(timeSettingsTargetCheckinUserId) <= 0) {
      throw new Error("未选择签到账号");
    }
    const checkinTime = timeSettingsCheckinTime
      ? String(timeSettingsCheckinTime.value || "").trim()
      : "";
    const warningTime = timeSettingsWarningTime
      ? String(timeSettingsWarningTime.value || "").trim()
      : "";
    if (!checkinTime) {
      throw new Error("请选择自动签到时间");
    }
    if (!warningTime) {
      throw new Error("请选择未签到告警时间");
    }
    const payload = await window.DailyFlowWeb.api(
      "/user/checkin-users/" + Number(timeSettingsTargetCheckinUserId) + "/schedule",
      {
        method: "PATCH",
        body: {
          cronExpr: timeToCronExpr(checkinTime),
          warningTime
        }
      }
    );
    return payload && payload.checkinUser ? payload.checkinUser : null;
  }

  function openChangePasswordModal() {
    if (!changePasswordModal) {
      showMsg("修改密码入口暂不可用", true);
      return;
    }
    changePasswordModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
    const currentInput = $("changePasswordCurrent");
    if (currentInput) {
      currentInput.focus();
    }
  }

  function formatBeijingDateTime(value) {
    const text = String(value || "").trim();
    if (!text || text === "-") {
      return "-";
    }
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) {
      return text;
    }
    try {
      const parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23"
      }).formatToParts(date);
      const mapped = {};
      for (const part of parts) {
        if (part && part.type && part.type !== "literal") {
          mapped[part.type] = part.value;
        }
      }
      if (!mapped.year || !mapped.month || !mapped.day || !mapped.hour || !mapped.minute || !mapped.second) {
        return text;
      }
      return `${mapped.year}-${mapped.month}-${mapped.day} ${mapped.hour}:${mapped.minute}:${mapped.second}`;
    } catch (_error) {
      return text;
    }
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value.trim()) {
      throw new Error("内容为空");
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) {
      throw new Error("复制失败，请手动复制");
    }
  }

  function openLogModal(checkinUserId, labelText) {
    logTargetCheckinUserId = Number(checkinUserId);
    logTargetCheckinUserLabel = String(labelText || "");
    if (logModalHint) {
      logModalHint.textContent = "账号：" + (logTargetCheckinUserLabel || "-");
    }
    if (logModal) {
      logModal.classList.remove("hidden");
    }
  }

  function renderLogRows(logs) {
    if (!logTableBody) {
      return;
    }
    const rows = Array.isArray(logs) ? logs : [];
    if (!rows.length) {
      logTableBody.innerHTML = '<tr><td colspan="5" class="muted">暂无日志记录</td></tr>';
      return;
    }
    logTableBody.innerHTML = rows
      .map((log) => {
        const statusRaw = String(log.status || "-");
        const statusText = statusRaw === "-" ? "-" : statusLabelZh(statusRaw);
        const statusClass =
          statusRaw === "success"
            ? "ok"
            : statusRaw === "failed" || statusRaw === "error"
              ? "error"
              : "warn";
        const runAt = formatBeijingDateTime(log.runAt || log.createdAt || "-");
        const durationText = Number.isFinite(Number(log.durationMs))
          ? String(Number(log.durationMs))
          : "-";
        const msg = window.DailyFlowWeb.escapeHtml(String(log.message || "-"));
        return (
          "<tr>" +
          "<td>" + String(log.id || "-") + "</td>" +
          "<td>" + window.DailyFlowWeb.escapeHtml(runAt) + "</td>" +
          "<td><span class='pill " + statusClass + "'>" + window.DailyFlowWeb.escapeHtml(statusText) + "</span></td>" +
          "<td>" + window.DailyFlowWeb.escapeHtml(durationText) + "</td>" +
          "<td>" + msg + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function loadCheckinLogs(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/user/checkin-users/" + checkinUserId + "/logs"
    );
    renderLogRows(payload && payload.logs ? payload.logs : []);
  }

  async function clearCheckinLogs(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/user/checkin-users/" + checkinUserId + "/logs",
      {
        method: "DELETE"
      }
    );
    return Number(payload && payload.deleted ? payload.deleted : 0);
  }

  function setMapActionBusy(action, busy) {
    const next = Boolean(busy);
    if (action === "search" && btnMapSearch) {
      btnMapSearch.disabled = next || !mapPickerAvailable;
      btnMapSearch.textContent = next ? "搜索中..." : "搜索";
    }
    if (action === "save" && btnMapSave) {
      btnMapSave.disabled = next;
      btnMapSave.textContent = next ? "保存中..." : "保存位置设置";
    }
  }

  function setMapPickerAvailability(enabled) {
    mapPickerAvailable = Boolean(enabled);
    if (mapPickerCanvasWrap) {
      mapPickerCanvasWrap.classList.toggle("hidden", !mapPickerAvailable);
    }
    if (btnMapSearch) {
      btnMapSearch.disabled = !mapPickerAvailable;
    }
    if (mapSearchKeyword) {
      mapSearchKeyword.disabled = !mapPickerAvailable;
    }
    if (btnMapCenterCurrent) {
      btnMapCenterCurrent.disabled = !mapPickerAvailable;
    }
  }

  function parseOptionalNumberInput(rawValue, fieldName, options = {}) {
    const value = String(rawValue ?? "").trim();
    if (!value) {
      return null;
    }
    const next = Number(value);
    if (!Number.isFinite(next)) {
      throw new Error(`${fieldName} 必须是数字`);
    }
    if (Number.isFinite(options.min) && next < options.min) {
      throw new Error(`${fieldName} 不能小于 ${options.min}`);
    }
    if (Number.isFinite(options.max) && next > options.max) {
      throw new Error(`${fieldName} 不能大于 ${options.max}`);
    }
    return next;
  }

  function fillLocationFields(profile) {
    const p = profile || {};
    const defaults = getOptionalSimulationDefaults(p);
    if (mapLatInput) {
      mapLatInput.value = Number(defaults.latitude).toFixed(7);
    }
    if (mapLngInput) {
      mapLngInput.value = Number(defaults.longitude).toFixed(7);
    }
    if (mapCoordSystem) {
      mapCoordSystem.value = defaults.coordSystem;
    }
    if (mapAccuracyInput) {
      mapAccuracyInput.value = defaults.accuracy;
    }
    if (mapSubmitAddressText) {
      mapSubmitAddressText.value = p.submitAddressText || "";
    }
    if (mapAddressSource) {
      const source = String(p.submitAddressSource || "").trim();
      const updatedAt = String(p.submitAddressUpdatedAt || "").trim();
      if (!source && !updatedAt) {
        mapAddressSource.textContent = "未填写地址";
      } else {
        mapAddressSource.textContent = `来源: ${source || "-"} ${updatedAt ? `| ${updatedAt}` : ""}`;
      }
    }
    if (mapAltitudeInput) {
      mapAltitudeInput.value = p.altitude ?? "";
    }
    if (mapAltitudeAccuracyInput) {
      mapAltitudeAccuracyInput.value = p.altitudeAccuracy ?? "";
    }
    if (mapHeadingInput) {
      mapHeadingInput.value = p.heading ?? "";
    }
    if (mapSpeedInput) {
      mapSpeedInput.value = p.speed ?? "";
    }
  }

  function getOptionalSimulationDefaults(profile) {
    const p = profile || {};
    const center = getMapCenterFromProfile(p);
    let coordSystem = "wgs84";
    try {
      coordSystem = normalizeCoordSystemInput(p.coordSystem || "wgs84");
    } catch (_error) {
      coordSystem = "wgs84";
    }
    return {
      latitude: center.lat,
      longitude: center.lng,
      coordSystem,
      accuracy:
        Number.isFinite(Number(p.accuracy)) && Number(p.accuracy) >= 0
          ? Number(p.accuracy)
          : 30
    };
  }

  function resetOptionalSimulationFields() {
    const profile =
      mapPickerTargetUser && mapPickerTargetUser.locationProfile
        ? mapPickerTargetUser.locationProfile
        : {};
    const defaults = getOptionalSimulationDefaults(profile);
    if (mapLatInput) {
      mapLatInput.value = Number(defaults.latitude).toFixed(7);
    }
    if (mapLngInput) {
      mapLngInput.value = Number(defaults.longitude).toFixed(7);
    }
    if (mapCoordSystem) {
      mapCoordSystem.value = defaults.coordSystem;
    }
    if (mapAccuracyInput) {
      mapAccuracyInput.value = defaults.accuracy;
    }
    if (mapAltitudeInput) {
      mapAltitudeInput.value = "";
    }
    if (mapAltitudeAccuracyInput) {
      mapAltitudeAccuracyInput.value = "";
    }
    if (mapHeadingInput) {
      mapHeadingInput.value = "";
    }
    if (mapSpeedInput) {
      mapSpeedInput.value = "";
    }
    setMapPoint(defaults.latitude, defaults.longitude);
  }

  function refreshMapPickerViewport() {
    if (!mapPickerMap) {
      return;
    }
    const lat = Number(mapLatInput && mapLatInput.value);
    const lng = Number(mapLngInput && mapLngInput.value);
    if (mapPickerProvider === "amap" && typeof mapPickerMap.resize === "function") {
      mapPickerMap.resize();
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setMapPoint(lat, lng);
      }
      return;
    }
    if (mapPickerProvider === "osm" && typeof mapPickerMap.invalidateSize === "function") {
      mapPickerMap.invalidateSize();
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setMapPoint(lat, lng);
      }
    }
  }

  function isMapModalOpen() {
    return Boolean(mapPickerModal && !mapPickerModal.classList.contains("hidden"));
  }

  function openMapModal() {
    if (!mapPickerModal) {
      return;
    }
    mapPickerModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
  }

  function closeMapModal() {
    if (!mapPickerModal) {
      return;
    }
    mapPickerModal.classList.add("hidden");
    document.body.classList.toggle(
      "sidebar-open",
      Boolean(sidebar && sidebar.classList.contains("open"))
    );
    mapPickerTargetUser = null;
    if (mapFingerprintDetails) {
      mapFingerprintDetails.open = false;
    }
    showMapTip("", false);
    setMapActionBusy("search", false);
    setMapActionBusy("save", false);
  }

  async function fetchRuntimeConfig() {
    if (runtimeConfig) {
      return runtimeConfig;
    }
    const response = await fetch("/public/runtime-config", {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("读取地图配置失败");
    }
    runtimeConfig = await response.json();
    return runtimeConfig;
  }

  function resetMapInstance(nextProvider) {
    const next = String(nextProvider || "").toLowerCase();
    if (mapPickerMap && mapPickerProvider && mapPickerProvider !== next) {
      try {
        if (mapPickerProvider === "amap" && typeof mapPickerMap.destroy === "function") {
          mapPickerMap.destroy();
        } else if (mapPickerProvider === "osm" && typeof mapPickerMap.remove === "function") {
          mapPickerMap.remove();
        }
      } catch (_error) {
        // ignore destroy errors
      }
      mapPickerMap = null;
      mapPickerMarker = null;
      mapPickerPlaceSearch = null;
    }
    mapPickerProvider = next;
  }

  async function ensureAmapSdk(mapCfg) {
    const key = String(mapCfg && mapCfg.amapKey ? mapCfg.amapKey : "").trim();
    if (!key) {
      throw new Error("高德地图 Key 未配置");
    }
    if (window.AMap) {
      return window.AMap;
    }
    if (amapSdkPromise) {
      return amapSdkPromise;
    }

    amapSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://webapi.amap.com/maps?v=2.0&key=" +
        encodeURIComponent(key) +
        "&plugin=AMap.PlaceSearch";
      script.async = true;
      script.onload = () => {
        if (window.AMap) {
          resolve(window.AMap);
          return;
        }
        reject(new Error("AMap SDK 加载后不可用"));
      };
      script.onerror = () => {
        reject(new Error("AMap SDK 加载失败"));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      amapSdkPromise = null;
      throw error;
    });

    return amapSdkPromise;
  }

  async function ensureLeafletSdk() {
    if (window.L) {
      return window.L;
    }
    if (leafletSdkPromise) {
      return leafletSdkPromise;
    }

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    leafletSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = () => {
        if (window.L) {
          resolve(window.L);
          return;
        }
        reject(new Error("Leaflet 加载后不可用"));
      };
      script.onerror = () => {
        reject(new Error("Leaflet 加载失败"));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      leafletSdkPromise = null;
      throw error;
    });

    return leafletSdkPromise;
  }

  function setMapPoint(latitude, longitude, options = {}) {
    const opts = options || {};
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    mapLatInput.value = lat.toFixed(7);
    mapLngInput.value = lng.toFixed(7);
    if (!mapPickerMap) {
      return;
    }
    if (mapPickerProvider === "amap" && window.AMap) {
      const pos = [lng, lat];
      if (!mapPickerMarker) {
        mapPickerMarker = new window.AMap.Marker({
          position: pos,
          map: mapPickerMap
        });
      } else {
        mapPickerMarker.setPosition(pos);
      }
      if (opts.center !== false) {
        mapPickerMap.setCenter(pos);
      }
      return;
    }
    if (mapPickerProvider === "osm" && window.L) {
      const pos = [lat, lng];
      if (!mapPickerMarker) {
        mapPickerMarker = window.L.marker(pos).addTo(mapPickerMap);
      } else {
        mapPickerMarker.setLatLng(pos);
      }
      if (opts.center !== false) {
        mapPickerMap.setView(pos, mapPickerMap.getZoom() || 15);
      }
    }
  }

  function getMapCenterFromProfile(profile) {
    const centerLng = Number(profile.longitude);
    const centerLat = Number(profile.latitude);
    if (Number.isFinite(centerLng) && Number.isFinite(centerLat)) {
      return { lat: centerLat, lng: centerLng, fromProfile: true };
    }
    return { lat: 39.908823, lng: 116.39747, fromProfile: false };
  }

  async function ensureMapPickerByAmap(profile, mapCfg) {
    const AMap = await ensureAmapSdk(mapCfg);
    resetMapInstance("amap");
    const centerInfo = getMapCenterFromProfile(profile);
    const center = [centerInfo.lng, centerInfo.lat];
    if (!mapPickerMap) {
      mapPickerMap = new AMap.Map("mapPickerCanvas", {
        resizeEnable: true,
        zoom: 15,
        center
      });
      mapPickerMap.on("click", (event) => {
        const lnglat = event && event.lnglat;
        if (!lnglat) {
          return;
        }
        setMapPoint(lnglat.getLat(), lnglat.getLng(), { center: false });
        showMapTip("已更新浏览器指纹模拟坐标。提示：签到不会提交这些坐标。", false);
      });
    } else {
      mapPickerMap.setCenter(center);
      mapPickerMap.setZoom(15);
      mapPickerMap.resize();
    }

    if (!mapPickerPlaceSearch) {
      mapPickerPlaceSearch = new AMap.PlaceSearch({
        pageSize: 10,
        map: mapPickerMap
      });
    }

    setMapPoint(centerInfo.lat, centerInfo.lng);
  }

  async function ensureMapPickerByOsm(profile) {
    const L = await ensureLeafletSdk();
    resetMapInstance("osm");
    const centerInfo = getMapCenterFromProfile(profile);
    const center = [centerInfo.lat, centerInfo.lng];
    if (!mapPickerMap) {
      mapPickerMap = L.map("mapPickerCanvas", {
        zoomControl: true
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(mapPickerMap);
      mapPickerMap.on("click", (event) => {
        const latlng = event && event.latlng;
        if (!latlng) {
          return;
        }
        setMapPoint(latlng.lat, latlng.lng, { center: false });
        showMapTip("已更新浏览器指纹模拟坐标。提示：签到不会提交这些坐标。", false);
      });
    } else {
      mapPickerMap.setView(center, 15);
      mapPickerMap.invalidateSize();
    }
    mapPickerPlaceSearch = null;
    setMapPoint(centerInfo.lat, centerInfo.lng);
  }

  async function ensureMapPickerReady(checkinUser, options = {}) {
    const opts = options || {};
    const profile = checkinUser && checkinUser.locationProfile ? checkinUser.locationProfile : {};
    if (!opts.preserveInputs) {
      fillLocationFields(profile);
    }
    const mapProfile = {
      ...profile,
      latitude: Number.isFinite(Number(mapLatInput && mapLatInput.value))
        ? Number(mapLatInput.value)
        : profile.latitude,
      longitude: Number.isFinite(Number(mapLngInput && mapLngInput.value))
        ? Number(mapLngInput.value)
        : profile.longitude
    };
    const cfg = await fetchRuntimeConfig();
    const mapCfg = cfg && cfg.map ? cfg.map : {};
    if (!mapCfg.enabled) {
      throw new Error("地图服务未启用");
    }
    const provider = String(mapCfg.provider || "amap")
      .trim()
      .toLowerCase();
    const defaultCoordSystem = mapCfg.defaultCoordSystem || (provider === "osm" ? "wgs84" : "gcj02");
    if (mapCoordSystem && (!profile.coordSystem || String(profile.coordSystem).trim() === "")) {
      mapCoordSystem.value = String(defaultCoordSystem).toLowerCase();
    }
    setMapPickerAvailability(true);
    if (provider === "amap") {
      await ensureMapPickerByAmap(mapProfile, mapCfg);
      return;
    }
    if (provider === "osm") {
      await ensureMapPickerByOsm(mapProfile);
      return;
    }
    throw new Error(`不支持的地图提供方: ${provider}`);
  }

  async function searchMapKeyword() {
    if (!mapPickerAvailable) {
      throw new Error("地图不可用，请直接输入经纬度");
    }
    const keyword = String(mapSearchKeyword.value || "").trim();
    if (!keyword) {
      throw new Error("请输入关键词");
    }
    if (mapPickerProvider === "amap") {
      if (!mapPickerPlaceSearch) {
        throw new Error("地图搜索服务未就绪");
      }
      await new Promise((resolve, reject) => {
        mapPickerPlaceSearch.search(keyword, (status, result) => {
          if (status !== "complete" || !result || !result.poiList || !result.poiList.pois.length) {
            reject(new Error("未找到地点，请换关键词"));
            return;
          }
          const first = result.poiList.pois[0];
          if (!first || !first.location) {
            reject(new Error("地点结果缺少坐标"));
            return;
          }
          const lat =
            typeof first.location.getLat === "function"
              ? first.location.getLat()
              : first.location.lat;
          const lng =
            typeof first.location.getLng === "function"
              ? first.location.getLng()
              : first.location.lng;
          setMapPoint(lat, lng);
          showMapTip(`已定位到：${first.name || "搜索结果"}`, false);
          resolve();
        });
      });
      return;
    }
    if (mapPickerProvider === "osm") {
      const response = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
          encodeURIComponent(keyword),
        {
          headers: {
            Accept: "application/json"
          }
        }
      );
      if (!response.ok) {
        throw new Error("搜索服务暂不可用，请稍后重试");
      }
      const rows = await response.json();
      const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!first) {
        throw new Error("未找到地点，请换关键词");
      }
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("搜索结果缺少有效坐标");
      }
      setMapPoint(lat, lng);
      showMapTip(`已定位到：${first.display_name || keyword}`, false);
      return;
    }
    throw new Error("地图搜索服务未就绪");
  }

  function normalizeCoordSystemInput(value) {
    const next = String(value || "auto")
      .trim()
      .toLowerCase();
    if (!/^(auto|wgs84|gcj02|bd09)$/.test(next)) {
      throw new Error("coordSystem 仅支持 auto/wgs84/gcj02/bd09");
    }
    return next;
  }

  async function saveLocationByMap() {
    if (!mapPickerTargetUser || !mapPickerTargetUser.id) {
      throw new Error("未选择签到账号");
    }
    const existingProfile =
      mapPickerTargetUser && mapPickerTargetUser.locationProfile
        ? mapPickerTargetUser.locationProfile
        : {};
    const defaults = getOptionalSimulationDefaults(existingProfile);
    let latitude = parseOptionalNumberInput(mapLatInput ? mapLatInput.value : "", "纬度");
    let longitude = parseOptionalNumberInput(mapLngInput ? mapLngInput.value : "", "经度");
    if ((latitude === null) !== (longitude === null)) {
      throw new Error("纬度和经度需要同时填写，或都留空使用默认模拟值");
    }
    if (latitude === null && longitude === null) {
      latitude = defaults.latitude;
      longitude = defaults.longitude;
    }
    if (latitude < -90 || latitude > 90) {
      throw new Error("纬度范围必须在 -90 到 90");
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error("经度范围必须在 -180 到 180");
    }
    const coordSystem = normalizeCoordSystemInput(
      mapCoordSystem && String(mapCoordSystem.value || "").trim()
        ? mapCoordSystem.value
        : defaults.coordSystem
    );
    const accuracyInput = parseOptionalNumberInput(
      mapAccuracyInput ? mapAccuracyInput.value : "",
      "位置精度",
      { min: 0 }
    );
    const accuracy = accuracyInput === null ? defaults.accuracy : accuracyInput;
    const altitude = parseOptionalNumberInput(mapAltitudeInput.value, "高度");
    const altitudeAccuracy = parseOptionalNumberInput(
      mapAltitudeAccuracyInput.value,
      "高度精度",
      { min: 0 }
    );
    const heading = parseOptionalNumberInput(mapHeadingInput.value, "方向", { min: 0, max: 360 });
    const speed = parseOptionalNumberInput(mapSpeedInput.value, "速度", { min: 0 });
    const submitAddressText = mapSubmitAddressText
      ? String(mapSubmitAddressText.value || "").trim()
      : "";
    if (!submitAddressText) {
      throw new Error("请手动填写提交地址文本");
    }
    await window.DailyFlowWeb.api("/user/checkin-users/" + mapPickerTargetUser.id + "/location", {
      method: "POST",
      body: {
        latitude,
        longitude,
        coordSystem,
        accuracy,
        altitude,
        altitudeAccuracy,
        heading,
        speed,
        submitAddressText,
        submitAddressSource: "manual-input",
        submitAddressRawJson: null
      }
    });
  }

  function timeToCronExpr(timeText) {
    const text = String(timeText || "").trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!m) {
      throw new Error("签到时间格式错误，应为 HH:MM");
    }
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error("签到时间范围错误，小时应为 0-23，分钟应为 0-59");
    }
    return `0 ${minute} ${hour} * * *`;
  }

  function parseCronToTimeLabel(cronExpr) {
    const parts = String(cronExpr || "").trim().split(/\s+/);
    if (parts.length !== 6) {
      return String(cronExpr || "");
    }
    const minute = Number(parts[1]);
    const hour = Number(parts[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return String(cronExpr || "");
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function formatCookieExpiresLabel(expires) {
    const n = Number(expires);
    if (!Number.isFinite(n) || n <= 0) {
      return "session";
    }
    return new Date(n * 1000).toISOString();
  }

  function buildCookieInspectText(checkinUser) {
    const user = checkinUser || {};
    const cookies = Array.isArray(user.authCookies) ? user.authCookies : [];
    const lines = [
      "账号: " + String(user.userKey || "-") + " / " + String(user.displayName || "-"),
      "有无登录态: " + (user.hasAuthState ? "有" : "无"),
      "Cookie 数量: " + String(cookies.length)
    ];
    if (user.authStateUpdatedAt) {
      lines.push("登录态更新时间: " + String(user.authStateUpdatedAt));
    }
    if (user.authStateParseError) {
      lines.push("解析错误: " + String(user.authStateParseError));
    }
    if (cookies.length <= 0) {
      lines.push("无可用 Cookie");
      return lines.join("\n");
    }
    lines.push("");
    cookies.forEach((cookie, index) => {
      lines.push(
        `${index + 1}. ${cookie.name || ""}=${cookie.value || ""}; Domain=${cookie.domain || "-"}; Path=${cookie.path || "/"}; Expires=${formatCookieExpiresLabel(cookie.expires)}; HttpOnly=${Boolean(cookie.httpOnly)}; Secure=${Boolean(cookie.secure)}; SameSite=${cookie.sameSite || "-"}`
      );
    });
    return lines.join("\n");
  }

  function renderQuota(quota) {
    currentQuota = quota || null;
    if (!quotaText) {
      return;
    }
    if (!quota) {
      quotaText.innerHTML =
        '<span class="pill ok">配额：不限制</span><span class="ml-2 text-slate-600">当前为管理员视角，不限制创建数量。</span>';
      quotaText.className = "msg ok";
      if (btnCreateCheckin) {
        btnCreateCheckin.disabled = true;
      }
      return;
    }
    if (quota.limit === null || quota.limit === undefined) {
      quotaText.innerHTML =
        '<span class="pill ok">配额：' +
        window.DailyFlowWeb.escapeHtml(String(quota.used || 0)) +
        ' / 不限制</span>';
      quotaText.className = "msg ok";
      if (btnCreateCheckin) {
        btnCreateCheckin.disabled = false;
      }
      return;
    }
    const remaining = Math.max(0, Number(quota.remaining || 0));
    quotaText.innerHTML =
      '<span class="pill ' +
      (remaining > 0 ? "ok" : "error") +
      '">配额：' +
      window.DailyFlowWeb.escapeHtml(String(quota.used || 0)) +
      " / " +
      window.DailyFlowWeb.escapeHtml(String(quota.limit || 0)) +
      "（剩余 " +
      window.DailyFlowWeb.escapeHtml(String(remaining)) +
      "）</span>";
    quotaText.className = remaining > 0 ? "msg ok" : "msg error";
    if (btnCreateCheckin) {
      btnCreateCheckin.disabled = remaining <= 0;
    }
  }

  function logout() {
    closeMapModal();
    stopQrWs();
    stopQrPoll();
    window.DailyFlowWeb.clearToken();
    location.replace("/web/login");
  }

  async function refreshCurrentPanelData() {
    if (currentPanelId === "user-panel-profile") {
      const me = await window.DailyFlowWeb.fetchMe();
      if (!me || !me.user) {
        throw new Error("账号信息读取失败");
      }
      renderProfile(me.user);
      return;
    }
    if (currentPanelId === "user-panel-checkin") {
      await loadCheckinUsers();
      return;
    }
    if (currentPanelId === "user-panel-notify") {
      await Promise.all([loadNotificationChannels(), loadCheckinUsers()]);
      return;
    }
    if (currentPanelId === "user-panel-qr") {
      if (currentQrSessionId) {
        await pollQrSessionOnce();
      } else {
        await loadCheckinUsers();
      }
      return;
    }
    await Promise.all([loadCheckinUsers(), loadNotificationChannels()]);
  }

  $("btnLogout").addEventListener("click", logout);
  $("btnRefresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runGuardedButtonAction(
      button,
      {
        key: "user:refresh-page",
        cooldownMs: 1200,
        minLoadingMs: 2000,
        silentBlocked: true,
        lockWidth: true
      },
      async () => {
        try {
          await refreshCurrentPanelData();
        } catch (error) {
          console.warn("refresh failed", error);
        }
      }
    );
  });
  $("qrImage").title = "点击刷新二维码";
  $("qrImage").style.cursor = "pointer";
  $("qrImage").addEventListener("click", (event) => {
    if (!event || !event.isTrusted) {
      return;
    }
    refreshQrByImageClick();
  });
  const btnGoAdmin = $("btnGoAdmin");
  if (btnGoAdmin) {
    btnGoAdmin.addEventListener("click", () => {
      location.href = "/web/admin";
    });
  }
  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.menuTarget;
      if (target) {
        switchPanel(target);
      }
    });
  });
  const profileEl = $("profile");
  if (profileEl) {
    profileEl.addEventListener("click", async (event) => {
      const actionEl = event.target.closest("button[id]");
      if (!actionEl) {
        return;
      }
      if (actionEl.id === "btnProfileChangePassword") {
        openChangePasswordModal();
        return;
      }
      if (actionEl.id === "btnProfileLogoutAll") {
        const confirmed = window.confirm("确认退出所有设备吗？本期将立即退出当前设备，并提示其他设备重新登录。");
        if (!confirmed) {
          return;
        }
        showMsg("已执行安全退出，请在其他设备重新登录。", false);
        logout();
      }
    });
  }
  if (btnMenuToggle) {
    btnMenuToggle.addEventListener("click", () => {
      const next = !(sidebar && sidebar.classList.contains("open"));
      setSidebarOpen(next);
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", () => {
      setSidebarOpen(false);
    });
  }
  window.addEventListener("resize", () => {
    if (!isCompactLayout()) {
      setSidebarOpen(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (changePasswordModal && !changePasswordModal.classList.contains("hidden")) {
        closeChangePasswordModal();
        return;
      }
      if (isMapModalOpen()) {
        closeMapModal();
        return;
      }
      if (isNotifyBindModalOpen()) {
        closeNotifyBindModal();
        return;
      }
      setSidebarOpen(false);
    }
  });
  if (btnMapPickerClose) {
    btnMapPickerClose.addEventListener("click", () => {
      closeMapModal();
    });
  }
  if (mapPickerModal) {
    mapPickerModal.addEventListener("click", (event) => {
      if (event.target === mapPickerModal) {
        closeMapModal();
      }
    });
  }
  if (btnChangePasswordClose) {
    btnChangePasswordClose.addEventListener("click", () => {
      closeChangePasswordModal();
    });
  }
  if (changePasswordModal) {
    changePasswordModal.addEventListener("click", (event) => {
      if (event.target === changePasswordModal) {
        closeChangePasswordModal();
      }
    });
  }
  if (btnChangePasswordSave) {
    btnChangePasswordSave.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:change-password", loadingText: "保存中..." },
        async () => {
          try {
            const currentPassword = String($("changePasswordCurrent") && $("changePasswordCurrent").value ? $("changePasswordCurrent").value : "");
            const nextPassword = String($("changePasswordNext") && $("changePasswordNext").value ? $("changePasswordNext").value : "");
            const confirmPassword = String($("changePasswordConfirm") && $("changePasswordConfirm").value ? $("changePasswordConfirm").value : "");
            if (!currentPassword || !nextPassword || !confirmPassword) {
              throw new Error("请完整填写当前密码与新密码");
            }
            if (nextPassword.length < 6) {
              throw new Error("新密码至少 6 位");
            }
            if (nextPassword !== confirmPassword) {
              throw new Error("两次输入的新密码不一致");
            }
            await window.DailyFlowWeb.api("/user/password", {
              method: "PATCH",
              body: {
                currentPassword,
                newPassword: nextPassword
              }
            });
            closeChangePasswordModal();
            showMsg("密码已更新，请使用新密码重新登录。", false);
          } catch (error) {
            showMsg("修改密码失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnAutoPauseClose) {
    btnAutoPauseClose.addEventListener("click", () => {
      closeAutoPauseModal();
    });
  }
  if (autoPauseModal) {
    autoPauseModal.addEventListener("click", (event) => {
      if (event.target === autoPauseModal) {
        closeAutoPauseModal();
      }
    });
  }
  if (autoPauseUntilDate) {
    autoPauseUntilDate.addEventListener("input", () => {
      updateAutoPauseWeekdayHint(autoPauseUntilDate.value);
    });
    autoPauseUntilDate.addEventListener("change", () => {
      updateAutoPauseWeekdayHint(autoPauseUntilDate.value);
    });
  }
  if (btnAutoPauseSave) {
    btnAutoPauseSave.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:auto-checkin-pause:save", loadingText: "保存中..." },
        async () => {
          try {
            const dateText = autoPauseUntilDate ? String(autoPauseUntilDate.value || "").trim() : "";
            if (!parseDateOnlyToParts(dateText)) {
              throw new Error("请选择有效的暂停日期");
            }
            await saveAutoCheckinPauseForTarget(dateText);
            closeAutoPauseModal();
            await loadCheckinUsers();
            showMsg("自动签到暂停日期已保存，未签到告警仍会继续。", false);
          } catch (error) {
            showMsg("保存暂停日期失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnAutoPauseClear) {
    btnAutoPauseClear.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:auto-checkin-pause:clear", loadingText: "恢复中..." },
        async () => {
          try {
            await saveAutoCheckinPauseForTarget(null);
            closeAutoPauseModal();
            await loadCheckinUsers();
            showMsg("自动签到已恢复，未签到告警保持不变。", false);
          } catch (error) {
            showMsg("恢复自动签到失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnTimeSettingsClose) {
    btnTimeSettingsClose.addEventListener("click", () => {
      closeTimeSettingsModal();
    });
  }
  if (timeSettingsModal) {
    timeSettingsModal.addEventListener("click", (event) => {
      if (event.target === timeSettingsModal) {
        closeTimeSettingsModal();
      }
    });
  }
  if (btnTimeSettingsSave) {
    btnTimeSettingsSave.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:time-settings:save", loadingText: "保存中..." },
        async () => {
          try {
            await saveTimeSettingsForTarget();
            closeTimeSettingsModal();
            await loadCheckinUsers();
            showMsg("时间设置已更新。", false);
          } catch (error) {
            showMsg("保存时间设置失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnNotifyBindClose) {
    btnNotifyBindClose.addEventListener("click", () => {
      closeNotifyBindModal();
    });
  }
  if (notifyBindModal) {
    notifyBindModal.addEventListener("click", (event) => {
      if (event.target === notifyBindModal) {
        closeNotifyBindModal();
      }
    });
  }
  if (btnNotifyBindSave) {
    btnNotifyBindSave.addEventListener("click", async (event) => {
      if (!Number.isFinite(Number(notifyBindTargetCheckinUserId)) || Number(notifyBindTargetCheckinUserId) <= 0) {
        showMsg("未选择签到账号", true);
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        {
          key: "user:bind-notify-channel:" + Number(notifyBindTargetCheckinUserId),
          loadingText: "保存中..."
        },
        async () => {
          try {
            const rawValue = notifyBindSelect ? String(notifyBindSelect.value || "").trim() : "";
            await window.DailyFlowWeb.api(
              "/user/checkin-users/" + Number(notifyBindTargetCheckinUserId) + "/notification-channel",
              {
                method: "PATCH",
                body: {
                  channelId: rawValue ? Number(rawValue) : null
                }
              }
            );
            closeNotifyBindModal();
            await loadCheckinUsers();
            showMsg("推送通道绑定已保存", false);
          } catch (error) {
            showMsg("保存推送通道失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnMapSearch) {
    btnMapSearch.addEventListener("click", async () => {
      setMapActionBusy("search", true);
      try {
        await searchMapKeyword();
      } catch (error) {
        showMapTip(error.message, true);
      } finally {
        setMapActionBusy("search", false);
      }
    });
  }
  if (mapSearchKeyword) {
    mapSearchKeyword.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      setMapActionBusy("search", true);
      try {
        await searchMapKeyword();
      } catch (error) {
        showMapTip(error.message, true);
      } finally {
        setMapActionBusy("search", false);
      }
    });
  }
  if (btnMapCenterCurrent) {
    btnMapCenterCurrent.addEventListener("click", () => {
      if (!mapPickerTargetUser) {
        return;
      }
      const profile = mapPickerTargetUser.locationProfile || {};
      const lat = Number(profile.latitude);
      const lng = Number(profile.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        showMapTip("当前账号还没有已保存的模拟坐标，将使用默认模拟值。", true);
        return;
      }
      setMapPoint(lat, lng);
      showMapTip("已回到当前已保存的模拟坐标。", false);
    });
  }
  if (btnMapClearOptional) {
    btnMapClearOptional.addEventListener("click", () => {
      resetOptionalSimulationFields();
      showMapTip("已恢复默认模拟值。提示：签到不会提交这些坐标。", false);
    });
  }
  if (mapFingerprintDetails) {
    mapFingerprintDetails.addEventListener("toggle", async () => {
      if (!mapFingerprintDetails.open || !mapPickerTargetUser) {
        return;
      }
      try {
        await ensureMapPickerReady(mapPickerTargetUser, { preserveInputs: true });
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            refreshMapPickerViewport();
          });
        } else {
          refreshMapPickerViewport();
        }
      } catch (error) {
        setMapPickerAvailability(false);
        showMapTip("浏览器指纹模拟地图暂不可用，可直接忽略。原因: " + error.message, true);
      }
    });
  }
  if (btnMapSave) {
    btnMapSave.addEventListener("click", async () => {
      setMapActionBusy("save", true);
      try {
        await saveLocationByMap();
        closeMapModal();
        showMsg("位置设置已保存", false);
        await loadCheckinUsers();
      } catch (error) {
        if (mapFingerprintDetails && mapFingerprintDetails.open) {
          showMapTip(error.message, true);
        } else {
          showMsg(error.message, true);
        }
      } finally {
        setMapActionBusy("save", false);
      }
    });
  }

  function stopQrPoll(options) {
    const opts = options || {};
    const resetVersion = opts.resetVersion !== false;
    if (qrPollTimer) {
      clearInterval(qrPollTimer);
      qrPollTimer = null;
    }
    qrPollInFlight = false;
    qrPollErrorCount = 0;
    if (resetVersion) {
      currentQrImageVersion = 0;
    }
  }

  function clearQrWsReconnect(resetAttempts = true) {
    if (qrWsReconnectTimer) {
      clearTimeout(qrWsReconnectTimer);
      qrWsReconnectTimer = null;
    }
    if (resetAttempts) {
      qrWsReconnectAttempts = 0;
    }
  }

  function stopQrWs(options) {
    const opts = options || {};
    const resetReconnect = opts.resetReconnect !== false;
    if (qrWs) {
      try {
        qrWs.close();
      } catch (_error) {
        // ignore
      }
      qrWs = null;
    }
    qrWsConnected = false;
    if (resetReconnect) {
      clearQrWsReconnect(true);
    }
  }

  function ensureQrPolling(intervalMs = 2200) {
    if (qrPollTimer || !currentQrSessionId || currentQrDone) {
      return;
    }
    qrPollTimer = setInterval(pollQrSessionOnce, intervalMs);
  }

  function scheduleQrWsReconnect() {
    if (qrWsReconnectTimer || currentQrDone || !currentQrSessionId || qrWsConnected) {
      return;
    }
    if (qrWsReconnectAttempts >= QR_WS_RECONNECT_MAX) {
      ensureQrPolling(3000);
      return;
    }
    const backoff = Math.min(
      6500,
      Math.floor(QR_WS_RECONNECT_BASE_MS * Math.pow(1.7, qrWsReconnectAttempts))
    );
    const jitter = Math.floor(Math.random() * 220);
    const delay = backoff + jitter;
    qrWsReconnectAttempts += 1;
    qrWsReconnectTimer = setTimeout(() => {
      qrWsReconnectTimer = null;
      if (currentQrDone || !currentQrSessionId || qrWsConnected) {
        return;
      }
      startQrWs();
      if (!qrWsConnected) {
        ensureQrPolling(2200);
      }
    }, delay);
  }

  function setQrPanel(session) {
    const status = String(session && session.status ? session.status : "").trim().toLowerCase();
    const hasQrImage = Boolean(session && session.qrImageDataUrl);
    const qrImageEl = $("qrImage");
    const qrLoadingMaskEl = $("qrLoadingMask");
    const qrLoadingTextEl = $("qrLoadingText");
    const loadingState =
      status === "starting" ||
      (!hasQrImage && status !== "success" && status !== "failed" && status !== "timeout");
    currentQrDone = Boolean(session && session.done);
    $("qrPanel").classList.remove("hidden");
    switchPanel("user-panel-qr");
    $("qrSessionId").textContent = session.id || "-";
    $("qrMessage").textContent = session.message || "";
    $("qrStatus").textContent = qrSessionStatusLabel(session.status || "-");
    $("qrStatus").className =
      "pill " +
      (status === "success"
        ? "ok"
        : status === "failed" || status === "timeout"
          ? "error"
          : "warn");
    if (hasQrImage && qrImageEl) {
      qrImageEl.src = session.qrImageDataUrl;
      qrImageEl.classList.remove("hidden");
    } else if (qrImageEl) {
      qrImageEl.removeAttribute("src");
      qrImageEl.classList.add("hidden");
    }
    if (qrLoadingMaskEl) {
      qrLoadingMaskEl.classList.toggle("hidden", !loadingState);
    }
    const qrWrap = qrImageEl ? qrImageEl.closest(".qr-image-wrap") : null;
    if (qrWrap) {
      qrWrap.classList.toggle("loading", loadingState);
    }
    if (qrLoadingTextEl && loadingState) {
      qrLoadingTextEl.textContent =
        status === "starting" ? "二维码加载中..." : "正在同步二维码...";
    }
    const imageVersion = Number(session.qrImageVersion);
    if (Number.isFinite(imageVersion) && imageVersion >= 0) {
      currentQrImageVersion = imageVersion;
    }
  }

  function startQrWs() {
    stopQrWs({ resetReconnect: false });
    const token = window.DailyFlowWeb.getToken();
    if (!token || !currentQrSessionId) {
      return;
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl =
      protocol +
      "//" +
      location.host +
      "/ws/qr-login?sessionId=" +
      encodeURIComponent(currentQrSessionId) +
      "&token=" +
      encodeURIComponent(token) +
      "&qrImageVersion=" +
      encodeURIComponent(String(currentQrImageVersion));
    try {
      qrWs = new WebSocket(wsUrl);
    } catch (_error) {
      qrWs = null;
      return;
    }

    qrWs.addEventListener("open", () => {
      qrWsConnected = true;
      clearQrWsReconnect(true);
      stopQrPoll({ resetVersion: false });
    });
    qrWs.addEventListener("message", async (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      if (!payload) {
        return;
      }
      if (payload.error) {
        showMsg("二维码实时连接异常，已自动重连: " + payload.error, true);
        return;
      }
      if (!payload.session) {
        return;
      }
      setQrPanel(payload.session);
      if (payload.session.done) {
        stopQrWs();
        stopQrPoll();
        await loadCheckinUsers();
      }
    });

    qrWs.addEventListener("error", () => {
      qrWsConnected = false;
      scheduleQrWsReconnect();
    });
    qrWs.addEventListener("close", () => {
      qrWs = null;
      qrWsConnected = false;
      scheduleQrWsReconnect();
      ensureQrPolling();
    });
  }

  async function pollQrSessionOnce() {
    if (qrPollInFlight || !currentQrSessionId) {
      return;
    }
    qrPollInFlight = true;
    try {
      const next = await window.DailyFlowWeb.api(
        "/user/qr-login-sessions/" +
          currentQrSessionId +
          "?qrImageVersion=" +
          encodeURIComponent(String(currentQrImageVersion))
      );
      qrPollErrorCount = 0;
      setQrPanel(next.session);
      if (next.session.done) {
        stopQrWs();
        stopQrPoll();
        await loadCheckinUsers();
      }
    } catch (error) {
      qrPollErrorCount += 1;
      if (qrPollErrorCount >= 6) {
        stopQrPoll({ resetVersion: false });
        ensureQrPolling(3200);
        if (!qrWsConnected) {
          scheduleQrWsReconnect();
        }
        showMsg("二维码状态获取波动，已切换慢速重试并自动重连实时通道: " + error.message, true);
      } else {
        showMsg("网络波动，正在自动重试并重连实时通道（" + qrPollErrorCount + "/5）", true);
      }
    } finally {
      qrPollInFlight = false;
    }
  }

  async function startQrFlow(checkinUserId) {
    currentQrCheckinUserId = Number(checkinUserId) || null;
    const payload = await window.DailyFlowWeb.api("/user/checkin-users/" + checkinUserId + "/qr-login", {
      method: "POST"
    });
    currentQrSessionId = payload.session.id;
    currentQrDone = false;
    clearQrWsReconnect(true);
    stopQrPoll();
    stopQrWs();
    setQrPanel(payload.session);
    startQrWs();
    await pollQrSessionOnce();
    if (!qrWsConnected) {
      ensureQrPolling();
    }
  }

  async function refreshQrByImageClick() {
    const now = Date.now();
    if (now - lastManualQrRefreshAt < 4000) {
      showMsg("二维码刷新过快，请稍后再试", true);
      return;
    }
    if (qrRefreshInFlight) {
      showMsg("二维码正在刷新，请稍候…", true);
      return;
    }
    if (!Number.isFinite(Number(currentQrCheckinUserId)) || Number(currentQrCheckinUserId) <= 0) {
      showMsg("请先在“签到账号”中点击“二维码登录”启动会话", true);
      return;
    }
    qrRefreshInFlight = true;
    lastManualQrRefreshAt = now;
    try {
      showMsg("正在刷新二维码...", false);
      await startQrFlow(currentQrCheckinUserId);
      showMsg("二维码已刷新，请扫码", false);
    } catch (error) {
      showMsg("刷新二维码失败: " + error.message, true);
    } finally {
      qrRefreshInFlight = false;
    }
  }

  async function openLocationPrompt(checkinUser) {
    mapPickerTargetUser = checkinUser;
    setMapPickerAvailability(true);
    fillLocationFields(checkinUser.locationProfile || {});
    if (mapFingerprintDetails) {
      mapFingerprintDetails.open = false;
    }
    if (mapSearchKeyword) {
      mapSearchKeyword.value = "";
    }
    if (mapTargetUserHint) {
      mapTargetUserHint.textContent =
        "当前账号：" +
        (checkinUser.userKey || "-") +
        " / " +
        (checkinUser.displayName || "-") +
        "（实际位置认证看地址文本；下面折叠区只是可选的浏览器指纹模拟）";
    }
    openMapModal();
    return false;
  }

  function renderProfile(user) {
    const displayName = user.username || "-";
    currentUsername = String(displayName || "");
    $("userName").textContent = displayName;
    const sidebarName = $("userSidebarName");
    if (sidebarName) {
      sidebarName.textContent = displayName;
    }
    const roleLabel = String(user.role || "").toLowerCase() === "admin" ? "管理员" : "用户";
    const statusLabel = String(user.status || "").toLowerCase() === "active" ? "启用" : "禁用";
    const statusClass = String(user.status || "").toLowerCase() === "active" ? "ok" : "warn";
    const subscriptionRaw = String(user.subscriptionStatus || "").toLowerCase();
    const subscriptionLabel =
      subscriptionRaw === "lifetime" || !subscriptionRaw
        ? "不设有效期"
        : window.DailyFlowWeb.escapeHtml(statusLabelZh(String(user.subscriptionStatus || "-")));
    const groups = (user.groups || [])
      .map((g) => '<span class="pill">用户组：' + window.DailyFlowWeb.escapeHtml(String(g.name || "-")) + " #" + g.id + "</span>")
      .join(" ");
    const registered = user.registeredAt ? formatBeijingDateTime(user.registeredAt) : "-";
    $("profile").innerHTML =
      '<div class="profile-tile"><span class="muted">角色</span><div class="mt-1"><span class="pill">' +
      window.DailyFlowWeb.escapeHtml(roleLabel) +
      "</span></div></div>" +
      '<div class="profile-tile"><span class="muted">状态</span><div class="mt-1"><span class="pill ' +
      statusClass +
      '">' +
      window.DailyFlowWeb.escapeHtml(statusLabel) +
      "</span></div></div>" +
      '<div class="profile-tile"><span class="muted">订阅</span><div class="mt-1"><span class="pill ok">' +
      subscriptionLabel +
      "</span></div></div>" +
      '<div class="profile-tile"><span class="muted">注册时间</span><div class="mt-1"><b>' +
      window.DailyFlowWeb.escapeHtml(registered) +
      "</b></div></div>" +
      '<div class="profile-tile profile-groups"><span class="muted">用户组</span><div class="mt-1">' +
      (groups || '<span class="muted">无</span>') +
      "</div></div>" +
      '<div class="profile-tile profile-actions"><span class="muted">账号操作</span><div class="mt-2 checkin-action-group">' +
      '<button id="btnProfileChangePassword" type="button" class="btn-table btn-table-default" title="修改当前登录密码">修改密码</button>' +
      '<button id="btnProfileLogoutAll" type="button" class="btn-table btn-table-danger" title="退出所有设备（本期为安全预留入口）">退出所有设备</button>' +
      "</div></div>";
    const btnLogout = $("btnLogout");
    if (btnLogout) {
      const logoutTitle = currentUsername ? `退出登录 ${currentUsername}` : "退出登录";
      btnLogout.title = logoutTitle;
      btnLogout.setAttribute("aria-label", logoutTitle);
    }
  }

  function renderNotificationChannels(rows) {
    if (!notifyChannelsTableBody) {
      return;
    }
    const data = Array.isArray(rows) ? rows : [];
    if (!data.length) {
      const emptyText =
        currentUserRole === "admin"
          ? "当前是管理员账号，请到管理控制台为普通用户配置推送通道。"
          : "暂无推送通道";
      notifyChannelsTableBody.innerHTML =
        '<tr><td colspan="7" class="muted">' +
        window.DailyFlowWeb.escapeHtml(emptyText) +
        "</td></tr>";
      return;
    }
    notifyChannelsTableBody.innerHTML = data
      .map((item) => {
        const id = Number(item && item.id ? item.id : 0);
        const editing = Boolean(notifyChannelEditingById[id]);
        const provider = normalizeNotifyProvider(item && item.provider);
        const providerLabel = notifyProviderLabel(provider);
        const keyLabel = notifyKeyLabel(provider);
        const masked = window.DailyFlowWeb.escapeHtml(getNotifyChannelSecretMasked(item));
        const serverUrl = getNotifyChannelServerUrl(item);
        if (!editing) {
          return (
            "<tr>" +
            "<td>" + id + "</td>" +
            "<td>" + window.DailyFlowWeb.escapeHtml(String(item.name || "-")) + "</td>" +
            "<td><span class='pill'>" + window.DailyFlowWeb.escapeHtml(providerLabel) + "</span></td>" +
            "<td><div class='inline-flex items-center gap-2'><code>" + masked + "</code><button data-action='copy-notify-channel' data-id='" + id + "' class='btn-table btn-table-default' title='复制" + window.DailyFlowWeb.escapeHtml(keyLabel) + "' aria-label='复制" + window.DailyFlowWeb.escapeHtml(keyLabel) + "'><i class='ph ph-copy'></i></button></div></td>" +
            "<td>" + (serverUrl ? window.DailyFlowWeb.escapeHtml(serverUrl) : '<span class="muted">默认</span>') + "</td>" +
            "<td><span class='pill " + (item.enabled ? "ok" : "warn") + "'>" + (item.enabled ? "启用" : "禁用") + "</span></td>" +
            "<td><div class='checkin-action-group'>" +
            "<button data-action='test-notify-channel' data-id='" + id + "' class='btn-table btn-table-default' title='发送测试消息'>测试</button>" +
            "<button data-action='edit-notify-channel' data-id='" + id + "' class='btn-table btn-table-primary'>编辑</button>" +
            "<button data-action='delete-notify-channel' data-id='" + id + "' class='btn-table btn-table-danger' title='删除通道' aria-label='删除通道'>删除</button>" +
            "</div></td>" +
            "</tr>"
          );
        }
        return (
          "<tr>" +
          "<td>" + id + "</td>" +
          "<td><input id='notify-name-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' value='" +
          window.DailyFlowWeb.escapeHtml(String(item.name || "")) +
          "'></td>" +
          "<td><select id='notify-provider-" + id + "' data-prev-provider='" +
          window.DailyFlowWeb.escapeHtml(provider) +
          "' class='df-select px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary'>" +
          "<option value='bark'" + (provider === "bark" ? " selected" : "") + ">Bark</option>" +
          "<option value='serverchan'" + (provider === "serverchan" ? " selected" : "") + ">Server酱</option>" +
          "</select></td>" +
          "<td><input id='notify-key-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' placeholder='留空不修改，当前 " +
          masked +
          "'></td>" +
          "<td><input id='notify-server-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' placeholder='" +
          window.DailyFlowWeb.escapeHtml(notifyServerPlaceholder(provider)) +
          "' value='" +
          window.DailyFlowWeb.escapeHtml(String(serverUrl || "")) +
          "'></td>" +
          "<td><select id='notify-enabled-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary'>" +
          "<option value='1'" + (item.enabled ? " selected" : "") + ">启用</option>" +
          "<option value='0'" + (!item.enabled ? " selected" : "") + ">禁用</option>" +
          "</select></td>" +
          "<td><div class='checkin-action-group'>" +
          "<button data-action='save-notify-channel' data-id='" + id + "' class='btn-table btn-table-primary'>保存</button>" +
          "<button data-action='cancel-notify-channel' data-id='" + id + "' class='btn-table btn-table-default'>取消</button>" +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function applyNotifyPanelAccess(role) {
    currentUserRole = String(role || "").trim().toLowerCase();
    const isAdmin = currentUserRole === "admin";
    if (notifyAdminHint) {
      notifyAdminHint.classList.toggle("hidden", !isAdmin);
    }
    if (notifyCreateCard) {
      notifyCreateCard.classList.toggle("hidden", isAdmin);
    }
  }

  function getNotificationChannelLabel(channel) {
    if (!channel || !channel.name) {
      return "未绑定";
    }
    return String(channel.name);
  }

  function closeNotifyBindModal() {
    notifyBindTargetCheckinUserId = null;
    if (notifyBindHint) {
      notifyBindHint.textContent = "-";
    }
    if (notifyBindModal) {
      notifyBindModal.classList.add("hidden");
    }
    document.body.classList.toggle(
      "sidebar-open",
      Boolean(sidebar && sidebar.classList.contains("open"))
    );
  }

  function isNotifyBindModalOpen() {
    return Boolean(notifyBindModal && !notifyBindModal.classList.contains("hidden"));
  }

  function openNotifyBindModal(checkinUser) {
    if (!notifyBindModal || !notifyBindSelect) {
      return;
    }
    notifyBindTargetCheckinUserId = Number(checkinUser && checkinUser.id ? checkinUser.id : 0) || null;
    if (!notifyBindTargetCheckinUserId) {
      return;
    }
    const available = Array.isArray(checkinUser.availableNotificationChannels)
      ? checkinUser.availableNotificationChannels
      : [];
    const selectedId =
      checkinUser.notificationChannelId === null || checkinUser.notificationChannelId === undefined
        ? ""
        : String(checkinUser.notificationChannelId);
    const options = ['<option value="">不绑定（不推送）</option>'];
    for (const channel of available) {
      const id = Number(channel && channel.id ? channel.id : 0);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      options.push(
        '<option value="' +
          id +
          '"' +
          (String(id) === selectedId ? " selected" : "") +
          ">" +
          window.DailyFlowWeb.escapeHtml(
            "#" + id + " " + String(channel.name || "-") + (channel.enabled ? "" : " [禁用]")
          ) +
          "</option>"
      );
    }
    notifyBindSelect.innerHTML = options.join("");
    if (notifyBindHint) {
      notifyBindHint.textContent =
        "账号: " +
        String(checkinUser.userKey || "-") +
        " / " +
        String(checkinUser.displayName || "-") +
        "，当前: " +
        getNotificationChannelLabel(checkinUser.notificationChannel);
    }
    notifyBindModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
  }

  function isAutoCheckinPauseActive(checkinUser) {
    const until = String(
      checkinUser && checkinUser.autoCheckinPauseUntil
        ? checkinUser.autoCheckinPauseUntil
        : ""
    ).trim();
    if (!until) {
      return false;
    }
    return until >= todayDateOnlyText();
  }

  function formatAutoCheckinPauseHtml(checkinUser) {
    const until = String(
      checkinUser && checkinUser.autoCheckinPauseUntil
        ? checkinUser.autoCheckinPauseUntil
        : ""
    ).trim();
    if (!until) {
      return "";
    }
    const label = formatDateOnlyWithWeekday(until) || until;
    if (isAutoCheckinPauseActive(checkinUser)) {
      return (
        "<div style='margin-top:6px;'><span class='pill warn'>自动签到暂停至 " +
        window.DailyFlowWeb.escapeHtml(label) +
        "</span></div>"
      );
    }
    return (
      "<div style='margin-top:6px;'><span class='muted'>上次暂停到 " +
      window.DailyFlowWeb.escapeHtml(label) +
      "</span></div>"
    );
  }

  function renderCheckinUsers(rows) {
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="px-6 py-8 text-center">' +
        '<div class="inline-flex flex-col items-center gap-3 text-slate-500">' +
        '<i class="ph ph-user-list text-4xl text-slate-300"></i>' +
        "<p>暂无签到账号，请先自己创建</p>" +
        '<button data-action="create-own-checkin" class="btn-table btn-table-default">自己创建</button>' +
        "</div></td></tr>";
      return;
    }
    tbody.innerHTML = rows
      .map((u) => {
        const checkinTimeText = window.DailyFlowWeb.escapeHtml(parseCronToTimeLabel(u.cronExpr) || "-");
        const warningTimeText = window.DailyFlowWeb.escapeHtml(u.warningTime || "-");
        const pauseHtml = formatAutoCheckinPauseHtml(u);
        const pauseCompactHtml = pauseHtml
          ? '<div class="checkin-summary-stack">' + pauseHtml + "</div>"
          : "";
        return (
          "<tr>" +
          "<td>" +
          '<div class="checkin-account-cell">' +
          '<div class="checkin-account-name">' +
          window.DailyFlowWeb.escapeHtml(u.displayName || "-") +
          "</div>" +
          '<div class="checkin-account-meta">ID #' +
          window.DailyFlowWeb.escapeHtml(String(u.id || "-")) +
          "</div>" +
          "</div>" +
          "</td>" +
          "<td>" +
          '<div class="checkin-status-brief">' +
          '<div class="checkin-pill-row">' +
          "<span class='pill " +
          (u.enabled ? "ok" : "warn") +
          "'>" +
          (u.enabled ? "启用" : "禁用") +
          "</span>" +
          "<span class='pill " +
          (u.hasAuthState ? "ok" : "warn") +
          "'>" +
          (u.hasAuthState ? "已登录" : "未登录") +
          "</span>" +
          formatCompactCheckinStatusPill(u.id) +
          formatCompactExecutionStatusPill(u.executionStatus) +
          "</div>" +
          '<div class="checkin-summary-stack">' +
          formatCompactStatusSummary(u.id, u.executionStatus) +
          "</div>" +
          pauseCompactHtml +
          "</div>" +
          "</td>" +
          "<td>" +
          '<div class="checkin-time-stack">' +
          '<div class="checkin-time-item"><span class="checkin-time-label">自动签到</span><span class="checkin-time-value">' +
          checkinTimeText +
          "</span></div>" +
          '<div class="checkin-time-item"><span class="checkin-time-label">告警提醒</span><span class="checkin-time-value">' +
          warningTimeText +
          "</span></div>" +
          "</div>" +
          "</td>" +
          "<td>" +
          '<div class="checkin-location-brief">' +
          formatCompactLocationSummary(u) +
          "</div>" +
          "</td>" +
          "<td>" +
          '<div class="checkin-cookie-brief">' +
          formatCompactCookieStatusPill(u.id) +
          '<div class="checkin-summary-stack">' +
          formatCompactCookieSummary(u.id, u.notificationChannel) +
          "</div>" +
          "</div>" +
          "</td>" +
          "<td>" +
          '<div class="checkin-action-group checkin-action-group-compact">' +
          '<button data-action="manual-run" data-id="' +
          u.id +
          '" class="btn-table btn-table-primary">手动签到</button>' +
          '<button data-action="time-settings" data-id="' +
          u.id +
          '" class="btn-table btn-table-primary">修改时间</button>' +
          '<button data-action="qr" data-id="' +
          u.id +
          '" class="btn-table btn-table-default">二维码登录</button>' +
          '<details class="checkin-more-menu">' +
          '<summary class="btn-table btn-table-default cursor-pointer list-none">更多</summary>' +
          '<div class="checkin-more-panel">' +
          '<button data-action="check-checkin-status" data-id="' +
          u.id +
          '" class="btn-table btn-table-default w-full text-left">检查签到</button>' +
          '<button data-action="refresh-cookie-status" data-id="' +
          u.id +
          '" class="btn-table btn-table-default w-full text-left">刷新状态</button>' +
          '<button data-action="location" data-id="' +
          u.id +
          '" class="btn-table btn-table-default w-full text-left">设置位置</button>' +
          '<button data-action="pause-auto-checkin" data-id="' +
          u.id +
          '" class="btn-table btn-table-default w-full text-left">' +
          (isAutoCheckinPauseActive(u) ? "暂停设置" : "暂停签到") +
          "</button>" +
          '<button data-action="bind-notify-channel" data-id="' +
          u.id +
          '" class="btn-table btn-table-default w-full text-left">绑定推送</button>' +
          '<button data-action="view-cookies" data-id="' +
          u.id +
          '" class="btn-table btn-table-muted w-full text-left">查看Cookie</button>' +
          '<button data-action="view-logs" data-id="' +
          u.id +
          '" class="btn-table btn-table-muted w-full text-left">查看日志</button>' +
          "</div>" +
          "</details>" +
          "</div>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function loadCheckinUsers() {
    const payload = await window.DailyFlowWeb.api("/user/checkin-users");
    checkinUsers = payload.checkinUsers || [];
    pruneCookieStatusCache(checkinUsers);
    pruneCheckinStatusCache(checkinUsers);
    syncStatusCacheFromServerRows(checkinUsers);
    renderQuota(payload.quota || null);
    renderCheckinUsers(checkinUsers);
  }

  async function loadNotificationChannels() {
    const payload = await window.DailyFlowWeb.api("/user/notification-channels?includeSecret=1");
    notificationChannels = Array.isArray(payload && payload.channels) ? payload.channels : [];
    const valid = new Set(notificationChannels.map((row) => String(Number(row && row.id ? row.id : 0))));
    for (const key of Object.keys(notifyChannelEditingById)) {
      if (!valid.has(String(key))) {
        delete notifyChannelEditingById[key];
      }
    }
    renderNotificationChannels(notificationChannels);
  }

  async function refreshCookieStatusForUser(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/user/checkin-users/" + checkinUserId + "/check-cookie",
      { method: "POST" }
    );
    const result = payload && payload.result ? payload.result : null;
    updateCookieStatus(checkinUserId, result);
    return normalizeCookieStatusResult(result);
  }

  async function refreshCheckinStatusForUser(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/user/checkin-users/" + checkinUserId + "/check-checkin-status",
      { method: "POST" }
    );
    const result = payload && payload.result ? payload.result : null;
    updateCheckinStatus(checkinUserId, result);
    return normalizeCheckinStatusResult(result);
  }

  async function refreshStatusForAll() {
    const rows = Array.isArray(checkinUsers) ? checkinUsers.slice() : [];
    if (!rows.length) {
      showMsg("暂无签到账号可刷新状态", true);
      return;
    }
    let cookieOkCount = 0;
    let cookieFailCount = 0;
    let checkinOkCount = 0;
    let checkinFailCount = 0;
    for (const row of rows) {
      try {
        const cookieResult = await refreshCookieStatusForUser(row.id);
        if (cookieResult.ok) {
          cookieOkCount += 1;
        } else {
          cookieFailCount += 1;
        }
      } catch (error) {
        cookieFailCount += 1;
        updateCookieStatus(row.id, {
          ok: false,
          status: "error",
          message: String(error.message || "刷新失败"),
          checkedAt: new Date().toISOString(),
          finalUrl: ""
        });
      }
      try {
        const checkinResult = await refreshCheckinStatusForUser(row.id);
        if (checkinResult.ok) {
          checkinOkCount += 1;
        } else {
          checkinFailCount += 1;
        }
      } catch (error) {
        checkinFailCount += 1;
        updateCheckinStatus(row.id, {
          ok: false,
          status: "error",
          message: String(error.message || "刷新失败"),
          checkedAt: new Date().toISOString()
        });
      }
      renderCheckinUsers(checkinUsers);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    showMsg(
      `状态刷新完成：Cookie 成功 ${cookieOkCount}/失败 ${cookieFailCount}，签到 成功 ${checkinOkCount}/失败 ${checkinFailCount}`,
      cookieFailCount > 0 || checkinFailCount > 0
    );
  }

  createCheckinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter || createCheckinForm.querySelector('button[type="submit"]');
    await runGuardedButtonAction(
      button,
      { key: "user:create-checkin-user", loadingText: "创建中..." },
      async () => {
        try {
          const quota = currentQuota;
          if (quota && quota.limit !== null && Number(quota.remaining || 0) <= 0) {
            showMsg("已达到用户组可创建上限，无法继续创建。", true);
            return;
          }
          const payload = await window.DailyFlowWeb.api("/user/checkin-users", {
            method: "POST",
            body: {
              displayName: $("ckDisplayName").value.trim(),
              cronExpr: timeToCronExpr($("ckCheckinTime").value),
              timezone: "Asia/Shanghai",
              warningTime: $("ckWarning").value.trim() || "23:00"
            }
          });
          createCheckinForm.reset();
          $("ckCheckinTime").value = "08:00";
          $("ckWarning").value = "23:00";
          await loadCheckinUsers();
          const key = payload && payload.checkinUser ? payload.checkinUser.userKey : "";
          showMsg(key ? "签到账号创建成功，系统编号: " + key : "签到账号创建成功", false);
          if ($("ckAutoQr").checked && payload && payload.checkinUser && payload.checkinUser.id) {
            await startQrFlow(payload.checkinUser.id);
          }
        } catch (error) {
          showMsg("创建签到账号失败: " + error.message, true);
        }
      }
    );
    renderQuota(currentQuota);
  });

  if (createNotifyChannelForm) {
    createNotifyChannelForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (currentUserRole === "admin") {
        showMsg("管理员请在管理控制台的“用户管理”里配置推送通道。", false);
        return;
      }
      const button =
        event.submitter || btnCreateNotifyChannel || createNotifyChannelForm.querySelector('button[type="submit"]');
      await runGuardedButtonAction(
        button,
        { key: "user:create-notify-channel", loadingText: "创建中..." },
        async () => {
          try {
            const normalized = normalizeNotifySubmitInput(
              $("notifyChannelProvider") && $("notifyChannelProvider").value
                ? $("notifyChannelProvider").value
                : "bark",
              String($("notifyChannelBarkKey").value || ""),
              String($("notifyChannelServerUrl").value || ""),
              { requiredKey: true }
            );
            await window.DailyFlowWeb.api("/user/notification-channels", {
              method: "POST",
              body: {
                name: String($("notifyChannelName").value || "").trim(),
                provider: normalized.provider,
                barkDeviceKey: normalized.secretKey,
                barkServerUrl: normalized.serverUrl,
                enabled: true
              }
            });
            createNotifyChannelForm.reset();
            if ($("notifyChannelProvider")) {
              $("notifyChannelProvider").value = "bark";
            }
            applyNotifyCreateProviderUi();
            await Promise.all([loadNotificationChannels(), loadCheckinUsers()]);
            showMsg("推送通道创建成功", false);
          } catch (error) {
            showMsg("创建推送通道失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnNotifyBarkCopy) {
    btnNotifyBarkCopy.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:notify-bark-copy", loadingText: "复制中...", cooldownMs: 600 },
        async () => {
          const value = String($("notifyChannelBarkKey") && $("notifyChannelBarkKey").value ? $("notifyChannelBarkKey").value : "").trim();
          if (!value) {
            showMsg("当前没有可复制的通道密钥", true);
            return;
          }
          await copyTextToClipboard(value);
          showMsg("通道密钥已复制", false);
        }
      );
    });
  }
  if (notifyChannelProvider) {
    notifyChannelProvider.addEventListener("change", () => {
      applyNotifyCreateProviderUi();
    });
  }

  if (notifyChannelsTableBody) {
    notifyChannelsTableBody.addEventListener("change", (event) => {
      const select = event.target.closest("select[id^='notify-provider-']");
      if (!select) {
        return;
      }
      const channelId = Number(String(select.id).replace("notify-provider-", ""));
      if (!Number.isFinite(channelId) || channelId <= 0) {
        return;
      }
      const serverInput = $("notify-server-" + channelId);
      if (serverInput) {
        serverInput.placeholder = notifyServerPlaceholder(select.value);
        syncNotifyServerInputForProvider(
          select.value,
          serverInput,
          String(select.dataset.prevProvider || "")
        );
      }
      select.dataset.prevProvider = normalizeNotifyProvider(select.value);
    });
    notifyChannelsTableBody.addEventListener("click", async (event) => {
      if (currentUserRole === "admin") {
        showMsg("管理员请在管理控制台的“用户管理”里配置推送通道。", false);
        return;
      }
      const target = event.target.closest("button[data-action]");
      if (!target) {
        return;
      }
      const action = String(target.dataset.action || "");
      const channelId = Number(target.dataset.id);
      if (!Number.isFinite(channelId) || channelId <= 0) {
        return;
      }
      if (action === "edit-notify-channel") {
        notifyChannelEditingById[channelId] = true;
        renderNotificationChannels(notificationChannels);
        return;
      }
      if (action === "cancel-notify-channel") {
        delete notifyChannelEditingById[channelId];
        renderNotificationChannels(notificationChannels);
        return;
      }
      if (action === "copy-notify-channel") {
        await runGuardedButtonAction(
          target,
          { key: "user:copy-notify-channel:" + channelId, loadingText: "复制中...", cooldownMs: 600 },
          async () => {
            const channel = notificationChannels.find((row) => Number(row && row.id) === channelId);
            const value = getNotifyChannelSecretRaw(channel);
            if (!value) {
              showMsg("该通道未返回可复制的密钥（请进入编辑后更新）", true);
              return;
            }
            await copyTextToClipboard(value);
            showMsg("通道密钥已复制", false);
          }
        );
        return;
      }
      if (action === "test-notify-channel") {
        await runGuardedButtonAction(
          target,
          { key: "user:test-notify-channel:" + channelId, loadingText: "测试中..." },
          async () => {
            try {
              const payload = await window.DailyFlowWeb.api(
                "/user/notification-channels/" + channelId + "/test",
                { method: "POST" }
              );
              const message =
                payload && payload.result && payload.result.message
                  ? String(payload.result.message)
                  : "测试消息已发送";
              showMsg(message, false);
            } catch (error) {
              showMsg("测试推送通道失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "save-notify-channel") {
        await runGuardedButtonAction(
          target,
          { key: "user:save-notify-channel:" + channelId, loadingText: "保存中..." },
          async () => {
            try {
              const normalized = normalizeNotifySubmitInput(
                String($("notify-provider-" + channelId).value || "bark"),
                String($("notify-key-" + channelId).value || ""),
                String($("notify-server-" + channelId).value || ""),
                { requiredKey: false }
              );
              await window.DailyFlowWeb.api("/user/notification-channels/" + channelId, {
                method: "PATCH",
                body: {
                  name: String($("notify-name-" + channelId).value || "").trim(),
                  provider: normalized.provider,
                  barkDeviceKey: normalized.secretKey || undefined,
                  barkServerUrl: normalized.serverUrl,
                  enabled: String($("notify-enabled-" + channelId).value || "1") === "1"
                }
              });
              delete notifyChannelEditingById[channelId];
              await Promise.all([loadNotificationChannels(), loadCheckinUsers()]);
              showMsg("推送通道已更新", false);
            } catch (error) {
              showMsg("更新推送通道失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "delete-notify-channel") {
        if (!window.confirm("确认删除该推送通道吗？已绑定该通道的签到账号会自动解绑。")) {
          return;
        }
        await runGuardedButtonAction(
          target,
          { key: "user:delete-notify-channel:" + channelId, loadingText: "删除中..." },
          async () => {
            try {
              await window.DailyFlowWeb.api("/user/notification-channels/" + channelId, {
                method: "DELETE"
              });
              delete notifyChannelEditingById[channelId];
              await Promise.all([loadNotificationChannels(), loadCheckinUsers()]);
              showMsg("推送通道已删除", false);
            } catch (error) {
              showMsg("删除推送通道失败: " + error.message, true);
            }
          }
        );
      }
    });
  }

  tbody.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }
    const action = target.dataset.action;
    if (action === "create-own-checkin") {
      const createCard = $("createCheckinCard");
      const displayNameInput = $("ckDisplayName");
      if (createCard) {
        createCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (displayNameInput) {
        window.setTimeout(() => {
          displayNameInput.focus();
        }, 220);
      }
      return;
    }
    const id = Number(target.dataset.id);
    if (!action || !Number.isFinite(id)) {
      return;
    }
    const checkinUser = checkinUsers.find((item) => item.id === id);
    if (!checkinUser) {
      showMsg("签到账号不存在或权限不足", true);
      return;
    }
    if (action === "view-cookies") {
      showMsg(buildCookieInspectText(checkinUser), false);
      return;
    }
    const loadingTextByAction = {
      qr: "生成中...",
      "manual-run": "执行中...",
      "check-checkin-status": "检查中...",
      "refresh-cookie-status": "检查中...",
      "check-cookie": "检查中...",
      "time-settings": "加载中...",
      "pause-auto-checkin": "加载中...",
      location: "加载中...",
      "bind-notify-channel": "加载中...",
      "view-logs": "加载中..."
    };
    await runGuardedButtonAction(
      target,
      {
        key: "user:checkin-user:" + action + ":" + id,
        loadingText: loadingTextByAction[action] || "处理中..."
      },
      async () => {
        try {
          if (action === "qr") {
            showMsg("正在生成二维码...", false);
            await startQrFlow(id);
            showMsg("二维码会话已启动，请扫码", false);
            return;
          }
          if (action === "location") {
            await openLocationPrompt(checkinUser);
            showMsg("位置设置面板已打开，请填写实际提交的地址文本。", false);
            return;
          }
          if (action === "pause-auto-checkin") {
            openAutoPauseModal(checkinUser);
            showMsg("请选择暂停到的日期。自动签到会暂停，但未签到告警会保留。", false);
            return;
          }
          if (action === "time-settings") {
            openTimeSettingsModal(checkinUser);
            showMsg("请修改自动签到时间和未签到告警时间。", false);
            return;
          }
          if (action === "bind-notify-channel") {
            openNotifyBindModal(checkinUser);
            showMsg("请选择推送通道并保存。", false);
            return;
          }
          if (action === "manual-run") {
            const payload = await window.DailyFlowWeb.api(
              "/user/checkin-users/" + id + "/manual-run",
              { method: "POST" }
            );
            const status = payload && payload.result ? payload.result.status : "unknown";
            const statusText = statusLabelZh(status);
            const message = payload && payload.result ? payload.result.message : "";
            const preview =
              payload && payload.result && payload.result.preview
                ? String(payload.result.preview).replace(/\s+/g, " ").slice(0, 120)
                : "";
            const hint =
              status === "failed" && preview ? " | 页面预览: " + preview : "";
            showMsg("手动执行完成: " + statusText + (message ? " - " + message : "") + hint, false);
            await loadCheckinUsers();
            return;
          }
          if (action === "check-checkin-status") {
            const result = await refreshCheckinStatusForUser(id);
            const status = result && result.status ? String(result.status) : "unknown";
            const message = result && result.message ? String(result.message) : "";
            renderCheckinUsers(checkinUsers);
            showMsg(
              "签到状态检查: " +
                checkinStatusLabel(status) +
                (message ? " - " + message : ""),
              status === "error" || status === "auth_missing" || status === "auth_expired" || status === "invalid_state"
            );
            return;
          }
          if (action === "refresh-cookie-status" || action === "check-cookie") {
            const cookieResult = await refreshCookieStatusForUser(id);
            const checkinResult = await refreshCheckinStatusForUser(id);
            const cookieStatus = cookieResult && cookieResult.status ? String(cookieResult.status) : "unknown";
            const cookieStatusText = cookieStatusLabel(cookieStatus);
            const cookieMessage = cookieResult && cookieResult.message ? String(cookieResult.message) : "";
            const finalUrl = cookieResult && cookieResult.finalUrl ? String(cookieResult.finalUrl) : "";
            const cookieHint = finalUrl ? " | URL: " + finalUrl : "";
            const reloginHint = ["missing", "expired", "invalid_state"].includes(cookieStatus)
              ? " | 请重新扫码登录"
              : "";
            const checkinStatus = checkinResult && checkinResult.status ? checkinStatusLabel(String(checkinResult.status)) : "未检查";
            const checkinMessage = checkinResult && checkinResult.message ? String(checkinResult.message) : "";
            showMsg(
              "状态刷新: Cookie " +
                cookieStatusText +
                (cookieMessage ? " - " + cookieMessage : "") +
                cookieHint +
                " | 签到 " +
                checkinStatus +
                (checkinMessage ? " - " + checkinMessage : "") +
                reloginHint,
              !cookieResult || !cookieResult.ok || !checkinResult || !checkinResult.ok
            );
            renderCheckinUsers(checkinUsers);
            return;
          }
          if (action === "view-logs") {
            openLogModal(
              id,
              String(checkinUser.userKey || "-") + " / " + String(checkinUser.displayName || "-")
            );
            await loadCheckinLogs(id);
          }
        } catch (error) {
          showMsg("操作失败: " + error.message, true);
        }
      }
    );
  });

  if (btnRefreshCookieStatusAll) {
    btnRefreshCookieStatusAll.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        {
          key: "user:refresh-cookie-status-all",
          loadingText: "刷新中...",
          cooldownMs: 1400
        },
        async () => {
          try {
            await refreshStatusForAll();
          } catch (error) {
            showMsg("刷新状态失败: " + error.message, true);
          }
        }
      );
    });
  }

  if (btnLogModalClose) {
    btnLogModalClose.addEventListener("click", () => {
      closeLogModal();
    });
  }
  if (btnLogRefresh) {
    btnLogRefresh.addEventListener("click", async (event) => {
      if (!Number.isFinite(Number(logTargetCheckinUserId)) || Number(logTargetCheckinUserId) <= 0) {
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:checkin-log-refresh", loadingText: "刷新中..." },
        async () => {
          try {
            await loadCheckinLogs(logTargetCheckinUserId);
          } catch (error) {
            showMsg("刷新日志失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnLogClear) {
    btnLogClear.addEventListener("click", async (event) => {
      if (!Number.isFinite(Number(logTargetCheckinUserId)) || Number(logTargetCheckinUserId) <= 0) {
        return;
      }
      if (!window.confirm("确认清除该签到账号的全部日志吗？此操作不可撤销。")) {
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "user:checkin-log-clear", loadingText: "清除中..." },
        async () => {
          try {
            const deleted = await clearCheckinLogs(logTargetCheckinUserId);
            await loadCheckinLogs(logTargetCheckinUserId);
            showMsg(`日志已清除，删除 ${deleted} 条记录`, false);
          } catch (error) {
            showMsg("清除日志失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (logModal) {
    logModal.addEventListener("click", (event) => {
      if (event.target === logModal) {
        closeLogModal();
      }
    });
  }

  async function init() {
    try {
      const me = await window.DailyFlowWeb.fetchMe();
      if (!me || !me.user) {
        logout();
        return;
      }
      if (me.user.role === "admin") {
        location.replace("/web/admin");
        return;
      }
      renderProfile(me.user);
      switchPanel("user-panel-profile");
      applyNotifyPanelAccess(me.user.role || "");
      applyNotifyCreateProviderUi();
      if (btnGoAdmin) {
        btnGoAdmin.classList.add("hidden");
      }
      $("createCheckinCard").classList.remove("hidden");
      await Promise.all([loadCheckinUsers(), loadNotificationChannels()]);
    } catch (error) {
      if (error && error.status === 401) {
        logout();
        return;
      }
      showMsg("加载失败: " + error.message, true);
    }
  }

  window.addEventListener("beforeunload", () => {
    closeChangePasswordModal();
    closeMapModal();
    closeNotifyBindModal();
    closeLogModal();
    stopQrWs();
    stopQrPoll();
  });
  syncRefreshButtonMeta();
  init();
})();
