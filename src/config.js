const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { generateUserAgentByProfile } = require("./services/user-agent");

const BUILTIN_DEFAULT_TARGET_URL =
  "https://lqpjtq.aliwork.com/s/rollcall?corpid=dingc10c14f113509f69f5bf40eda33b7ba0&ddtab=true";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function getBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  return String(raw).toLowerCase() === "true";
}

function getNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getString(name, fallback = "") {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    return fallback;
  }
  return String(raw);
}

const config = {
  envPath,
  dbPath: path.resolve(process.cwd(), process.env.DB_PATH || "./data/database.sqlite"),
  artifactsDir: path.resolve(process.cwd(), process.env.ARTIFACTS_DIR || "./data/artifacts"),
  headless: getBoolean("HEADLESS", true),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || "Asia/Shanghai",
  navigationTimeoutMs: getNumber("NAVIGATION_TIMEOUT_MS", 120000),
  loginWaitTimeoutMs: getNumber("LOGIN_WAIT_TIMEOUT_MS", 180000),
  checkinActionTimeoutMs: getNumber("CHECKIN_ACTION_TIMEOUT_MS", 60000),
  notifierProvider: (process.env.NOTIFIER_PROVIDER || "bark").trim().toLowerCase(),
  notifierWebhook: process.env.NOTIFIER_WEBHOOK || "",
  barkServerUrl: (process.env.BARK_SERVER_URL || "https://api.day.app").trim(),
  barkDeviceKey: (process.env.BARK_DEVICE_KEY || "").trim(),
  barkGroup: (process.env.BARK_GROUP || "DayFlow").trim(),
  serverChanServerUrl: (process.env.SERVERCHAN_SERVER_URL || "https://sct.ftqq.com/forward").trim(),
  defaultUserAgent: process.env.DEFAULT_USER_AGENT || generateUserAgentByProfile("ios"),
  authHttpPort: getNumber("AUTH_HTTP_PORT", 21777),
  healthPort: getNumber("HEALTH_PORT", 21787),
  jwtSecret: process.env.JWT_SECRET || "",
  jwtTtlHours: getNumber("JWT_TTL_HOURS", 12),
  registrationEnabled: getBoolean("REGISTRATION_ENABLED", false),
  registrationRequireInvite: getBoolean("REGISTRATION_REQUIRE_INVITE", false),
  registrationDefaultGroupName: (process.env.REGISTRATION_DEFAULT_GROUP || "user").trim(),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  ipLookupProvider: process.env.IP_LOOKUP_PROVIDER || "ip.sb",
  ipLookupTimeoutMs: getNumber("IP_LOOKUP_TIMEOUT_MS", 3000),
  qrBrowserIdleCloseMs: getNumber("QR_BROWSER_IDLE_CLOSE_MS", 45000),
  mapSdkEnabled: getBoolean("MAP_SDK_ENABLED", true),
  mapSdkProvider: (process.env.MAP_SDK_PROVIDER || "amap").trim().toLowerCase(),
  mapSdkAmapKey: process.env.MAP_SDK_AMAP_KEY || "",
  mapSdkDefaultCoordSystem: (process.env.MAP_SDK_DEFAULT_COORD_SYSTEM || "gcj02")
    .trim()
    .toLowerCase(),
  gitGuardEnabled: getBoolean("GIT_GUARD_ENABLED", true),
  gitGuardStrict: getBoolean("GIT_GUARD_STRICT", true),
  defaultTargetUrl: getString("DEFAULT_TARGET_URL", BUILTIN_DEFAULT_TARGET_URL).trim(),
  defaultCheckinButtonText: "立即签到",
  defaultSignedMarkerText: "今日已签到",
  defaultLocationRefreshText: "重新定位"
};

module.exports = config;
