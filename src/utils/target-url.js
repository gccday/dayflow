const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "www.example.com",
  "example.org",
  "www.example.org",
  "example.net",
  "www.example.net"
]);

function isPlaceholderHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) {
    return false;
  }
  if (PLACEHOLDER_HOSTS.has(host)) {
    return true;
  }
  return (
    host.endsWith(".example.com") ||
    host.endsWith(".example.org") ||
    host.endsWith(".example.net")
  );
}

function validateCheckinTargetUrl(rawValue, options = {}) {
  const allowEmpty = options.allowEmpty !== false;
  const text = String(rawValue || "").trim();
  if (!text) {
    return allowEmpty
      ? { ok: true, normalizedUrl: "", code: "empty" }
      : { ok: false, code: "empty", message: "未配置签到链接，请先填写真实签到页链接" };
  }

  let parsed = null;
  try {
    parsed = new URL(text);
  } catch (_error) {
    return {
      ok: false,
      code: "invalid_format",
      message: "签到链接格式无效，请填写完整的 http/https 地址"
    };
  }

  const protocol = String(parsed.protocol || "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      ok: false,
      code: "invalid_protocol",
      message: "签到链接格式无效，请填写完整的 http/https 地址"
    };
  }

  if (isPlaceholderHost(parsed.hostname)) {
    return {
      ok: false,
      code: "placeholder_host",
      message: "当前签到链接仍是示例地址，请先改成真实签到页链接"
    };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    code: "ok"
  };
}

module.exports = {
  validateCheckinTargetUrl
};
