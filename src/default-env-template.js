const fs = require("fs");

const defaultEnvTemplate = `DB_PATH=./data/database.sqlite
ARTIFACTS_DIR=./data/artifacts
HEADLESS=true
DEFAULT_TIMEZONE=Asia/Shanghai
NAVIGATION_TIMEOUT_MS=120000
LOGIN_WAIT_TIMEOUT_MS=180000
CHECKIN_ACTION_TIMEOUT_MS=60000
NOTIFIER_PROVIDER=bark
NOTIFIER_WEBHOOK=
BARK_SERVER_URL=https://api.day.app
BARK_DEVICE_KEY=
BARK_GROUP=Daily Flow
DEFAULT_USER_AGENT=
AUTH_HTTP_PORT=21777
HEALTH_PORT=21787
JWT_SECRET=replace-this-with-strong-secret
JWT_TTL_HOURS=12
REGISTRATION_ENABLED=false
REGISTRATION_REQUIRE_INVITE=false
REGISTRATION_DEFAULT_GROUP=user
ADMIN_PASSWORD_HASH=change-this-admin-password
IP_LOOKUP_PROVIDER=ip.sb
IP_LOOKUP_TIMEOUT_MS=3000
QR_BROWSER_IDLE_CLOSE_MS=45000
MAP_SDK_ENABLED=true
MAP_SDK_PROVIDER=amap
MAP_SDK_AMAP_KEY=
MAP_SDK_DEFAULT_COORD_SYSTEM=gcj02
GIT_GUARD_ENABLED=true
GIT_GUARD_STRICT=true

DEFAULT_TARGET_URL=https://lqpjtq.aliwork.com/s/rollcall?corpid=dingc10c14f113509f69f5bf40eda33b7ba0&ddtab=true
`;

function writeDefaultEnvFile(filePath) {
  fs.writeFileSync(filePath, defaultEnvTemplate, "utf8");
}

module.exports = {
  defaultEnvTemplate,
  writeDefaultEnvFile
};
