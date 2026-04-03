const healthState = require("../health/state");

function log(level, message, meta = null) {
  const ts = new Date().toISOString();
  if (meta === null || meta === undefined) {
    process.stdout.write(`[${ts}] [${level}] ${message}\n`);
    return;
  }
  process.stdout.write(`[${ts}] [${level}] ${message} ${JSON.stringify(meta)}\n`);
}

module.exports = {
  info(message, meta) {
    log("INFO", message, meta);
  },
  warn(message, meta) {
    log("WARN", message, meta);
  },
  error(message, meta) {
    const metaText =
      meta === null || meta === undefined ? "" : JSON.stringify(meta);
    healthState.markError(`${message}${metaText ? ` ${metaText}` : ""}`);
    log("ERROR", message, meta);
  }
};
