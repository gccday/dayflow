function normalizeIp(raw) {
  if (!raw) {
    return "";
  }

  let value = String(raw).trim();
  if (value.includes(",")) {
    value = value.split(",")[0].trim();
  }

  if (value.startsWith("::ffff:")) {
    value = value.slice(7);
  }

  if (value === "::1") {
    return "127.0.0.1";
  }

  return value;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return normalizeIp(forwarded);
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return normalizeIp(realIp);
  }

  return normalizeIp(req.socket?.remoteAddress || "");
}

class IpLookupService {
  constructor({ provider, timeoutMs }) {
    this.provider = provider || "ip.sb";
    this.timeoutMs = timeoutMs || 3000;
  }

  buildUrl(ip) {
    if (this.provider === "ip.sb") {
      return `https://api.ip.sb/geoip/${encodeURIComponent(ip)}`;
    }
    return "";
  }

  async lookup(ip) {
    if (!ip) {
      return {
        geoStatus: "skipped",
        geoJson: null,
        geoError: "empty ip"
      };
    }

    const endpoint = this.buildUrl(ip);
    if (!endpoint) {
      return {
        geoStatus: "failed",
        geoJson: null,
        geoError: `unsupported provider: ${this.provider}`
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json"
        }
      });

      if (!response.ok) {
        return {
          geoStatus: "failed",
          geoJson: null,
          geoError: `status ${response.status}`
        };
      }

      const json = await response.json();
      return {
        geoStatus: "success",
        geoJson: json,
        geoError: null
      };
    } catch (error) {
      return {
        geoStatus: "failed",
        geoJson: null,
        geoError: String(error.message || "lookup error")
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  getClientIp,
  IpLookupService
};
