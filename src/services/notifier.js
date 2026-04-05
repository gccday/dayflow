const fs = require("fs");

function truncateText(text, max = 1000) {
  if (text === null || text === undefined) {
    return "";
  }
  const raw = String(text);
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function trimSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function isHttpUrl(text) {
  return /^https?:\/\//i.test(String(text || "").trim());
}

const SERVERCHAN_FORWARD_URL = "https://sct.ftqq.com/forward";
const SERVERCHAN_SEND_API_BASE = "https://sctapi.ftqq.com";
const SERVERCHAN_SENDKEY_RE = /^SCT[A-Za-z0-9]{6,}$/i;

function normalizeServerChanForwardUrl(rawUrl, fieldName = "serverChanServerUrl") {
  const text = String(rawUrl || "").trim();
  if (!text) {
    return SERVERCHAN_FORWARD_URL;
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

function normalizeServerChanSendKey(rawKey, fieldName = "serverChanSendKey") {
  const text = String(rawKey || "").trim();
  if (!text) {
    return "";
  }
  if (!SERVERCHAN_SENDKEY_RE.test(text)) {
    throw new Error(`${fieldName} invalid, expected SendKey like SCTxxxx`);
  }
  return text;
}

function parseServerChanSendKeyFromUrl(rawUrl, fieldName = "serverchan link") {
  const input = String(rawUrl || "").trim();
  let parsed = null;
  try {
    parsed = new URL(input);
  } catch (_error) {
    throw new Error(
      `${fieldName} invalid, only supports https://sct.ftqq.com/forward or https://sctapi.ftqq.com/{SendKey}.send`
    );
  }
  const serverUrl = normalizeServerChanForwardUrl(input, fieldName);
  if (serverUrl === SERVERCHAN_FORWARD_URL) {
    return {
      sendKey: String(
        parsed.searchParams.get("sendkey") || parsed.searchParams.get("sendKey") || ""
      ).trim(),
      serverUrl
    };
  }
  const match = String(parsed.pathname || "").match(/^\/([^/]+)\.send$/i);
  return {
    sendKey: String((match && match[1]) || "").trim(),
    serverUrl
  };
}

function parseServerChanInput(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    return {
      sendKey: "",
      serverUrl: SERVERCHAN_FORWARD_URL
    };
  }
  if (!isHttpUrl(raw)) {
    return {
      sendKey: normalizeServerChanSendKey(raw, "serverChanSendKey"),
      serverUrl: SERVERCHAN_FORWARD_URL
    };
  }
  const parsed = parseServerChanSendKeyFromUrl(raw, "serverchan link");
  const sendKey = normalizeServerChanSendKey(parsed.sendKey, "serverChanSendKey");
  return {
    sendKey,
    serverUrl: parsed.serverUrl
  };
}

function inferNotifierProviderByChannel(channel, fallbackProvider = "bark") {
  const row = channel && typeof channel === "object" ? channel : {};
  const fallback = String(fallbackProvider || "bark")
    .trim()
    .toLowerCase();
  const rawProvider = String(row.provider || "").trim().toLowerCase();
  if (rawProvider === "webhook") {
    return "webhook";
  }
  if (!rawProvider && fallback === "webhook") {
    return "webhook";
  }
  if (rawProvider === "serverchan" || rawProvider === "bark") {
    if (rawProvider === "serverchan") {
      return "serverchan";
    }
    const serverUrl = String(
      row.serverChanServerUrl ||
        row.server_chan_server_url ||
        row.barkServerUrl ||
        row.bark_server_url ||
        ""
    ).trim();
    if (serverUrl) {
      try {
        if (normalizeServerChanForwardUrl(serverUrl, "serverChanServerUrl")) {
          return "serverchan";
        }
      } catch (_error) {
        // keep bark
      }
    }
    return "bark";
  }
  return fallback === "serverchan" || fallback === "bark" ? fallback : "bark";
}

class Notifier {
  constructor({
    provider,
    webhook,
    barkServerUrl,
    barkDeviceKey,
    barkGroup,
    serverChanServerUrl,
    logger
  }) {
    this.provider = String(provider || "bark")
      .trim()
      .toLowerCase();
    this.webhook = String(webhook || "").trim();
    this.barkServerUrl = trimSlash(barkServerUrl || "https://api.day.app");
    this.barkDeviceKey = String(barkDeviceKey || "").trim();
    this.barkGroup = String(barkGroup || "DayFlow").trim();
    this.serverChanServerUrl = normalizeServerChanForwardUrl(
      trimSlash(serverChanServerUrl || SERVERCHAN_FORWARD_URL),
      "SERVERCHAN_SERVER_URL"
    );
    this.logger = logger;
  }

  buildBarkTarget(user, channel) {
    const channelObj = channel && typeof channel === "object" ? channel : null;
    if (channelObj && String(channelObj.provider || "bark").toLowerCase() === "bark") {
      const channelKey = String(
        channelObj.barkDeviceKey || channelObj.bark_device_key || ""
      ).trim();
      if (channelKey) {
        return {
          serverUrl: trimSlash(
            channelObj.barkServerUrl || channelObj.bark_server_url || this.barkServerUrl
          ),
          deviceKey: channelKey
        };
      }
    }
    const userChannel = String(user && user.notifier_channel ? user.notifier_channel : "").trim();
    if (!userChannel) {
      return {
        serverUrl: this.barkServerUrl,
        deviceKey: this.barkDeviceKey
      };
    }
    if (/^bark:/i.test(userChannel)) {
      const deviceKey = userChannel.replace(/^bark:/i, "").trim();
      return {
        serverUrl: this.barkServerUrl,
        deviceKey
      };
    }
    if (/^https?:\/\//i.test(userChannel)) {
      const parsed = userChannel.replace(/\/+$/, "");
      const idx = parsed.lastIndexOf("/");
      if (idx > "https://".length) {
        return {
          serverUrl: parsed.slice(0, idx),
          deviceKey: parsed.slice(idx + 1)
        };
      }
      return {
        serverUrl: this.barkServerUrl,
        deviceKey: parsed
      };
    }
    return {
      serverUrl: this.barkServerUrl,
      deviceKey: userChannel
    };
  }

  async sendViaWebhook(payload) {
    if (!this.webhook) {
      return false;
    }
    const response = await fetch(this.webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`webhook status: ${response.status}`);
    }
    return true;
  }

  async sendViaBark(user, title, message, options = {}) {
    const target = this.buildBarkTarget(user, options.channel);
    if (!target.deviceKey) {
      return false;
    }
    const requestBody = {
      device_key: target.deviceKey,
      title: truncateText(title, 120),
      body: truncateText(message, 1800),
      group: this.barkGroup,
      level: options.level || "active",
      isArchive: Number(options.isArchive === false ? 0 : 1)
    };
    if (options.url) {
      requestBody.url = String(options.url);
    }
    const response = await fetch(`${trimSlash(target.serverUrl)}/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      throw new Error(`bark status: ${response.status}`);
    }
    return true;
  }

  buildServerChanTarget(user, channel) {
    const channelObj = channel && typeof channel === "object" ? channel : null;
    if (
      channelObj &&
      String(channelObj.provider || "bark")
        .trim()
        .toLowerCase() === "serverchan"
    ) {
      const sendKey = String(
        channelObj.serverChanSendKey ||
          channelObj.server_chan_send_key ||
          channelObj.barkDeviceKey ||
          channelObj.bark_device_key ||
          ""
      ).trim();
      const serverUrlRaw = String(
        channelObj.serverChanServerUrl ||
          channelObj.server_chan_server_url ||
          channelObj.barkServerUrl ||
          channelObj.bark_server_url ||
          this.serverChanServerUrl
      ).trim();
      if (sendKey) {
        return {
          serverUrl: normalizeServerChanForwardUrl(
            trimSlash(serverUrlRaw || this.serverChanServerUrl),
            "serverChanServerUrl"
          ),
          sendKey: normalizeServerChanSendKey(sendKey, "serverChanSendKey")
        };
      }
    }
    const userChannel = String(user && user.notifier_channel ? user.notifier_channel : "").trim();
    if (!userChannel) {
      return {
        serverUrl: this.serverChanServerUrl,
        sendKey: ""
      };
    }
    if (/^serverchan:/i.test(userChannel)) {
      return {
        serverUrl: this.serverChanServerUrl,
        sendKey: normalizeServerChanSendKey(
          userChannel.replace(/^serverchan:/i, "").trim(),
          "serverChanSendKey"
        )
      };
    }
    const parsed = parseServerChanInput(userChannel);
    return {
      serverUrl: normalizeServerChanForwardUrl(
        trimSlash(parsed.serverUrl || this.serverChanServerUrl),
        "serverChanServerUrl"
      ),
      sendKey: String(parsed.sendKey || "").trim()
    };
  }

  async sendViaServerChan(user, title, message, options = {}) {
    const target = this.buildServerChanTarget(user, options.channel);
    if (!target.sendKey) {
      return false;
    }
    const safeTitle = truncateText(title, 120);
    const safeMessage = truncateText(message, 1800);
    normalizeServerChanForwardUrl(
      trimSlash(target.serverUrl || this.serverChanServerUrl),
      "serverChanServerUrl"
    );
    const response = await fetch(
      `${SERVERCHAN_SEND_API_BASE}/${encodeURIComponent(target.sendKey)}.send`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: new URLSearchParams({
          title: safeTitle,
          desp: safeMessage
        }).toString()
      }
    );
    if (!response.ok) {
      throw new Error(`serverchan status: ${response.status}`);
    }
    const text = await response.text();
    if (!text) {
      return true;
    }
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      return true;
    }
    if (
      payload &&
      Object.prototype.hasOwnProperty.call(payload, "code") &&
      Number(payload.code) !== 0
    ) {
      throw new Error(payload.message || payload.info || `serverchan code: ${payload.code}`);
    }
    return true;
  }

  async sendText(user, title, message, options = {}) {
    const safeTitle = truncateText(title, 120);
    const safeMessage = truncateText(message, 1800);
    const provider = inferNotifierProviderByChannel(
      options.channel,
      this.provider || "bark"
    );
    try {
      if (provider === "webhook") {
        const sent = await this.sendViaWebhook({
          type: "text",
          userKey: user && user.user_key ? user.user_key : "",
          title: safeTitle,
          message: safeMessage
        });
        if (!sent) {
          return false;
        }
        return true;
      }
      if (provider === "bark") {
        const sent = await this.sendViaBark(user, safeTitle, safeMessage, options);
        if (!sent) {
          return false;
        }
        return true;
      }
      if (provider === "serverchan") {
        const sent = await this.sendViaServerChan(user, safeTitle, safeMessage, options);
        if (!sent) {
          return false;
        }
        return true;
      }
      this.logger.warn("unsupported notifier provider", { provider });
      return false;
    } catch (error) {
      this.logger.warn("sendText failed", {
        user: user && user.user_key ? user.user_key : "",
        provider,
        error: error.message
      });
      return false;
    }
  }

  async sendQrImage(user, imagePath, options = {}) {
    const exists = fs.existsSync(imagePath);
    const tip = exists
      ? `二维码已生成，请尽快扫码登录。\n文件: ${imagePath}`
      : "二维码推送失败，请在网页端重新发起二维码登录。";
    await this.sendText(user, "需要重新扫码登录", tip, {
      ...options,
      level: "active"
    });
  }
}

module.exports = {
  Notifier
};
