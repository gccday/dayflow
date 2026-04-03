const crypto = require("crypto");
const EventEmitter = require("events");

const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const { isDingLoginPage, ensureRememberLoginChecked } = require("./auth-service");
const { validateCheckinTargetUrl } = require("../utils/target-url");

// 仅用于“截图二维码”场景，必须优先命中真实二维码图层，避免截到标题/说明容器。
const QR_CAPTURE_SELECTORS = [
  ".module-qrcode-code canvas",
  ".module-qrcode-code-template canvas",
  ".module-qrcode-area .module-qrcode-code canvas",
  ".edu-qrCode-code canvas",
  ".edu-qrCode-code-template canvas",
  ".edu-qrCode-area .edu-qrCode-code canvas",
  ".module-qrcode-area canvas",
  ".edu-qrCode-area canvas",
  ".module-qrcode-code img[src*='qrcode']",
  ".edu-qrCode-code img[src*='qrcode']",
  "img[src*='qrcode']",
  "img[alt*=二维码]",
  "canvas[width='180'][height='180']",
  "canvas[width='200'][height='200']",
  "canvas"
];

// 用于“是否处于扫码登录页”判断，允许使用容器选择器。
const QR_LOGIN_STATE_SELECTORS = [
  ".module-qrcode",
  ".app-qr-login-page",
  ".edu-qrCode-area",
  ".module-qrscan",
  ".qrcode",
  "#qrcode",
  "canvas",
  "img[alt*=二维码]"
];

const QR_DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DEFAULT_BROWSER_IDLE_CLOSE_MS = 45 * 1000;
const MIN_QR_DATA_URL_LENGTH = 1400;

let stealthReady = false;
function ensureStealth() {
  if (stealthReady) {
    return;
  }
  chromium.use(StealthPlugin());
  stealthReady = true;
}

function truncate(text, max = 300) {
  if (text === null || text === undefined) {
    return "";
  }
  const raw = String(text);
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function isSelectorQrSpecific(selector) {
  const text = String(selector || "").toLowerCase();
  return text.includes("qrcode") || text.includes("qr-code") || text.includes("qrcode-");
}

function computeNodeScore({ selector, rect, viewport }) {
  const width = Number(rect && rect.width);
  const height = Number(rect && rect.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return -1;
  }
  if (width < 110 || height < 110) {
    return -1;
  }
  const ratio = width / height;
  if (ratio < 0.72 || ratio > 1.4) {
    return -1;
  }
  const center = (width + height) / 2;
  const area = width * height;
  let score = 0;
  if (isSelectorQrSpecific(selector)) {
    score += 220;
  }
  score += Math.max(0, 240 - Math.abs(center - 190));
  score += Math.max(0, 78000 - Math.abs(area - 36000)) / 500;
  if (viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)) {
    const x = Number(rect.x || 0);
    const y = Number(rect.y || 0);
    const inside =
      x >= -2 &&
      y >= -2 &&
      x + width <= viewport.width + 2 &&
      y + height <= viewport.height + 2;
    score += inside ? 140 : -80;
  }
  return score;
}

async function resolveQrLocator(page) {
  const viewport = page.viewportSize() || null;
  let best = null;
  for (const selector of QR_CAPTURE_SELECTORS) {
    const group = page.locator(selector);
    const count = await group.count();
    const max = Math.min(count, 8);
    for (let i = 0; i < max; i += 1) {
      const item = group.nth(i);
      let visible = false;
      try {
        visible = await item.isVisible();
      } catch (_error) {
        visible = false;
      }
      if (!visible) {
        continue;
      }
      let box = null;
      try {
        box = await item.boundingBox();
      } catch (_error) {
        box = null;
      }
      if (!box) {
        continue;
      }
      const score = computeNodeScore({ selector, rect: box, viewport });
      if (score < 0) {
        continue;
      }
      if (!best || score > best.score) {
        best = { item, score };
      }
    }
  }
  if (!best) {
    return null;
  }
  try {
    await best.item.scrollIntoViewIfNeeded();
    await page.waitForTimeout(60);
  } catch (_error) {
    // ignore
  }
  return best.item;
}

async function hasQrLikeElement(page) {
  for (const selector of QR_LOGIN_STATE_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (!count) {
      continue;
    }
    let visible = false;
    try {
      visible = await locator.isVisible();
    } catch (_error) {
      visible = false;
    }
    if (visible) {
      return true;
    }
  }
  return false;
}

async function captureQrDataUrl(page) {
  try {
    const domDataUrl = await page.evaluate((selectors, minLen) => {
      function hasQrLikeClass(node) {
        let current = node;
        for (let i = 0; i < 5 && current; i += 1) {
          const cls = String(current.className || "");
          if (/qrcode|qrCode|qr-code|edu-qrCode/.test(cls)) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      }

      function isVisible(el) {
        if (!el) {
          return false;
        }
        const style = window.getComputedStyle(el);
        if (!style || style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        if (Number(style.opacity || "1") === 0) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width >= 80 && rect.height >= 80;
      }

      function computeScore(node, selector) {
        const rect = node.getBoundingClientRect();
        const width = Number(rect.width || 0);
        const height = Number(rect.height || 0);
        if (width < 110 || height < 110) {
          return -1;
        }
        const ratio = width / height;
        if (ratio < 0.72 || ratio > 1.4) {
          return -1;
        }
        let score = 0;
        if (/qrcode|qrCode|qr-code|edu-qrCode/.test(selector)) {
          score += 220;
        }
        if (hasQrLikeClass(node)) {
          score += 220;
        }
        score += Math.max(0, 240 - Math.abs((width + height) / 2 - 190));
        const inViewport =
          rect.left >= -2 &&
          rect.top >= -2 &&
          rect.right <= window.innerWidth + 2 &&
          rect.bottom <= window.innerHeight + 2;
        score += inViewport ? 140 : -80;
        return score;
      }

      let bestDataUrl = null;
      let bestScore = -1;
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 8);
        for (const node of nodes) {
          if (!isVisible(node)) {
            continue;
          }
          const score = computeScore(node, selector);
          if (score < 0) {
            continue;
          }
          const tag = String(node.tagName || "").toUpperCase();
          if (tag === "CANVAS") {
            try {
              const dataUrl = node.toDataURL("image/png");
              if (dataUrl && dataUrl.length >= minLen) {
                if (score > bestScore) {
                  bestDataUrl = dataUrl;
                  bestScore = score;
                }
              }
            } catch (_error) {
              // ignore tainted canvas
            }
          }
          if (tag === "IMG") {
            const src = node.currentSrc || node.src || "";
            if (
              src.startsWith("data:image") &&
              src.length >= minLen &&
              (hasQrLikeClass(node) || /qrcode/i.test(src))
            ) {
              if (score > bestScore) {
                bestDataUrl = src;
                bestScore = score;
              }
            }
          }
        }
      }
      return bestDataUrl;
    }, QR_CAPTURE_SELECTORS, MIN_QR_DATA_URL_LENGTH);
    if (domDataUrl) {
      return domDataUrl;
    }
  } catch (_error) {
    // fallback to locator screenshot
  }

  const locator = await resolveQrLocator(page);
  if (!locator) {
    return null;
  }
  try {
    const buffer = await locator.screenshot();
    // 空白 canvas（尚未渲染二维码）通常体积极小，直接忽略，等待下一轮刷新。
    if (!buffer || buffer.length < 1200) {
      return null;
    }
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (_error) {
    return null;
  }
}

async function captureBestQrDataUrl(page) {
  const qrDataUrl = await captureQrDataUrl(page);
  if (qrDataUrl) {
    return {
      dataUrl: qrDataUrl,
      hasRealQr: true
    };
  }
  return {
    dataUrl: null,
    hasRealQr: false
  };
}

async function captureBestQrDataUrlWithRetry(page, waitMs = 8000) {
  const begin = Date.now();
  let last = null;
  while (Date.now() - begin < waitMs) {
    const current = await captureBestQrDataUrl(page);
    last = current;
    if (current && current.hasRealQr && current.dataUrl) {
      return current;
    }
    await page.waitForTimeout(800);
  }
  return (
    last || {
      dataUrl: null,
      hasRealQr: false
    }
  );
}

async function hasQrElement(page) {
  return hasQrLikeElement(page);
}

async function isInLoginState(page) {
  if (isDingLoginPage(page.url())) {
    return true;
  }
  if (await hasQrElement(page)) {
    return true;
  }
  return false;
}

async function waitForLoginState(page, timeoutMs = 15000) {
  try {
    await Promise.any([
      page.waitForURL(/login\.dingtalk\.com/i, { timeout: timeoutMs }).then(() => true),
      ...QR_LOGIN_STATE_SELECTORS.map((selector) =>
        page
          .locator(selector)
          .first()
          .waitFor({ state: "visible", timeout: timeoutMs })
          .then(() => true)
      )
    ]);
    return true;
  } catch (_error) {
    // fallback to lightweight polling below
  }

  const begin = Date.now();
  while (Date.now() - begin < timeoutMs) {
    if (await isInLoginState(page)) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function collectPageHint(page) {
  let url = "";
  let title = "";
  let bodyPreview = "";
  try {
    url = page.url() || "";
  } catch (_error) {
    // ignore
  }
  try {
    title = await page.title();
  } catch (_error) {
    // ignore
  }
  try {
    bodyPreview = truncate(await page.locator("body").innerText(), 120);
  } catch (_error) {
    // ignore
  }
  return {
    url: truncate(url, 160),
    title: truncate(title, 80),
    bodyPreview
  };
}

async function getBodyTextPreview(page) {
  try {
    return await page.locator("body").innerText();
  } catch (_error) {
    return "";
  }
}

function isChineseLoginText(text) {
  const raw = String(text || "");
  return /扫码|简体中文|继续使用宜搭|登录钉钉/.test(raw);
}

async function switchLoginLanguageToChinese(page) {
  const currentText = await getBodyTextPreview(page);
  if (isChineseLoginText(currentText)) {
    return true;
  }

  const triggerSelectors = [
    ".module-comm-lang-select-current-container",
    ".dt_login_flex_setting .module-comm-lang-select-current-container",
    ".module-comm-lang-select-current",
    "[class*=lang-select][class*=current]"
  ];

  let clickedTrigger = false;
  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    const count = await trigger.count();
    if (!count) {
      continue;
    }
    try {
      if (await trigger.isVisible()) {
        await trigger.click({ timeout: 1000 });
        clickedTrigger = true;
        break;
      }
    } catch (_error) {
      // try next selector
    }
  }

  if (!clickedTrigger) {
    return false;
  }

  const optionSelectors = [
    "text=简体中文",
    ".module-comm-lang-select-pop-list-item:has-text('简体中文')",
    "li:has-text('简体中文')",
    "div:has-text('简体中文')"
  ];

  for (const selector of optionSelectors) {
    const option = page.locator(selector).first();
    const count = await option.count();
    if (!count) {
      continue;
    }
    try {
      if (await option.isVisible()) {
        await option.click({ timeout: 1000 });
        await page.waitForTimeout(800);
        const after = await getBodyTextPreview(page);
        return isChineseLoginText(after);
      }
    } catch (_error) {
      // try next selector
    }
  }

  return false;
}

function buildSessionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function isSessionDone(status) {
  return status === "success" || status === "failed" || status === "timeout";
}

class WebQrSessionManager {
  constructor({ repo, config, logger }) {
    this.repo = repo;
    this.config = config;
    this.logger = logger;
    this.sessions = new Map();
    this.events = new EventEmitter();
    this.browser = null;
    this.browserLaunchPromise = null;
    this.browserRefCount = 0;
    this.browserIdleCloseTimer = null;
    this.browserIdleCloseMs = Number(config.qrBrowserIdleCloseMs || DEFAULT_BROWSER_IDLE_CLOSE_MS);
  }

  async acquireBrowser() {
    if (this.browserIdleCloseTimer) {
      clearTimeout(this.browserIdleCloseTimer);
      this.browserIdleCloseTimer = null;
    }
    if (this.browser && this.browser.isConnected()) {
      this.browserRefCount += 1;
      return this.browser;
    }
    if (this.browserLaunchPromise) {
      const launching = await this.browserLaunchPromise;
      this.browserRefCount += 1;
      return launching;
    }

    this.browserLaunchPromise = chromium
      .launch({
        headless: this.config.headless
      })
      .then((browser) => {
        browser.on("disconnected", () => {
          this.browser = null;
          this.browserLaunchPromise = null;
          this.browserRefCount = 0;
          if (this.browserIdleCloseTimer) {
            clearTimeout(this.browserIdleCloseTimer);
            this.browserIdleCloseTimer = null;
          }
        });
        this.browser = browser;
        this.browserLaunchPromise = null;
        return browser;
      })
      .catch((error) => {
        this.browserLaunchPromise = null;
        throw error;
      });

    const browser = await this.browserLaunchPromise;
    this.browserRefCount += 1;
    return browser;
  }

  scheduleBrowserIdleClose() {
    if (this.browserIdleCloseTimer) {
      clearTimeout(this.browserIdleCloseTimer);
      this.browserIdleCloseTimer = null;
    }
    if (!this.browser || !this.browser.isConnected()) {
      return;
    }
    this.browserIdleCloseTimer = setTimeout(async () => {
      this.browserIdleCloseTimer = null;
      if (!this.browser || !this.browser.isConnected() || this.browserRefCount > 0) {
        return;
      }
      try {
        await this.browser.close();
      } catch (_error) {
        // ignore browser close race
      } finally {
        this.browser = null;
      }
    }, this.browserIdleCloseMs);
  }

  releaseBrowser() {
    if (this.browserRefCount > 0) {
      this.browserRefCount -= 1;
    }
    if (this.browserRefCount === 0) {
      this.scheduleBrowserIdleClose();
    }
  }

  toResponse(session, options = {}) {
    const sessionQrImageVersion = Number(session.qrImageVersion || 0);
    const knownQrImageVersion = Number(options.qrImageVersion);
    const includeQrImage =
      !Number.isFinite(knownQrImageVersion) ||
      knownQrImageVersion < 0 ||
      knownQrImageVersion !== sessionQrImageVersion;
    return {
      id: session.id,
      userId: session.userId,
      userKey: session.userKey,
      status: session.status,
      message: session.message,
      qrImageDataUrl: includeQrImage ? session.qrImageDataUrl || null : null,
      qrImageVersion: sessionQrImageVersion,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      finishedAt: session.finishedAt,
      done: isSessionDone(session.status)
    };
  }

  setSession(session, patch) {
    const oldQrImageVersion = Number(session.qrImageVersion || 0);
    let nextQrImageVersion = oldQrImageVersion;
    if (
      Object.prototype.hasOwnProperty.call(patch, "qrImageDataUrl") &&
      patch.qrImageDataUrl !== session.qrImageDataUrl
    ) {
      nextQrImageVersion += 1;
    }
    const next = {
      ...session,
      ...patch,
      qrImageVersion: nextQrImageVersion,
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(next.id, next);
    this.events.emit("session-update", { sessionId: next.id });
    return next;
  }

  onSessionUpdate(listener) {
    this.events.on("session-update", listener);
    return () => {
      this.events.off("session-update", listener);
    };
  }

  pruneOldSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      const ref = session.finishedAt || session.updatedAt || session.createdAt;
      if (!ref) {
        continue;
      }
      const ageMs = now - new Date(ref).getTime();
      if (ageMs > 30 * 60 * 1000) {
        this.sessions.delete(id);
      }
    }
  }

  findActiveSessionByUserId(userId) {
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) {
        continue;
      }
      if (session.status === "starting" || session.status === "waiting_scan") {
        return session;
      }
    }
    return null;
  }

  getSession(sessionId, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return this.toResponse(session, options);
  }

  async startSession(user, options = {}) {
    const forceRestart = Boolean(options.forceRestart);
    this.pruneOldSessions();
    const active = this.findActiveSessionByUserId(user.id);
    if (active && !forceRestart) {
      return this.toResponse(active);
    }
    if (active && forceRestart) {
      this.setSession(active, {
        status: "failed",
        message: "二维码会话已重新生成，请使用最新会话扫码",
        finishedAt: new Date().toISOString()
      });
    }

    const now = new Date().toISOString();
    const session = {
      id: buildSessionId(),
      userId: user.id,
      userKey: user.user_key,
      status: "starting",
      message: "正在初始化浏览器并打开登录页",
      qrImageDataUrl: null,
      qrImageVersion: 0,
      createdAt: now,
      updatedAt: now,
      finishedAt: null
    };
    this.sessions.set(session.id, session);

    this.runSession(session.id).catch((error) => {
      const current = this.sessions.get(session.id);
      if (!current) {
        return;
      }
      this.setSession(current, {
        status: "failed",
        message: `二维码会话异常: ${truncate(error.message || "unknown error")}`,
        finishedAt: new Date().toISOString()
      });
    });

    return this.toResponse(session);
  }

  async runSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    ensureStealth();
    const user = this.repo.getUserById(session.userId);
    if (!user) {
      this.setSession(session, {
        status: "failed",
        message: "签到用户不存在",
        finishedAt: new Date().toISOString()
      });
      return;
    }

    const authState = this.repo.getAuthStateByUserId(user.id);
    const targetUrlValidation = validateCheckinTargetUrl(
      this.config.defaultTargetUrl || user.target_url,
      {
        allowEmpty: false
      }
    );
    if (!targetUrlValidation.ok) {
      this.setSession(session, {
        status: "failed",
        message: `${targetUrlValidation.message}；请检查系统默认签到链接配置后重试`,
        finishedAt: new Date().toISOString()
      });
      return;
    }
    let browser = null;
    let context = null;
    try {
      browser = await this.acquireBrowser();

      const contextOptions = {
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
        serviceWorkers: "block",
        extraHTTPHeaders: {
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        },
        // 二维码登录页需要桌面浏览器形态，避免 iOS UA 被站点拦截导致拿不到二维码。
        userAgent: QR_DESKTOP_USER_AGENT
      };
      context = await browser.newContext(contextOptions);
      await context.addInitScript(() => {
        try {
          Object.defineProperty(navigator, "language", {
            configurable: true,
            get: () => "zh-CN"
          });
          Object.defineProperty(navigator, "languages", {
            configurable: true,
            get: () => ["zh-CN", "zh", "en-US", "en"]
          });
        } catch (_error) {
          // ignore
        }
      });
      const page = await context.newPage();
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (type === "font" || type === "media") {
          route.abort().catch(() => {});
          return;
        }
        route.continue().catch(() => {});
      });
      await page.goto(targetUrlValidation.normalizedUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeoutMs
      });

      await switchLoginLanguageToChinese(page).catch(() => false);
      await ensureRememberLoginChecked(page).catch(() => ({
        found: false,
        checked: false,
        clicked: false
      }));

      const enteredLoginState = await waitForLoginState(page, 15000);
      if (!enteredLoginState) {
        const hint = await collectPageHint(page);
        const hintText = [hint.url, hint.title, hint.bodyPreview]
          .filter(Boolean)
          .join(" | ");
        this.setSession(session, {
          status: "failed",
          message: `未进入二维码登录页，已取消本次扫码会话（避免误判已登录）${
            hintText ? `；页面信息：${hintText}` : ""
          }`,
          finishedAt: new Date().toISOString()
        });
        return;
      }

      await ensureRememberLoginChecked(page).catch(() => ({
        found: false,
        checked: false,
        clicked: false
      }));
      const initialCapture = await captureBestQrDataUrlWithRetry(page, 5000);
      let qrImageDataUrl = initialCapture.dataUrl;
      let hasRealQr = initialCapture.hasRealQr;
      if (hasRealQr && qrImageDataUrl) {
        this.setSession(session, {
          status: "waiting_scan",
          message: `请在 ${Math.floor(this.config.loginWaitTimeoutMs / 1000)} 秒内扫码`,
          qrImageDataUrl
        });
      } else {
        this.setSession(session, {
          status: "starting",
          message: "正在加载二维码组件，请稍候…",
          qrImageDataUrl: null
        });
      }

      const startAt = Date.now();
      let lastQrRefreshAt = Date.now();
      while (Date.now() - startAt < this.config.loginWaitTimeoutMs) {
        const inLoginState = await isInLoginState(page);
        if (!inLoginState) {
          const latestStorage = await context.storageState();
          this.repo.upsertAuthState({
            user_id: user.id,
            storage_state_json: JSON.stringify(latestStorage),
            passkey_credential_json: authState ? authState.passkey_credential_json : null
          });
          this.setSession(session, {
            status: "success",
            message: "扫码成功，登录凭证已保存",
            finishedAt: new Date().toISOString()
          });
          return;
        }

        if (Date.now() - lastQrRefreshAt >= 900) {
          const latestQr = await captureQrDataUrl(page);
          if (latestQr) {
            qrImageDataUrl = latestQr;
            hasRealQr = true;
            this.setSession(session, {
              status: "waiting_scan",
              message: `请在 ${Math.floor(this.config.loginWaitTimeoutMs / 1000)} 秒内扫码`,
              qrImageDataUrl
            });
          } else if (!hasRealQr) {
            const remainedSeconds = Math.max(
              1,
              Math.floor(
                (this.config.loginWaitTimeoutMs - (Date.now() - startAt)) / 1000
              )
            );
            this.setSession(session, {
              status: "starting",
              message: `正在加载二维码组件，请稍候（剩余 ${remainedSeconds} 秒）`,
              qrImageDataUrl: null
            });
          }
          lastQrRefreshAt = Date.now();
        }
        await page.waitForTimeout(500);
      }

      const timeoutHint = await collectPageHint(page);
      this.setSession(session, {
        status: "timeout",
        message: `扫码超时，请重新生成二维码${
          timeoutHint.url ? `；当前页面：${timeoutHint.url}` : ""
        }${!hasRealQr ? "；期间未检测到二维码组件" : ""}`,
        finishedAt: new Date().toISOString()
      });
    } catch (error) {
      this.logger.warn("qr session failed", {
        user: user.user_key,
        error: truncate(error.message || "unknown")
      });
      this.setSession(session, {
        status: "failed",
        message: `扫码流程失败: ${truncate(error.message || "unknown error")}`,
        finishedAt: new Date().toISOString()
      });
    } finally {
      if (context) {
        await context.close();
      }
      if (browser) {
        this.releaseBrowser();
      }
    }
  }
}

module.exports = {
  WebQrSessionManager
};
