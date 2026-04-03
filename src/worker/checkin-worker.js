const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const { ensureAuthenticated, isDingLoginPage } = require("../services/auth-service");
const { simulateLocation } = require("../services/location-simulator");
const { getDateInTz, getTimeInTz } = require("../utils/time");

chromium.use(StealthPlugin());

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function truncateText(text, max = 1200) {
  if (text === null || text === undefined) {
    return "";
  }
  const raw = String(text);
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

const DEFAULT_ROLLCALL_PROFILE = Object.freeze({
  appType: "APP_YXKZIQYX3PVLJZ433S6X",
  pageFormUuid: "FORM-6FAF80BA9D1D445985205759413003AC4XU3",
  studentFormUuid: "FORM-40359309716B49D98CF9BE76859E6F2110GW",
  searchEndpoint: "/dingtalk/web/APP_YXKZIQYX3PVLJZ433S6X/v1/form/searchFormDatas.json",
  updateEndpoint: "/dingtalk/web/APP_YXKZIQYX3PVLJZ433S6X/v1/form/updateFormData.json",
  searchStudentNoField: "textField_mkp4o98n",
  searchStudentNameField: "textField_mkp4o98m",
  instructorNoField: "textField_mkp4o98r",
  updateStudentEmployeeField: "employeeField_mkxdw5b3",
  updateTimestampField: "dateField_mkuiuczp",
  updateAddressField: "textField_mkuiuczq",
  updateTypeField: "textField_mkuiuczr",
  updateInstructorEmployeeField: "employeeField_mkxdw5b4",
  checkStartHHmm: "21:00",
  checkEndHHmm: "23:00"
});

const EXECUTION_STATUS_KEY_PREFIX = "checkin_status_snapshot:execution:";

function getExecutionStatusKey(userId) {
  return `${EXECUTION_STATUS_KEY_PREFIX}${Number(userId)}`;
}

function toObject(value) {
  return value && typeof value === "object" ? value : {};
}

function parseHHmmToMinutes(value) {
  const text = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) {
    return null;
  }
  const [h, m] = text.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

function formatDateTimeInTz(value, tz) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  const date = new Date(n);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: tz || "Asia/Shanghai",
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
    if (
      !mapped.year ||
      !mapped.month ||
      !mapped.day ||
      !mapped.hour ||
      !mapped.minute ||
      !mapped.second
    ) {
      return date.toISOString();
    }
    return `${mapped.year}-${mapped.month}-${mapped.day} ${mapped.hour}:${mapped.minute}:${mapped.second}`;
  } catch (_error) {
    return date.toISOString();
  }
}

async function installRichGeolocation(context, geo) {
  await context.addInitScript((payload) => {
    const buildPosition = () => ({
      coords: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
        altitude: payload.altitude,
        altitudeAccuracy: payload.altitudeAccuracy,
        heading: payload.heading,
        speed: payload.speed
      },
      timestamp: Date.now()
    });

    let watchSeq = 1;
    const watchTimers = new Map();

    const geolocationShim = {
      getCurrentPosition(success, _error, _options) {
        if (typeof success === "function") {
          success(buildPosition());
        }
      },
      watchPosition(success, _error, _options) {
        const watchId = watchSeq++;
        if (typeof success === "function") {
          success(buildPosition());
        }
        const timer = setInterval(() => {
          if (typeof success === "function") {
            success(buildPosition());
          }
        }, 3000);
        watchTimers.set(watchId, timer);
        return watchId;
      },
      clearWatch(watchId) {
        const timer = watchTimers.get(watchId);
        if (timer) {
          clearInterval(timer);
          watchTimers.delete(watchId);
        }
      }
    };

    try {
      Object.defineProperty(window.navigator, "geolocation", {
        configurable: true,
        value: geolocationShim
      });
    } catch (_error) {
      // 某些页面会锁 geolocation 属性，失败时依旧使用 context geolocation。
    }

    window.__SIMULATED_GEO__ = payload;
  }, geo);
}

class CheckinWorker {
  constructor({ config, repo, notifier, logger }) {
    this.config = config;
    this.repo = repo;
    this.notifier = notifier;
    this.logger = logger;
    this.runningUsers = new Set();
  }

  updateExecutionStatus(user, payload = {}) {
    if (!user || !user.id) {
      return;
    }
    const data = {
      status: String(payload.status || "unknown"),
      message: truncateText(String(payload.message || ""), 320),
      trigger: String(payload.trigger || "unknown"),
      startedAt: payload.startedAt ? String(payload.startedAt) : null,
      finishedAt: payload.finishedAt ? String(payload.finishedAt) : null,
      durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null,
      runDate: payload.runDate ? String(payload.runDate) : null
    };
    this.repo.upsertAppSetting(getExecutionStatusKey(user.id), JSON.stringify(data));
  }

  needsReauth(message) {
    const text = String(message || "").toLowerCase();
    if (!text) {
      return false;
    }
    return (
      text.includes("cookie") ||
      text.includes("csrf") ||
      text.includes("重新扫码") ||
      text.includes("扫码登录") ||
      text.includes("登录态") ||
      text.includes("未进入签到页") ||
      text.includes("auth_") ||
      text.includes("需要重新认证")
    );
  }

  getNotifyOptionsForUser(user, options = {}) {
    const opts = options && typeof options === "object" ? options : {};
    const checkinUserId = Number(opts.checkinUserId || (user && user.id ? user.id : 0));
    const channel = Number.isFinite(checkinUserId) && checkinUserId > 0
      ? this.repo.getEffectiveNotificationChannelByCheckinUserId(checkinUserId)
      : null;
    return channel ? { channel } : {};
  }

  async notifyUserText(user, title, message, options = {}) {
    const notifyOptions = this.getNotifyOptionsForUser(user, options);
    return this.notifier.sendText(user, title, message, notifyOptions);
  }

  async runUserCheckin(user, options = {}) {
    const {
      force = false,
      ignoreCheckWindow = false,
      ignoreAlreadySignedToday = false,
      trigger = "scheduler"
    } = options;
    if (!user || !user.id) {
      throw new Error("invalid user");
    }

    if (this.runningUsers.has(user.id)) {
      this.logger.warn("user already running, skip", { user: user.user_key });
      return;
    }

    this.runningUsers.add(user.id);
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const tz = user.timezone || this.config.defaultTimezone;
    const runDate = getDateInTz(new Date(), tz);
    this.updateExecutionStatus(user, {
      status: "running",
      message: "执行中",
      trigger,
      startedAt: startedAtIso,
      runDate
    });
    const setting = this.repo.getAppSettingByKey("checkin_debug_mode");
    const debugModeFromSetting = setting && String(setting.value || "") === "1";
    const debugModeFromUser = Number(user.debug_mode) === 1;
    const effectiveDebugMode =
      typeof options.debugMode === "boolean"
        ? options.debugMode
        : (debugModeFromUser || debugModeFromSetting);
    const effectiveDebugTrace =
      typeof options.captureDebugTrace === "boolean"
        ? options.captureDebugTrace
        : (effectiveDebugMode || debugModeFromUser || debugModeFromSetting);
    let simulated = null;

    try {
      if (!force && this.repo.hasSuccessLogForDate(user.id, runDate)) {
        const statusCheckBeforeSkip = await this.checkCheckinStatus(user);
        if (String(statusCheckBeforeSkip.status || "") === "signed_today") {
          this.logger.info("already signed today (verified), skip", {
            user: user.user_key,
            runDate
          });
          const skipMessage = "今日已签到（已实时核验），未执行提交";
          this.repo.insertCheckinLog({
            user_id: user.id,
            run_date: runDate,
            run_at: new Date().toISOString(),
            status: "failed",
            duration_ms: Date.now() - startedAt,
            message: skipMessage,
            simulated_latitude: null,
            simulated_longitude: null,
            simulated_accuracy: null,
            simulated_altitude: null,
            simulated_altitude_accuracy: null,
            simulated_heading: null,
            simulated_speed: null,
            jitter_radius_m: null,
            raw_result_json: null
          });
          this.updateExecutionStatus(user, {
            status: "failed",
            message: skipMessage,
            trigger,
            startedAt: startedAtIso,
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            runDate
          });
          return {
            status: "failed",
            message: skipMessage,
            debugMode: effectiveDebugMode
          };
        }
        this.logger.warn("success log exists but realtime check not signed, continue execute", {
          user: user.user_key,
          runDate,
          status: statusCheckBeforeSkip.status
        });
      }

      const authState = this.repo.getAuthStateByUserId(user.id);
      const locationProfile = this.repo.getDefaultLocationProfile(user.id);
      if (!locationProfile) {
        throw new Error("缺少定位档案，请先写入 location_profiles");
      }

      simulated = simulateLocation(locationProfile);
      const result = await this.runWithBrowser(user, authState, simulated, {
        debugMode: effectiveDebugMode,
        captureDebugTrace: effectiveDebugTrace,
        locationProfile,
        ignoreCheckWindow,
        ignoreAlreadySignedToday
      });
      const statusCheck =
        result &&
        result.submitSummary &&
        result.submitSummary.statusCheck &&
        typeof result.submitSummary.statusCheck === "object"
          ? result.submitSummary.statusCheck
          : null;
      if (statusCheck) {
        this.repo.upsertAppSetting(
          `checkin_status_snapshot:checkin:${user.id}`,
          JSON.stringify({
            ok: String(statusCheck.status || "") === "signed_today",
            status: String(statusCheck.status || "unknown"),
            message: truncateText(String(statusCheck.message || ""), 320),
            checkedAt: new Date().toISOString(),
            checkWindow: {
              start: "",
              end: "",
              currentHHmm: getTimeInTz(new Date(), tz),
              within: false
            },
            student: {
              formInstId: String(statusCheck.formInstId || ""),
              lastCheckTimestamp:
                Number.isFinite(Number(statusCheck.lastTimestamp)) && Number(statusCheck.lastTimestamp) > 0
                  ? Number(statusCheck.lastTimestamp)
                  : null,
              lastCheckTime:
                Number.isFinite(Number(statusCheck.lastTimestamp)) && Number(statusCheck.lastTimestamp) > 0
                  ? formatDateTimeInTz(Number(statusCheck.lastTimestamp), tz)
                  : "",
              checkType: "",
              addressText: ""
            }
          })
        );
      }
      const finalStatus = result.status === "success" ? "success" : "failed";
      const finalMessage = truncateText(result.message || "");

      this.repo.insertCheckinLog({
        user_id: user.id,
        run_date: runDate,
        run_at: new Date().toISOString(),
        status: finalStatus,
        duration_ms: Date.now() - startedAt,
        message: finalMessage,
        simulated_latitude: simulated.latitude,
        simulated_longitude: simulated.longitude,
        simulated_accuracy: simulated.accuracy,
        simulated_altitude: simulated.altitude,
        simulated_altitude_accuracy: simulated.altitudeAccuracy,
        simulated_heading: simulated.heading,
        simulated_speed: simulated.speed,
        jitter_radius_m: simulated.jitterRadiusM,
        raw_result_json: JSON.stringify({
          result,
          debug: {
            enabled: Boolean(effectiveDebugTrace),
            modeEnabled: Boolean(effectiveDebugMode),
            fromUser: Boolean(debugModeFromUser),
            fromGlobal: Boolean(debugModeFromSetting),
            modeFromOverride: typeof options.debugMode === "boolean",
            traceFromOverride: typeof options.captureDebugTrace === "boolean"
          },
          geo: {
            inputCoordSystem: simulated.inputCoordSystem || "auto",
            appliedCoordSystem: simulated.appliedCoordSystem || "wgs84",
            sourceLatitude: simulated.sourceLatitude,
            sourceLongitude: simulated.sourceLongitude
          }
        })
      });

      if (finalStatus === "success") {
        this.logger.info("checkin success", {
          user: user.user_key,
          runDate,
          jitterRadiusM: simulated.jitterRadiusM,
          coordSystem: simulated.appliedCoordSystem || "wgs84"
        });
      } else {
        this.logger.warn("checkin failed", { user: user.user_key, message: result.message });
        if (!effectiveDebugMode) {
          await this.notifyUserText(
            user,
            "签到失败",
            truncateText(result.message || "未知失败", 400)
          );
          if (this.needsReauth(result.message)) {
            await this.notifyUserText(
              user,
              "请重新扫码登录",
              "检测到登录态异常或失效，请在控制台重新发起二维码登录。"
            );
          }
        }
      }
      this.updateExecutionStatus(user, {
        status: finalStatus,
        message: finalMessage,
        trigger,
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        runDate
      });
      return {
        status: finalStatus,
        message: finalMessage,
        debugMode: effectiveDebugMode
      };
    } catch (error) {
      const baseErrorMessage = truncateText(error.message || "unknown error", 400);
      const finalStatus = "failed";
      const finalMessage = baseErrorMessage;
      this.repo.insertCheckinLog({
        user_id: user.id,
        run_date: runDate,
        run_at: new Date().toISOString(),
        status: finalStatus,
        duration_ms: Date.now() - startedAt,
        message: truncateText(finalMessage),
        simulated_latitude: simulated ? simulated.latitude : null,
        simulated_longitude: simulated ? simulated.longitude : null,
        simulated_accuracy: simulated ? simulated.accuracy : null,
        simulated_altitude: simulated ? simulated.altitude : null,
        simulated_altitude_accuracy: simulated ? simulated.altitudeAccuracy : null,
        simulated_heading: simulated ? simulated.heading : null,
        simulated_speed: simulated ? simulated.speed : null,
        jitter_radius_m: simulated ? simulated.jitterRadiusM : null,
        raw_result_json: simulated
          ? JSON.stringify({
              error: truncateText(error.message),
              debug: {
                enabled: Boolean(effectiveDebugTrace),
                modeEnabled: Boolean(effectiveDebugMode),
                fromUser: Boolean(debugModeFromUser),
                fromGlobal: Boolean(debugModeFromSetting),
                modeFromOverride: typeof options.debugMode === "boolean",
                traceFromOverride: typeof options.captureDebugTrace === "boolean"
              },
              geo: {
                inputCoordSystem: simulated.inputCoordSystem || "auto",
                appliedCoordSystem: simulated.appliedCoordSystem || "wgs84",
                sourceLatitude: simulated.sourceLatitude,
                sourceLongitude: simulated.sourceLongitude
              }
            })
          : null
      });
      this.logger.error("checkin exception", { user: user.user_key, error: baseErrorMessage });
      if (!effectiveDebugMode) {
        await this.notifyUserText(user, "签到异常", baseErrorMessage);
        if (this.needsReauth(baseErrorMessage)) {
          await this.notifyUserText(
            user,
            "请重新扫码登录",
            "检测到登录态异常或失效，请在控制台重新发起二维码登录。"
          );
        }
      }
      this.updateExecutionStatus(user, {
        status: finalStatus,
        message: finalMessage,
        trigger,
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        runDate
      });
      return {
        status: finalStatus,
        message: truncateText(finalMessage),
        debugMode: effectiveDebugMode
      };
    } finally {
      this.runningUsers.delete(user.id);
    }
  }

  async runWithBrowser(user, authState, simulated, options = {}) {
    let browser = null;
    let context = null;
    try {
      browser = await chromium.launch({
        headless: this.config.headless
      });

      const contextOptions = {
        locale: "zh-CN",
        geolocation: {
          latitude: simulated.latitude,
          longitude: simulated.longitude,
          accuracy: simulated.accuracy
        },
        permissions: ["geolocation"]
      };

      const userAgent = user.user_agent || this.config.defaultUserAgent;
      if (userAgent) {
        contextOptions.userAgent = userAgent;
      }

      if (authState && authState.storage_state_json) {
        try {
          contextOptions.storageState = JSON.parse(authState.storage_state_json);
        } catch (_error) {
          this.logger.warn("invalid storage state, ignore", { user: user.user_key });
        }
      }

      context = await browser.newContext(contextOptions);
      await installRichGeolocation(context, simulated);

      const page = await context.newPage();
      const schemaCapture = this.createSchemaCapture(page);
      let result = null;
      try {
        await page.goto(user.target_url, {
          waitUntil: "domcontentloaded",
          timeout: this.config.navigationTimeoutMs
        });

        await ensureAuthenticated({
          page,
          user,
          repo: this.repo,
          notifier: this.notifier,
          notifyOptions: this.getNotifyOptionsForUser(user),
          artifactsDir: this.config.artifactsDir,
          loginWaitTimeoutMs: this.config.loginWaitTimeoutMs,
          logger: this.logger
        });

        await page.goto(user.target_url, {
          waitUntil: "domcontentloaded",
          timeout: this.config.navigationTimeoutMs
        });

        await page.waitForTimeout(randomBetween(350, 900));
        result = await this.performCheckinByApi({
          context,
          page,
          user,
          simulated,
          options,
          schemaCapture
        });
      } finally {
        if (schemaCapture && typeof schemaCapture.dispose === "function") {
          schemaCapture.dispose();
        }
      }

      const latestStorage = await context.storageState();
      this.repo.upsertAuthState({
        user_id: user.id,
        storage_state_json: JSON.stringify(latestStorage),
        passkey_credential_json: authState ? authState.passkey_credential_json : null
      });

      return result;
    } finally {
      if (context) {
        await context.close();
      }
      if (browser) {
        await browser.close();
      }
    }
  }

  async checkCookieStatus(user, options = {}) {
    if (!user || !user.id) {
      throw new Error("invalid user");
    }
    const notifyOnInvalid = Boolean(options.notifyOnInvalid);
    const notifyTitle = String(options.notifyTitle || "请重新扫码登录");
    let result = null;
    const authState = this.repo.getAuthStateByUserId(user.id);
    if (!authState || !authState.storage_state_json) {
      result = {
        ok: false,
        status: "missing",
        message: "未发现登录态 Cookie，请先扫码登录",
        finalUrl: "",
        pageTitle: "",
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        hasCorpUserCookie: false
      };
      if (notifyOnInvalid) {
        await this.notifyUserText(user, notifyTitle, "未发现可用 Cookie，请重新扫码登录。");
      }
      return result;
    }

    let parsedStorageState = null;
    try {
      parsedStorageState = JSON.parse(authState.storage_state_json);
    } catch (_error) {
      result = {
        ok: false,
        status: "invalid_state",
        message: "存储的登录态格式异常，请重新扫码登录",
        finalUrl: "",
        pageTitle: "",
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        hasCorpUserCookie: false
      };
      if (notifyOnInvalid) {
        await this.notifyUserText(
          user,
          notifyTitle,
          "登录态存储异常，建议重新扫码登录以刷新 Cookie。"
        );
      }
      return result;
    }

    let browser = null;
    let context = null;
    try {
      browser = await chromium.launch({
        headless: this.config.headless
      });
      const contextOptions = {
        locale: "zh-CN",
        storageState: parsedStorageState
      };
      const userAgent = user.user_agent || this.config.defaultUserAgent;
      if (userAgent) {
        contextOptions.userAgent = userAgent;
      }
      context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      const response = await page.goto(user.target_url, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeoutMs
      });
      await page.waitForTimeout(380);

      const finalUrl = String(page.url() || "");
      const pageTitle = truncateText(await page.title().catch(() => ""), 120);
      let loginUiDetected = false;
      try {
        const loginUiCount = await page.locator(".module-qrscan, .module-qrcode, iframe[src*='login.dingtalk.com']").count();
        loginUiDetected = loginUiCount > 0;
      } catch (_error) {
        loginUiDetected = false;
      }
      const loginPage = isDingLoginPage(finalUrl) || loginUiDetected;

      const cookies = await context.cookies().catch(() => []);
      const hasCorpUserCookie = Array.isArray(cookies)
        ? cookies.some((cookie) => cookie && cookie.name === "tianshu_corp_user" && cookie.value)
        : false;

      const httpStatus = response ? Number(response.status()) : null;
      if (loginPage) {
        result = {
          ok: false,
          status: "expired",
          message: "Cookie 已失效或需要重新认证，未进入签到页",
          finalUrl,
          pageTitle,
          httpStatus,
          checkedAt: new Date().toISOString(),
          hasCorpUserCookie
        };
      } else {
        result = {
          ok: true,
          status: "valid",
          message: "Cookie 有效，可进入签到页",
          finalUrl,
          pageTitle,
          httpStatus,
          checkedAt: new Date().toISOString(),
          hasCorpUserCookie
        };
      }
      if (
        notifyOnInvalid &&
        (!result.ok || ["missing", "expired", "invalid_state"].includes(String(result.status)))
      ) {
        await this.notifyUserText(
          user,
          notifyTitle,
          `Cookie 状态异常（${result.status}），请重新扫码登录。${result.finalUrl ? `当前页面: ${result.finalUrl}` : ""}`
        );
      }
      return result;
    } catch (error) {
      result = {
        ok: false,
        status: "error",
        message: `检查失败: ${truncateText(error.message || "unknown error", 200)}`,
        finalUrl: "",
        pageTitle: "",
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        hasCorpUserCookie: false
      };
      if (notifyOnInvalid) {
        await this.notifyUserText(
          user,
          notifyTitle,
          `Cookie 检查失败，请重新扫码登录后重试。错误: ${truncateText(error.message || "unknown", 180)}`
        );
      }
      return result;
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  async checkCheckinStatus(user) {
    if (!user || !user.id) {
      throw new Error("invalid user");
    }
    const tz = user.timezone || this.config.defaultTimezone || "Asia/Shanghai";
    const authState = this.repo.getAuthStateByUserId(user.id);
    if (!authState || !authState.storage_state_json) {
      return {
        ok: false,
        status: "auth_missing",
        message: "未发现登录态 Cookie，请先扫码登录",
        checkedAt: new Date().toISOString()
      };
    }

    let parsedStorageState = null;
    try {
      parsedStorageState = JSON.parse(authState.storage_state_json);
    } catch (_error) {
      return {
        ok: false,
        status: "invalid_state",
        message: "存储的登录态格式异常，请重新扫码登录",
        checkedAt: new Date().toISOString()
      };
    }

    let browser = null;
    let context = null;
    let schemaCapture = null;
    try {
      browser = await chromium.launch({
        headless: this.config.headless
      });
      const contextOptions = {
        locale: "zh-CN",
        storageState: parsedStorageState
      };
      const userAgent = user.user_agent || this.config.defaultUserAgent;
      if (userAgent) {
        contextOptions.userAgent = userAgent;
      }
      context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      schemaCapture = this.createSchemaCapture(page);
      const response = await page.goto(user.target_url, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeoutMs
      });
      await page.waitForTimeout(260);

      const finalUrl = String(page.url() || "");
      const pageTitle = truncateText(await page.title().catch(() => ""), 120);
      let loginUiDetected = false;
      try {
        const loginUiCount = await page
          .locator(".module-qrscan, .module-qrcode, iframe[src*='login.dingtalk.com']")
          .count();
        loginUiDetected = loginUiCount > 0;
      } catch (_error) {
        loginUiDetected = false;
      }
      if (isDingLoginPage(finalUrl) || loginUiDetected) {
        return {
          ok: false,
          status: "auth_expired",
          message: "Cookie 已失效或需要重新认证，未进入签到页",
          finalUrl,
          pageTitle,
          httpStatus: response ? Number(response.status()) : null,
          checkedAt: new Date().toISOString()
        };
      }

      const csrfToken = await this.resolveCsrfToken(context, page);
      if (!csrfToken) {
        return {
          ok: false,
          status: "csrf_missing",
          message: "缺少 _csrf_token，请先重新扫码登录更新 Cookie",
          finalUrl,
          pageTitle,
          checkedAt: new Date().toISOString()
        };
      }

      const profile = await this.resolveCheckinApiProfile({
        page,
        context,
        capture: schemaCapture,
        csrfToken
      });
      if (!profile.searchEndpoint || !profile.studentFormUuid || !profile.updateTimestampField) {
        return {
          ok: false,
          status: "profile_invalid",
          message: "未能解析签到页面参数",
          finalUrl,
          pageTitle,
          checkedAt: new Date().toISOString()
        };
      }

      const identity = await this.resolveLoginIdentity(page, user);
      if (!identity.businessWorkNo && !identity.userName) {
        return {
          ok: false,
          status: "identity_missing",
          message: "无法识别当前登录身份（businessWorkNo / userName）",
          finalUrl,
          pageTitle,
          checkedAt: new Date().toISOString()
        };
      }

      const searchResult = await this.searchStudentRows(
        context,
        page,
        profile,
        csrfToken,
        identity,
        null
      );
      const rows = Array.isArray(searchResult && searchResult.rows) ? searchResult.rows : [];
      if (rows.length <= 0) {
        const attempts = Array.isArray(searchResult && searchResult.attempts)
          ? searchResult.attempts.length
          : 0;
        return {
          ok: false,
          status: "not_found",
          message: `查询花名册为空，未匹配到当前登录账号（formUuid=${profile.studentFormUuid}，已尝试${attempts}种查询）`,
          checkedAt: new Date().toISOString(),
          checkWindow: {
            start: profile.checkStartHHmm,
            end: profile.checkEndHHmm,
            currentHHmm: this.isWithinCheckWindow(profile.checkStartHHmm, profile.checkEndHHmm, tz)
              .currentHHmm
          }
        };
      }

      const studentRow = toObject(rows[0]);
      const formData = toObject(studentRow.formData);
      const timestamp = Number(formData[profile.updateTimestampField]);
      const validTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
      const signedToday = this.isAlreadySignedToday(validTimestamp, tz);
      const windowCheck = this.isWithinCheckWindow(profile.checkStartHHmm, profile.checkEndHHmm, tz);

      const checkType = String(formData[profile.updateTypeField] || "").trim();
      const addressText = String(formData[profile.updateAddressField] || "").trim();
      const signedAt = validTimestamp ? formatDateTimeInTz(validTimestamp, tz) : "";

      return {
        ok: true,
        status: signedToday ? "signed_today" : "not_signed_today",
        message: signedToday
          ? `今日已签到${signedAt ? `（最近签到时间 ${signedAt}）` : ""}`
          : `今日未签到（当前 ${windowCheck.currentHHmm}）`,
        checkedAt: new Date().toISOString(),
        checkWindow: {
          start: profile.checkStartHHmm,
          end: profile.checkEndHHmm,
          currentHHmm: windowCheck.currentHHmm,
          within: Boolean(windowCheck.within)
        },
        student: {
          formInstId: String(studentRow.formInstId || "").trim(),
          lastCheckTimestamp: validTimestamp,
          lastCheckTime: signedAt,
          checkType,
          addressText
        },
        profile: {
          studentFormUuid: profile.studentFormUuid,
          updateTimestampField: profile.updateTimestampField
        },
        finalUrl,
        pageTitle
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        message: `检查失败: ${truncateText(error.message || "unknown error", 220)}`,
        checkedAt: new Date().toISOString()
      };
    } finally {
      if (schemaCapture && typeof schemaCapture.dispose === "function") {
        schemaCapture.dispose();
      }
      if (context) {
        await context.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  createSchemaCapture(page) {
    const capture = {
      events: [],
      pendingTasks: [],
      dispose: null
    };
    const handler = (response) => {
      const url = String(response.url() || "");
      if (!url.includes("/query/formdesign/getSchemaWithAllNavs.json")) {
        return;
      }
      const task = this.parseSchemaCaptureResponse(response)
        .then((event) => {
          if (event) {
            capture.events.push(event);
          }
        })
        .catch(() => {
          // ignore parse errors
        });
      capture.pendingTasks.push(task);
    };
    page.on("response", handler);
    capture.dispose = () => {
      page.off("response", handler);
    };
    return capture;
  }

  async parseSchemaCaptureResponse(response) {
    const event = {
      at: Date.now(),
      url: String(response.url() || ""),
      status: Number(response.status() || 0),
      payload: null,
      initMethodsSource: "",
      rawText: ""
    };
    try {
      event.rawText = await response.text();
    } catch (_error) {
      event.rawText = "";
    }
    if (event.rawText) {
      try {
        event.payload = JSON.parse(event.rawText);
      } catch (_error) {
        event.payload = null;
      }
    }
    event.initMethodsSource = this.findInitMethodsSource(event.payload);
    return event;
  }

  async flushSchemaCapture(capture) {
    if (!capture || !Array.isArray(capture.pendingTasks) || capture.pendingTasks.length <= 0) {
      return;
    }
    const tasks = capture.pendingTasks.splice(0, capture.pendingTasks.length);
    await Promise.allSettled(tasks);
  }

  findInitMethodsSource(payload) {
    const content = toObject(toObject(payload).content);
    const pages = Array.isArray(content.pages) ? content.pages : [];
    for (const pageItem of pages) {
      const componentsTree = Array.isArray(toObject(pageItem).componentsTree) ? pageItem.componentsTree : [];
      for (const node of componentsTree) {
        const candidate = toObject(toObject(toObject(node).methods).__initMethods__).value;
        if (candidate && typeof candidate === "string" && candidate.includes("getStudentData.load")) {
          return candidate;
        }
      }
    }
    return "";
  }

  readSchemaDataSourceUrl(payload, name) {
    const content = toObject(toObject(payload).content);
    const pages = Array.isArray(content.pages) ? content.pages : [];
    for (const pageItem of pages) {
      const online = Array.isArray(toObject(toObject(pageItem).dataSource).online)
        ? toObject(toObject(pageItem).dataSource).online
        : [];
      for (const item of online) {
        if (toObject(item).name !== name) {
          continue;
        }
        const url = toObject(toObject(item).options).url;
        if (typeof url === "string" && url.trim()) {
          return url.trim();
        }
      }
    }
    return "";
  }

  pickRegexGroup(text, regex) {
    if (!text || !regex) {
      return "";
    }
    const matched = String(text).match(regex);
    return matched && matched[1] ? String(matched[1]).trim() : "";
  }

  parseRollcallProfileFromSchema(event) {
    const profile = {};
    const payload = event && event.payload ? event.payload : null;
    const initMethodsSource =
      event && event.initMethodsSource ? String(event.initMethodsSource) : this.findInitMethodsSource(payload);
    const rawText = event && event.rawText ? String(event.rawText) : "";
    const eventUrl = event && event.url ? String(event.url) : "";

    const appTypeFromPath = this.pickRegexGroup(eventUrl, /\/(?:alibaba|dingtalk)\/web\/(APP_[A-Z0-9]+)\//i);
    if (appTypeFromPath) {
      profile.appType = appTypeFromPath;
    }

    const pageFormUuidFromUrl = this.pickRegexGroup(eventUrl, /[?&]formUuid=(FORM-[A-Z0-9]+)/i);
    if (pageFormUuidFromUrl) {
      profile.pageFormUuid = pageFormUuidFromUrl;
    }

    if (payload && payload.content && payload.content.appType) {
      profile.appType = String(payload.content.appType || "").trim() || profile.appType;
    }
    if (payload && payload.content && payload.content.formUuid) {
      profile.pageFormUuid = String(payload.content.formUuid || "").trim() || profile.pageFormUuid;
    }

    const searchEndpoint = this.readSchemaDataSourceUrl(payload, "getStudentData");
    if (searchEndpoint) {
      profile.searchEndpoint = searchEndpoint;
    }
    const updateEndpoint = this.readSchemaDataSourceUrl(payload, "updateStudentData");
    if (updateEndpoint) {
      profile.updateEndpoint = updateEndpoint;
    }

    profile.studentFormUuid = this.pickRegexGroup(
      initMethodsSource,
      /getStudentData\.load\(\{[\s\S]{0,1600}?formUuid:\s*"([^"]+)"/i
    );
    profile.searchStudentNoField = this.pickRegexGroup(
      initMethodsSource,
      /searchFieldJson:\s*JSON\.stringify\(\{[\s\S]{0,600}?"([^"]+)"\s*:\s*\[\s*window\.loginUser\.businessWorkNo/i
    );
    profile.searchStudentNameField = this.pickRegexGroup(
      initMethodsSource,
      /searchFieldJson:\s*JSON\.stringify\(\{[\s\S]{0,600}?"([^"]+)"\s*:\s*\[\s*userName/i
    );
    profile.updateStudentEmployeeField = this.pickRegexGroup(
      initMethodsSource,
      /updateFormDataJson:\s*JSON\.stringify\(\{[\s\S]{0,1200}?"([^"]+)"\s*:\s*\[\s*window\.loginUser\.businessWorkNo/i
    );
    profile.updateTimestampField = this.pickRegexGroup(
      initMethodsSource,
      /updateFormDataJson:\s*JSON\.stringify\(\{[\s\S]{0,1200}?"([^"]+)"\s*:\s*checkTime/i
    );
    profile.updateAddressField = this.pickRegexGroup(
      initMethodsSource,
      /updateFormDataJson:\s*JSON\.stringify\(\{[\s\S]{0,1200}?"([^"]+)"\s*:\s*checkAddress/i
    );
    profile.updateTypeField = this.pickRegexGroup(
      initMethodsSource,
      /updateFormDataJson:\s*JSON\.stringify\(\{[\s\S]{0,1200}?"([^"]+)"\s*:\s*checkType/i
    );
    profile.updateInstructorEmployeeField = this.pickRegexGroup(
      initMethodsSource,
      /updateFormDataJson:\s*JSON\.stringify\(\{[\s\S]{0,1200}?"([^"]+)"\s*:\s*\[\s*this\.state\.instructorNo/i
    );
    profile.instructorNoField = this.pickRegexGroup(
      initMethodsSource,
      /instructorNo:\s*res\.data\[0\]\.formData\.(textField_[A-Za-z0-9]+)/i
    );

    profile.checkStartHHmm = this.pickRegexGroup(
      rawText,
      /"checkStartDate"\s*:\s*\{[^}]*"value"\s*:\s*"[^"]*?\\\"\s*(\d{1,2}:\d{2})\\\"/i
    );
    profile.checkEndHHmm = this.pickRegexGroup(
      rawText,
      /"checkEndDate"\s*:\s*\{[^}]*"value"\s*:\s*"[^"]*?\\\"\s*(\d{1,2}:\d{2})\\\"/i
    );
    profile.amapKey = this.pickRegexGroup(
      rawText,
      /\/v3\/geocode\/regeo\?key=([a-f0-9]{32})/i
    );
    return profile;
  }

  mergeRollcallProfiles(base, patch) {
    const merged = {};
    const source = [base || {}, patch || {}];
    for (const bucket of source) {
      for (const [key, value] of Object.entries(bucket)) {
        if (value === null || value === undefined) {
          continue;
        }
        const text = typeof value === "string" ? value.trim() : value;
        if (text === "" || text === null || text === undefined) {
          continue;
        }
        merged[key] = text;
      }
    }
    return merged;
  }

  resolveAbsoluteUrl(baseUrl, maybePath) {
    const value = String(maybePath || "").trim();
    if (!value) {
      return "";
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    try {
      return new URL(value, baseUrl).toString();
    } catch (_error) {
      return value;
    }
  }

  async resolveCheckinApiProfile({ page, context, capture, csrfToken }) {
    await this.flushSchemaCapture(capture);
    const events = capture && Array.isArray(capture.events) ? capture.events.slice().sort((a, b) => a.at - b.at) : [];
    let parsed = {};
    if (events.length > 0) {
      parsed = this.parseRollcallProfileFromSchema(events[events.length - 1]);
    }

    const profile = this.mergeRollcallProfiles(DEFAULT_ROLLCALL_PROFILE, parsed);
    if (capture && events.length <= 0) {
      try {
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: this.config.navigationTimeoutMs
        });
        await page.waitForTimeout(260);
        await this.flushSchemaCapture(capture);
        const latestEvents = capture.events.slice().sort((a, b) => a.at - b.at);
        if (latestEvents.length > 0) {
          const retryParsed = this.parseRollcallProfileFromSchema(latestEvents[latestEvents.length - 1]);
          Object.assign(profile, this.mergeRollcallProfiles(profile, retryParsed));
        }
      } catch (_error) {
        // ignore reload failure, continue with defaults
      }
    }

    if (!profile.searchEndpoint && profile.appType) {
      profile.searchEndpoint = `/dingtalk/web/${profile.appType}/v1/form/searchFormDatas.json`;
    }
    if (!profile.updateEndpoint && profile.appType) {
      profile.updateEndpoint = `/dingtalk/web/${profile.appType}/v1/form/updateFormData.json`;
    }
    profile.searchEndpoint = this.resolveAbsoluteUrl(page.url(), profile.searchEndpoint);
    profile.updateEndpoint = this.resolveAbsoluteUrl(page.url(), profile.updateEndpoint);
    profile.csrfToken = String(csrfToken || "").trim();
    return profile;
  }

  async resolveCsrfToken(context, page) {
    let token = "";
    try {
      const state = await context.storageState();
      const cookies = Array.isArray(state && state.cookies) ? state.cookies : [];
      for (const name of ["c_csrf", "tianshu_csrf_token"]) {
        const matched = cookies.find((cookie) => cookie && cookie.name === name && cookie.value);
        if (matched) {
          token = String(matched.value || "").trim();
          if (token) {
            return token;
          }
        }
      }
    } catch (_error) {
      // ignore
    }

    try {
      token = await page.evaluate(() => {
        const pattern = /(?:^|;\s*)(?:c_csrf|tianshu_csrf_token)=([^;]+)/;
        const matched = String(document.cookie || "").match(pattern);
        return matched && matched[1] ? decodeURIComponent(matched[1]) : "";
      });
    } catch (_error) {
      token = "";
    }
    return String(token || "").trim();
  }

  async resolveLoginIdentity(page, user) {
    let identity = null;
    try {
      identity = await page.evaluate(() => {
        const raw = window.loginUser || window.userInfo || null;
        if (!raw || typeof raw !== "object") {
          return null;
        }
        return {
          businessWorkNo:
            raw.businessWorkNo || raw.workNo || raw.jobNumber || raw.userId || raw.userid || "",
          userName:
            raw.userName || raw.name || raw.nick || raw.nickName || raw.displayName || ""
        };
      });
    } catch (_error) {
      identity = null;
    }

    const resolved = {
      businessWorkNo: "",
      userName: ""
    };
    if (identity && identity.businessWorkNo) {
      resolved.businessWorkNo = String(identity.businessWorkNo).trim();
    }
    if (identity && identity.userName) {
      resolved.userName = String(identity.userName).trim();
    }

    if (!resolved.businessWorkNo) {
      try {
        const fallbackNo = await page.evaluate(() => {
          const pattern = /(?:^|;\s*)tianshu_corp_user=([^;]+)/;
          const matched = String(document.cookie || "").match(pattern);
          if (!matched || !matched[1]) {
            return "";
          }
          const raw = decodeURIComponent(matched[1]);
          const parts = raw.split("_");
          return parts.length > 1 ? parts[parts.length - 1] : "";
        });
        resolved.businessWorkNo = String(fallbackNo || "").trim();
      } catch (_error) {
        // ignore
      }
    }

    if (!resolved.userName) {
      resolved.userName = String(user.display_name || "").trim();
    }
    return resolved;
  }

  parseApiResult(payload, status, fallbackMessage = "", options = {}) {
    const opts = options || {};
    const strictEvidence = Boolean(opts.strictEvidence);
    const rawText = truncateText(String(opts.rawText || ""), 5000);
    const safePayload = payload && typeof payload === "object" ? payload : null;
    const code = this.extractApiCode(safePayload);
    const message = truncateText(this.extractApiMessage(safePayload), 300);
    const successFlag = this.extractApiSuccessFlag(safePayload);
    const mergedText = `${message} ${rawText} ${JSON.stringify(safePayload || {})}`.trim();
    if (Number(status) >= 500) {
      return {
        ok: false,
        message: `服务端错误(${status})`
      };
    }
    if (successFlag === true) {
      return {
        ok: true,
        message: message || fallbackMessage || "success=true"
      };
    }
    if (successFlag === false) {
      return {
        ok: false,
        message: this.extractFailureReason(mergedText) || message || fallbackMessage || "success=false"
      };
    }
    if (code !== null) {
      if (this.isLikelySuccessCode(code)) {
        return {
          ok: true,
          message: message || fallbackMessage || `code=${code}`
        };
      }
      return {
        ok: false,
        message: this.extractFailureReason(mergedText) || message || fallbackMessage || `code=${code}`
      };
    }
    if (Number(status) >= 400) {
      return {
        ok: false,
        message: this.extractFailureReason(mergedText) || message || fallbackMessage || `HTTP ${status}`
      };
    }
    if (strictEvidence && !safePayload && !rawText) {
      return {
        ok: false,
        message: `${fallbackMessage || "请求"}响应为空`
      };
    }
    if (/(成功|success|ok)/i.test(mergedText)) {
      return {
        ok: true,
        message: message || fallbackMessage || "ok"
      };
    }
    if (/(失败|错误|异常|invalid|denied|forbidden|不在|未到)/i.test(mergedText)) {
      return {
        ok: false,
        message: this.extractFailureReason(mergedText) || message || fallbackMessage || "failed keyword matched"
      };
    }
    if (strictEvidence) {
      return {
        ok: false,
        message: this.extractFailureReason(mergedText) || message || `${fallbackMessage || "请求"}响应无法确认成功`
      };
    }
    return {
      ok: true,
      message: message || fallbackMessage || "request ok"
    };
  }

  async readResponseBody(response) {
    let rawText = "";
    let payload = null;
    try {
      rawText = String(await response.text());
    } catch (_error) {
      rawText = "";
    }
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch (_error) {
        payload = null;
      }
    }
    return {
      payload,
      rawText: truncateText(rawText, 120000)
    };
  }

  async requestJsonViaPageGet(page, endpoint, params) {
    const pageFetch = await page.evaluate(async (input) => {
      const query = new URLSearchParams();
      const entries = Object.entries(input && input.params && typeof input.params === "object" ? input.params : {});
      for (const [key, value] of entries) {
        query.set(String(key), String(value === undefined || value === null ? "" : value));
      }
      const rawEndpoint = String((input && input.endpoint) || "");
      const connector = rawEndpoint.includes("?") ? "&" : "?";
      const url = `${rawEndpoint}${connector}${query.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        credentials: "include"
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (_error) {
        payload = null;
      }
      return {
        status: Number(response.status || 0),
        payload,
        rawText: text
      };
    }, {
      endpoint,
      params
    });
    return {
      status: Number(pageFetch && pageFetch.status ? pageFetch.status : 0),
      payload: pageFetch && pageFetch.payload ? pageFetch.payload : null,
      rawText: truncateText(String(pageFetch && pageFetch.rawText ? pageFetch.rawText : ""), 120000)
    };
  }

  async verifySubmittedStudentRow({
    context,
    page,
    profile,
    csrfToken,
    identity,
    formInstId,
    expectedTimestamp,
    previousTimestamp
  }) {
    const checks = [];
    const delays = [180, 420, 780];
    for (let i = 0; i < delays.length; i += 1) {
      const found = await this.searchStudentRows(
        context,
        page,
        profile,
        csrfToken,
        identity,
        null
      );
      const rows = Array.isArray(found && found.rows) ? found.rows : [];
      const selected = rows.find((item) => String(item.formInstId || "") === String(formInstId || "")) || rows[0] || null;
      const formData = toObject(selected && selected.formData);
      const ts = Number(formData[profile.updateTimestampField]);
      const tsValid = Number.isFinite(ts) && ts > 0;
      const changedFromOld =
        tsValid && (!Number.isFinite(Number(previousTimestamp)) || ts !== Number(previousTimestamp));
      const closeToExpected =
        tsValid && Number.isFinite(Number(expectedTimestamp)) && Math.abs(ts - Number(expectedTimestamp)) <= 5 * 60 * 1000;
      checks.push({
        attempt: i + 1,
        rows: rows.length,
        formInstIdMatched: Boolean(selected && String(selected.formInstId || "") === String(formInstId || "")),
        timestamp: tsValid ? ts : null,
        changedFromPrevious: Boolean(changedFromOld),
        closeToExpected: Boolean(closeToExpected),
        ok: Boolean(changedFromOld && closeToExpected)
      });
      if (changedFromOld && closeToExpected) {
        return {
          ok: true,
          checks
        };
      }
      if (i < delays.length - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, delays[i]);
        });
      }
    }
    return {
      ok: false,
      checks
    };
  }

  async inspectCurrentCheckinState({
    context,
    page,
    profile,
    csrfToken,
    identity,
    formInstId,
    tz
  }) {
    const search = await this.searchStudentRows(
      context,
      page,
      profile,
      csrfToken,
      identity,
      null
    );
    const rows = Array.isArray(search && search.rows) ? search.rows : [];
    const selected =
      rows.find((item) => String(item.formInstId || "") === String(formInstId || "")) ||
      rows[0] ||
      null;
    if (!selected) {
      return {
        ok: false,
        status: "not_found",
        message: "回查失败：未找到花名册记录",
        rowCount: rows.length
      };
    }
    const formData = toObject(selected.formData);
    const ts = Number(formData[profile.updateTimestampField]);
    const validTs = Number.isFinite(ts) && ts > 0 ? ts : null;
    const signedToday = this.isAlreadySignedToday(validTs, tz);
    return {
      ok: signedToday,
      status: signedToday ? "signed_today" : "not_signed_today",
      message: signedToday
        ? `回查确认：今日已签到（${formatDateTimeInTz(validTs, tz)}）`
        : "回查确认：今日仍未签到",
      rowCount: rows.length,
      formInstId: String(selected.formInstId || ""),
      lastTimestamp: validTs
    };
  }

  maskSensitiveToken(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    if (text.length <= 8) {
      return "****";
    }
    return `${text.slice(0, 3)}***${text.slice(-3)}`;
  }

  normalizeDebugValue(value, maxTextLength = 120000) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      return truncateText(value, maxTextLength);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    try {
      const text = JSON.stringify(value);
      if (text.length > maxTextLength) {
        return {
          truncated: true,
          originalSize: text.length,
          preview: `${text.slice(0, maxTextLength)}...`
        };
      }
      return JSON.parse(text);
    } catch (_error) {
      return truncateText(String(value), maxTextLength);
    }
  }

  sanitizeRequestParamsForDebug(params) {
    const input = params && typeof params === "object" ? params : {};
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      if (/csrf/i.test(key)) {
        output[key] = this.maskSensitiveToken(value);
        continue;
      }
      output[key] = this.normalizeDebugValue(value, 20000);
    }
    return output;
  }

  extractSearchRows(payload) {
    const candidates = [
      payload && payload.content && payload.content.data,
      payload && payload.data,
      payload && payload.content && payload.content.list,
      payload && payload.list
    ];
    for (const bucket of candidates) {
      if (Array.isArray(bucket)) {
        return bucket;
      }
    }
    return [];
  }

  buildSearchPayload(profile, identity, options = {}) {
    const payload = {};
    const useArray = options.useArray !== false;
    const includeNo = options.includeNo !== false;
    const includeName = options.includeName !== false;
    const noField = String(profile && profile.searchStudentNoField ? profile.searchStudentNoField : "").trim();
    const nameField = String(profile && profile.searchStudentNameField ? profile.searchStudentNameField : "").trim();
    const noValue = String(identity && identity.businessWorkNo ? identity.businessWorkNo : "").trim();
    const nameValue = String(identity && identity.userName ? identity.userName : "").trim();

    if (includeNo && noField && noValue) {
      payload[noField] = useArray ? [noValue] : noValue;
    }
    if (includeName && nameField && nameValue) {
      payload[nameField] = useArray ? [nameValue] : nameValue;
    }
    return payload;
  }

  buildSearchCandidates(profile, identity) {
    const candidates = [];
    const noValue = String(identity && identity.businessWorkNo ? identity.businessWorkNo : "").trim();
    const nameValue = String(identity && identity.userName ? identity.userName : "").trim();
    const nameCompact = nameValue.replace(/\s+/g, "");
    const nameVariants = Array.from(new Set([nameValue, nameCompact].map((x) => String(x || "").trim()).filter(Boolean)));

    if (noValue || nameValue) {
      candidates.push({
        label: "array:no+name",
        payload: this.buildSearchPayload(profile, identity, {
          useArray: true,
          includeNo: true,
          includeName: true
        })
      });
      candidates.push({
        label: "array:no",
        payload: this.buildSearchPayload(profile, identity, {
          useArray: true,
          includeNo: true,
          includeName: false
        })
      });
      candidates.push({
        label: "array:name",
        payload: this.buildSearchPayload(profile, identity, {
          useArray: true,
          includeNo: false,
          includeName: true
        })
      });
      candidates.push({
        label: "scalar:no+name",
        payload: this.buildSearchPayload(profile, identity, {
          useArray: false,
          includeNo: true,
          includeName: true
        })
      });
      candidates.push({
        label: "scalar:no",
        payload: this.buildSearchPayload(profile, identity, {
          useArray: false,
          includeNo: true,
          includeName: false
        })
      });
      candidates.push({
        label: "scalar:name",
        payload: this.buildSearchPayload(profile, identity, {
          useArray: false,
          includeNo: false,
          includeName: true
        })
      });
    }

    if (nameVariants.length > 1 && String(profile && profile.searchStudentNameField ? profile.searchStudentNameField : "").trim()) {
      const altIdentity = {
        businessWorkNo: noValue,
        userName: nameVariants[1]
      };
      candidates.push({
        label: "array:no+name(compact)",
        payload: this.buildSearchPayload(profile, altIdentity, {
          useArray: true,
          includeNo: true,
          includeName: true
        })
      });
      candidates.push({
        label: "scalar:no+name(compact)",
        payload: this.buildSearchPayload(profile, altIdentity, {
          useArray: false,
          includeNo: true,
          includeName: true
        })
      });
    }

    const unique = [];
    const seen = new Set();
    for (const item of candidates) {
      if (!item || !item.payload || Object.keys(item.payload).length <= 0) {
        continue;
      }
      const key = JSON.stringify(item.payload);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }

  async searchStudentRows(context, page, profile, csrfToken, identity, debugTrace = null) {
    const candidates = this.buildSearchCandidates(profile, identity);
    if (candidates.length <= 0) {
      return {
        ok: false,
        message: "未解析到花名册检索字段",
        rows: [],
        attempts: []
      };
    }

    const attempts = [];
    const debugEnabled = Boolean(debugTrace && typeof debugTrace === "object");
    if (debugEnabled && !Array.isArray(debugTrace.searchRequests)) {
      debugTrace.searchRequests = [];
    }
    const runCandidatesBySource = async (source) => {
      const usingPage = source === "page";
      for (const candidate of candidates) {
        const requestParams = {
          formUuid: profile.studentFormUuid,
          searchFieldJson: JSON.stringify(candidate.payload),
          _csrf_token: csrfToken
        };
        const debugEntry = debugEnabled
          ? {
              source,
              label: candidate.label,
              request: {
                method: "GET",
                endpoint: profile.searchEndpoint,
                params: this.sanitizeRequestParamsForDebug(requestParams)
              },
              response: null
            }
          : null;
        let payload = null;
        let rawText = "";
        let responseStatus = 0;
        let verdict = { ok: false, message: "请求失败" };
        try {
          if (!usingPage) {
            const response = await context.request.get(profile.searchEndpoint, {
              params: requestParams,
              timeout: this.config.navigationTimeoutMs,
              failOnStatusCode: false
            });
            responseStatus = Number(response.status() || 0);
            const body = await this.readResponseBody(response);
            payload = body.payload;
            rawText = body.rawText;
          } else {
            const pageFetch = await page.evaluate(async (params) => {
              const query = new URLSearchParams();
              query.set("formUuid", String(params.formUuid || ""));
              query.set("searchFieldJson", String(params.searchFieldJson || "{}"));
              query.set("_csrf_token", String(params.csrfToken || ""));
              const endpoint = String(params.endpoint || "");
              const connector = endpoint.includes("?") ? "&" : "?";
              const url = `${endpoint}${connector}${query.toString()}`;
              const response = await fetch(url, {
                method: "GET",
                credentials: "include"
              });
              const text = await response.text();
              let jsonPayload = null;
              try {
                jsonPayload = text ? JSON.parse(text) : null;
              } catch (_error) {
                jsonPayload = null;
              }
              return {
                status: Number(response.status || 0),
                payload: jsonPayload,
                rawText: text
              };
            }, {
              endpoint: profile.searchEndpoint,
              formUuid: requestParams.formUuid,
              searchFieldJson: requestParams.searchFieldJson,
              csrfToken: requestParams._csrf_token
            });
            responseStatus = Number(pageFetch && pageFetch.status ? pageFetch.status : 0);
            payload = pageFetch && pageFetch.payload ? pageFetch.payload : null;
            rawText = pageFetch && pageFetch.rawText ? String(pageFetch.rawText) : "";
          }
          verdict = this.parseApiResult(payload, responseStatus, "查询花名册", {
            strictEvidence: true,
            rawText
          });
          if (debugEntry) {
            debugEntry.response = {
              status: responseStatus,
              payload: this.normalizeDebugValue(payload, 60000),
              verdict: {
                ok: verdict.ok,
                message: verdict.message
              }
            };
          }
        } catch (error) {
          verdict = {
            ok: false,
            message: truncateText(error.message || "请求异常", 160)
          };
          if (debugEntry) {
            debugEntry.response = {
              status: responseStatus,
              payload: null,
              verdict: {
                ok: false,
                message: verdict.message
              }
            };
          }
        }
        const rows = this.extractSearchRows(payload);
        attempts.push({
          source,
          label: candidate.label,
          payloadKeys: Object.keys(candidate.payload || {}),
          ok: verdict.ok,
          message: verdict.message,
          rows: rows.length,
          httpStatus: responseStatus
        });
        if (debugEntry) {
          debugEntry.rows = rows.length;
          debugTrace.searchRequests.push(debugEntry);
        }
        if (verdict.ok && rows.length > 0) {
          return {
            ok: true,
            message: verdict.message || "ok",
            rows,
            attempts
          };
        }
      }
      return null;
    };

    const contextResult = await runCandidatesBySource("context");
    if (contextResult) {
      return contextResult;
    }
    if (page) {
      const pageResult = await runCandidatesBySource("page");
      if (pageResult) {
        return pageResult;
      }
    }

    return {
      ok: false,
      message: "查询花名册为空，未匹配到当前登录账号",
      rows: [],
      attempts
    };
  }

  isWithinCheckWindow(startHHmm, endHHmm, tz) {
    const startMinutes = parseHHmmToMinutes(startHHmm);
    const endMinutes = parseHHmmToMinutes(endHHmm);
    if (startMinutes === null || endMinutes === null) {
      return {
        within: true,
        currentHHmm: getTimeInTz(new Date(), tz)
      };
    }
    const nowHHmm = getTimeInTz(new Date(), tz);
    const nowMinutes = parseHHmmToMinutes(nowHHmm);
    if (nowMinutes === null) {
      return {
        within: true,
        currentHHmm: nowHHmm
      };
    }
    let within = false;
    if (startMinutes <= endMinutes) {
      within = nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    } else {
      within = nowMinutes >= startMinutes || nowMinutes <= endMinutes;
    }
    return {
      within,
      currentHHmm: nowHHmm
    };
  }

  isAlreadySignedToday(timestampMs, tz) {
    if (!Number.isFinite(Number(timestampMs)) || Number(timestampMs) <= 0) {
      return false;
    }
    const currentDate = getDateInTz(new Date(), tz);
    const signedDate = getDateInTz(new Date(Number(timestampMs)), tz);
    return currentDate === signedDate;
  }

  resolveInstructorNo(row, profile) {
    const formData = toObject(row && row.formData);
    const byConfiguredField = String(profile && profile.instructorNoField ? profile.instructorNoField : "").trim();
    if (byConfiguredField && formData[byConfiguredField]) {
      return String(formData[byConfiguredField]).trim();
    }

    const idListKey = `${String(profile.updateInstructorEmployeeField || "").trim()}_id`;
    const idList = formData[idListKey];
    if (Array.isArray(idList) && idList.length > 0 && idList[0]) {
      return String(idList[0]).trim();
    }

    for (const [key, value] of Object.entries(formData)) {
      if (!key.startsWith("textField_")) {
        continue;
      }
      if (/^\d{6,}$/.test(String(value || ""))) {
        return String(value).trim();
      }
    }
    return "";
  }

  async performCheckinByApi({ context, page, user, simulated, options = {}, schemaCapture = null }) {
    const debugMode = Boolean(options.debugMode);
    const debugTraceEnabled = Boolean(options.captureDebugTrace || debugMode);
    const ignoreCheckWindow = Boolean(options.ignoreCheckWindow);
    const ignoreAlreadySignedToday = Boolean(options.ignoreAlreadySignedToday);
    const tz = user.timezone || this.config.defaultTimezone || "Asia/Shanghai";
    const checkType = String(user.radio_option_text || "校内").trim() || "校内";
    const debugTrace = debugTraceEnabled
      ? {
          enabled: true,
          modeEnabled: debugMode,
          timezone: tz,
          profile: null,
          identity: null,
          checkWindow: null,
          searchRequests: [],
          selectedStudent: null,
          address: null,
          submit: null
        }
      : null;

    const csrfToken = await this.resolveCsrfToken(context, page);
    if (!csrfToken) {
      throw new Error("缺少 _csrf_token，请先重新扫码登录更新 Cookie");
    }

    const profile = await this.resolveCheckinApiProfile({
      page,
      context,
      capture: schemaCapture,
      csrfToken
    });

    if (!profile.searchEndpoint || !profile.updateEndpoint || !profile.studentFormUuid) {
      throw new Error("未能解析签到接口参数（search/update/formUuid）");
    }
    if (debugTrace) {
      debugTrace.profile = this.normalizeDebugValue(
        {
          appType: profile.appType,
          pageFormUuid: profile.pageFormUuid,
          studentFormUuid: profile.studentFormUuid,
          searchEndpoint: profile.searchEndpoint,
          updateEndpoint: profile.updateEndpoint,
          checkStartHHmm: profile.checkStartHHmm,
          checkEndHHmm: profile.checkEndHHmm
        },
        12000
      );
    }

    const identity = await this.resolveLoginIdentity(page, user);
    if (!identity.businessWorkNo && !identity.userName) {
      throw new Error("无法识别当前登录身份（businessWorkNo / userName）");
    }
    if (debugTrace) {
      debugTrace.identity = this.normalizeDebugValue(identity, 4000);
    }

    const windowCheck = this.isWithinCheckWindow(profile.checkStartHHmm, profile.checkEndHHmm, tz);
    if (debugTrace) {
      debugTrace.checkWindow = this.normalizeDebugValue(
        {
          start: profile.checkStartHHmm,
          end: profile.checkEndHHmm,
          currentHHmm: windowCheck.currentHHmm,
          within: windowCheck.within
        },
        4000
      );
    }
    if (!windowCheck.within && !ignoreCheckWindow) {
      if (!debugMode) {
        return {
          status: "failed",
          message: `不在签到时间范围（${profile.checkStartHHmm}-${profile.checkEndHHmm}，当前 ${windowCheck.currentHHmm}）`,
          debugTrace
        };
      }
      if (debugTrace) {
        debugTrace.checkWindowBypassed = true;
      }
    } else if (!windowCheck.within && ignoreCheckWindow && debugTrace) {
      debugTrace.checkWindowBypassed = true;
      debugTrace.checkWindowBypassReason = "manual_ignore_check_window";
    }

    const searchResult = await this.searchStudentRows(
      context,
      page,
      profile,
      csrfToken,
      identity,
      debugTrace
    );
    let rows = searchResult.rows || [];
    if (rows.length <= 0) {
      const attempted = Array.isArray(searchResult.attempts) ? searchResult.attempts.length : 0;
      return {
        status: "failed",
        message: `查询花名册为空，未匹配到当前登录账号（formUuid=${profile.studentFormUuid}，已尝试${attempted}种查询）`,
        preview: truncateText(
          JSON.stringify({
            attempts: (searchResult.attempts || []).map((item) => ({
              source: item.source,
              label: item.label,
              httpStatus: item.httpStatus,
              rows: item.rows,
              ok: item.ok
            }))
          }),
          220
        ),
        debugTrace
      };
    }

    const studentRow = toObject(rows[0]);
    const formInstId = String(studentRow.formInstId || "").trim();
    if (debugTrace) {
      debugTrace.selectedStudent = this.normalizeDebugValue(
        {
          formInstId,
          availableFormDataKeys: Object.keys(toObject(studentRow.formData || {})).slice(0, 30)
        },
        12000
      );
    }
    if (!formInstId) {
      return {
        status: "failed",
        message: "花名册数据缺少 formInstId",
        debugTrace
      };
    }

    const formData = toObject(studentRow.formData);
    const existingCheckTimestamp = Number(formData[profile.updateTimestampField]);
    const alreadySignedToday = this.isAlreadySignedToday(existingCheckTimestamp, tz);
    if (alreadySignedToday && !ignoreAlreadySignedToday) {
      return {
        status: "failed",
        message: `今日已签到，未执行提交（当前 ${windowCheck.currentHHmm}）`,
        debugTrace
      };
    }
    if (alreadySignedToday && ignoreAlreadySignedToday && debugTrace) {
      debugTrace.alreadySignedBypassed = true;
      debugTrace.alreadySignedBypassReason = "manual_ignore_already_signed";
      debugTrace.previousSignedTimestamp = Number.isFinite(existingCheckTimestamp)
        ? existingCheckTimestamp
        : null;
    }

    const optionsLocationProfile = options && options.locationProfile ? options.locationProfile : null;
    const storedSubmitAddress = String(
      optionsLocationProfile && optionsLocationProfile.submit_address_text
        ? optionsLocationProfile.submit_address_text
        : ""
    ).trim();
    let addressText = storedSubmitAddress;
    if (addressText) {
      if (debugTrace) {
        debugTrace.address = this.normalizeDebugValue(
          {
            source: "location_profile",
            text: addressText
          },
          12000
        );
      }
    } else {
      if (debugTrace) {
        debugTrace.address = this.normalizeDebugValue(
          {
            source: "missing_location_profile_submit_address_text",
            error: "缺少签到提交地址文本"
          },
          12000
        );
      }
      return {
        status: "failed",
        message: "缺少签到提交地址文本，请先在“设置位置”中手动填写",
        debugTrace
      };
    }
    if (debugMode) {
      const windowHint = windowCheck.within
        ? ""
        : `（当前 ${windowCheck.currentHHmm}，已跳过时间窗口 ${profile.checkStartHHmm}-${profile.checkEndHHmm}）`;
      return {
        status: "failed",
        message: `debug 模式：已完成定位/地址检查，未执行提交${windowHint}`,
        preview: `${addressText} | ${simulated.latitude},${simulated.longitude}`,
        debugTrace
      };
    }

    const requiredUpdateFields = [
      "updateStudentEmployeeField",
      "updateTimestampField",
      "updateAddressField",
      "updateTypeField"
    ];
    for (const key of requiredUpdateFields) {
      if (!String(profile[key] || "").trim()) {
        return {
          status: "failed",
          message: `未解析到提交字段: ${key}`
        };
      }
    }

    const instructorNo = this.resolveInstructorNo(studentRow, profile);
    const updateData = {
      [profile.updateStudentEmployeeField]: [identity.businessWorkNo],
      [profile.updateTimestampField]: Date.now(),
      [profile.updateAddressField]: addressText,
      [profile.updateTypeField]: checkType
    };
    if (instructorNo && profile.updateInstructorEmployeeField) {
      updateData[profile.updateInstructorEmployeeField] = [instructorNo];
    }

    const updateRequestParams = {
      formInstId,
      updateFormDataJson: JSON.stringify(updateData),
      useLatestVersion: "y",
      _csrf_token: csrfToken
    };
    if (debugTrace) {
      debugTrace.submit = {
        request: {
          method: "GET",
          endpoint: profile.updateEndpoint,
          params: this.sanitizeRequestParamsForDebug(updateRequestParams)
        },
        response: null
      };
    }

    const submitAttempts = [];
    let updateStatus = 0;
    let updateJson = null;
    let updateRawText = "";
    let updateVerdict = {
      ok: false,
      message: "提交签到请求未执行"
    };
    let updateSource = "context";
    try {
      const updateResponse = await context.request.get(profile.updateEndpoint, {
        params: updateRequestParams,
        timeout: this.config.navigationTimeoutMs,
        failOnStatusCode: false
      });
      const updateBody = await this.readResponseBody(updateResponse);
      updateStatus = Number(updateResponse.status() || 0);
      updateJson = updateBody.payload;
      updateRawText = updateBody.rawText;
      updateVerdict = this.parseApiResult(updateJson, updateStatus, "提交签到", {
        strictEvidence: true,
        rawText: updateRawText
      });
      submitAttempts.push({
        source: "context",
        status: updateStatus,
        verdict: this.normalizeDebugValue(updateVerdict, 4000),
        payload: this.normalizeDebugValue(updateJson, 80000),
        rawText: this.normalizeDebugValue(updateRawText, 2000)
      });
    } catch (error) {
      updateVerdict = {
        ok: false,
        message: `提交签到请求异常: ${truncateText(String(error && error.message ? error.message : "unknown"), 160)}`
      };
      submitAttempts.push({
        source: "context",
        status: updateStatus,
        verdict: this.normalizeDebugValue(updateVerdict, 4000),
        payload: null,
        rawText: ""
      });
    }

    const needPageRetry = !updateVerdict.ok &&
      (/响应为空|无法确认/.test(String(updateVerdict.message || "")) ||
        (!updateJson && !String(updateRawText || "").trim()));
    if (needPageRetry && page) {
      try {
        const pageBody = await this.requestJsonViaPageGet(page, profile.updateEndpoint, updateRequestParams);
        const pageVerdict = this.parseApiResult(pageBody.payload, pageBody.status, "提交签到", {
          strictEvidence: true,
          rawText: pageBody.rawText
        });
        submitAttempts.push({
          source: "page",
          status: pageBody.status,
          verdict: this.normalizeDebugValue(pageVerdict, 4000),
          payload: this.normalizeDebugValue(pageBody.payload, 80000),
          rawText: this.normalizeDebugValue(pageBody.rawText, 2000)
        });
        updateSource = "page";
        updateStatus = Number(pageBody.status || 0);
        updateJson = pageBody.payload;
        updateRawText = pageBody.rawText;
        updateVerdict = pageVerdict;
      } catch (error) {
        submitAttempts.push({
          source: "page",
          status: 0,
          verdict: {
            ok: false,
            message: `页面提交重试异常: ${truncateText(String(error && error.message ? error.message : "unknown"), 160)}`
          },
          payload: null,
          rawText: ""
        });
      }
    }
    const submitSummary = {
      mode: ignoreCheckWindow ? "manual_force_submit" : "normal_submit",
      alreadySigned: {
        beforeSubmit: Boolean(alreadySignedToday),
        ignored: Boolean(alreadySignedToday && ignoreAlreadySignedToday)
      },
      checkWindow: {
        start: profile.checkStartHHmm,
        end: profile.checkEndHHmm,
        currentHHmm: windowCheck.currentHHmm,
        within: Boolean(windowCheck.within),
        ignored: Boolean(ignoreCheckWindow && !windowCheck.within)
      },
      api: {
        source: updateSource,
        httpStatus: Number(updateStatus || 0),
        verdict: String(updateVerdict.message || "").trim(),
        success: Boolean(updateVerdict.ok),
        attempts: this.normalizeDebugValue(submitAttempts, 120000)
      }
    };
    if (debugTrace && debugTrace.submit) {
      debugTrace.submit.response = {
        source: updateSource,
        status: Number(updateStatus || 0),
        payload: this.normalizeDebugValue(updateJson, 80000),
        rawText: this.normalizeDebugValue(updateRawText, 2000),
        verdict: this.normalizeDebugValue(updateVerdict, 4000),
        attempts: this.normalizeDebugValue(submitAttempts, 120000)
      };
    }
    const verifyResult = await this.verifySubmittedStudentRow({
      context,
      page,
      profile,
      csrfToken,
      identity,
      formInstId,
      expectedTimestamp: updateData[profile.updateTimestampField],
      previousTimestamp: existingCheckTimestamp
    });
    const statusCheck = await this.inspectCurrentCheckinState({
      context,
      page,
      profile,
      csrfToken,
      identity,
      formInstId,
      tz
    });
    submitSummary.verify = this.normalizeDebugValue(verifyResult, 20000);
    submitSummary.statusCheck = this.normalizeDebugValue(statusCheck, 20000);
    if (debugTrace) {
      debugTrace.submitVerify = this.normalizeDebugValue(verifyResult, 20000);
      debugTrace.statusCheck = this.normalizeDebugValue(statusCheck, 20000);
    }
    if (verifyResult.ok && statusCheck.ok) {
      if (!updateVerdict.ok) {
        const manualResubmitHint =
          alreadySignedToday && ignoreAlreadySignedToday ? "，已忽略今日已签到限制" : "";
        const fallbackSuccessMessage =
          ignoreCheckWindow && !windowCheck.within
            ? `手动签到提交成功（已忽略时间窗口 ${profile.checkStartHHmm}-${profile.checkEndHHmm}，当前 ${windowCheck.currentHHmm}${manualResubmitHint}；接口响应异常但回查确认成功）`
            : `接口响应异常，但回查确认签到已更新${manualResubmitHint}`;
        return {
          status: "success",
          message: fallbackSuccessMessage,
          preview: truncateText(addressText, 180),
          submitSummary,
          debugTrace
        };
      }
    } else if (!updateVerdict.ok) {
      const failPrefix = alreadySignedToday && ignoreAlreadySignedToday
        ? "手动重提签到失败（已忽略今日已签到限制）"
        : (
          ignoreCheckWindow && !windowCheck.within
            ? `手动签到提交失败（已忽略时间窗口 ${profile.checkStartHHmm}-${profile.checkEndHHmm}，当前 ${windowCheck.currentHHmm}）`
            : "提交签到失败"
        );
      return {
        status: "failed",
        message: `${failPrefix}: ${updateVerdict.message}`,
        preview: truncateText(JSON.stringify(updateJson || {}), 240),
        submitSummary,
        debugTrace
      };
    } else if (!statusCheck.ok) {
      return {
        status: "failed",
        message: `提交后回查未确认签到成功: ${statusCheck.message || "未知原因"}`,
        preview: truncateText(JSON.stringify(statusCheck || {}), 240),
        submitSummary,
        debugTrace
      };
    } else {
      return {
        status: "failed",
        message: "提交接口返回成功，但回查未确认签到字段更新",
        preview: truncateText(JSON.stringify(submitSummary.verify || {}), 240),
        submitSummary,
        debugTrace
      };
    }
    const successMessage = alreadySignedToday && ignoreAlreadySignedToday
      ? `手动重提签到成功（已忽略今日已签到限制）: ${updateVerdict.message}`
      : (
        ignoreCheckWindow && !windowCheck.within
          ? `手动签到提交成功（已忽略时间窗口 ${profile.checkStartHHmm}-${profile.checkEndHHmm}，当前 ${windowCheck.currentHHmm}）`
          : `接口提交成功: ${updateVerdict.message}`
      );
    return {
      status: "success",
      message: successMessage,
      preview: truncateText(addressText, 180),
      submitSummary,
      debugTrace
    };
  }

  async detectCheckinSuccess(page, signedMarkerText, checkinButtonText, options = {}) {
    const opts = options || {};
    const allowButtonStateFallback = opts.allowButtonStateFallback !== false;
    const markerCandidates = Array.from(
      new Set(
        [
          signedMarkerText,
          "今日已签到",
          "已签到",
          "签到成功",
          "签到完成",
          "今日已打卡",
          "已打卡",
          "打卡成功",
          "打卡完成",
          "提交成功"
        ]
          .map((text) => String(text || "").trim())
          .filter(Boolean)
      )
    );
    for (const marker of markerCandidates) {
      const count = await page.getByText(marker, { exact: false }).count();
      if (count > 0) {
        return {
          success: true,
          reason: `marker matched: ${marker}`,
          bodyText: ""
        };
      }
    }

    const bodyText = truncateText(await page.locator("body").innerText(), 2000);
    if (/(签到成功|签到完成|已签到|打卡成功|打卡完成|已打卡|提交成功)/.test(bodyText)) {
      return {
        success: true,
        reason: "success keyword matched in body",
        bodyText
      };
    }

    if (!allowButtonStateFallback) {
      return {
        success: false,
        reason: "no success marker before click",
        bodyText
      };
    }

    const checkinButton = page.getByText(checkinButtonText, { exact: false }).first();
    const buttonCount = await checkinButton.count();
    if (buttonCount <= 0) {
      return {
        success: true,
        reason: "checkin button disappeared after click",
        bodyText
      };
    }
    let buttonDisabled = false;
    let buttonText = "";
    try {
      buttonDisabled = await checkinButton.isDisabled();
    } catch (_error) {
      buttonDisabled = false;
    }
    try {
      buttonText = String(await checkinButton.innerText()).trim();
    } catch (_error) {
      buttonText = "";
    }
    if (buttonDisabled || /已签到|已打卡|已完成|完成/.test(buttonText)) {
      return {
        success: true,
        reason: "checkin button state changed",
        bodyText
      };
    }

    return {
      success: false,
      reason: "no success marker after click",
      bodyText
    };
  }

  extractFailureReason(bodyText) {
    const text = String(bodyText || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      return "";
    }
    const rules = [
      {
        re: /(不在.{0,16}(签到|打卡|考勤).{0,12}(时间|时段)|非.{0,12}(签到|打卡).{0,12}(时间|时段)|当前时间.{0,18}不在|不在可签到时间|未到.{0,12}(签到|打卡).{0,12}(时间|时段)|签到时间未到|签到已结束|超过签到时间|请在.{0,20}(签到|打卡))/,
        reason: "不在规定签到时间"
      },
      {
        re: /(不在.{0,10}(范围|地点)|超出.{0,10}(范围|距离)|距离.{0,8}(过远|太远))/,
        reason: "不在允许签到范围"
      },
      {
        re: /(定位.{0,10}(失败|异常|未开启|未授权)|无法获取定位|请开启定位)/,
        reason: "定位异常或未授权"
      },
      {
        re: /(未登录|登录失效|请先登录|需要登录|重新登录)/,
        reason: "登录状态失效"
      },
      {
        re: /(网络.{0,10}(异常|错误|超时)|请求.{0,10}(失败|超时)|系统繁忙)/,
        reason: "网络或服务异常"
      },
      {
        re: /(重复签到|已经签到|今日已签到|今日已打卡)/,
        reason: "可能已签到"
      }
    ];
    for (const rule of rules) {
      if (rule.re.test(text)) {
        return rule.reason;
      }
    }
    const directMatch = text.match(
      /(不在.{0,16}(时间|范围)|距离.{0,12}(过远|太远)|定位.{0,16}(失败|异常)|请先.{0,12}登录|网络.{0,12}(异常|错误|超时))/
    );
    if (directMatch && directMatch[0]) {
      return directMatch[0];
    }
    return "";
  }

  parseCronToHHmm(cronExpr) {
    const expr = String(cronExpr || "").trim();
    const parts = expr.split(/\s+/);
    if (parts.length < 3) {
      return null;
    }
    const minute = Number(parts[1]);
    const hour = Number(parts[2]);
    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  inferLikelyTimeReason(user) {
    const scheduled = this.parseCronToHHmm(user && user.cron_expr);
    if (!scheduled) {
      return "";
    }
    const tz = (user && user.timezone) || this.config.defaultTimezone || "Asia/Shanghai";
    const nowHHmm = getTimeInTz(new Date(), tz);
    const [sh, sm] = scheduled.split(":").map(Number);
    const [nh, nm] = nowHHmm.split(":").map(Number);
    const scheduledMinutes = sh * 60 + sm;
    const nowMinutes = nh * 60 + nm;
    const rawDiff = Math.abs(nowMinutes - scheduledMinutes);
    const diff = Math.min(rawDiff, 1440 - rawDiff);
    if (diff >= 45) {
      return `当前时间 ${nowHHmm}（${tz}）与计划签到时间 ${scheduled} 差异较大，疑似不在签到时间`;
    }
    return "";
  }

  isCheckinSubmitRequest(url, method) {
    const requestMethod = String(method || "").trim().toUpperCase();
    if (requestMethod && requestMethod !== "POST") {
      return false;
    }
    const rawUrl = String(url || "").toLowerCase();
    return (
      rawUrl.includes("/query/formdata/saveformdata.json") ||
      rawUrl.includes("/query/instance/startinstance.json") ||
      rawUrl.includes("/query/formdata/submit") ||
      rawUrl.includes("/query/instance/submit") ||
      rawUrl.includes("/query/formdata/save.json")
    );
  }

  toBooleanLike(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return null;
    }
    const text = String(value || "")
      .trim()
      .toLowerCase();
    if (!text) {
      return null;
    }
    if (["true", "1", "ok", "success", "pass", "yes", "y"].includes(text)) {
      return true;
    }
    if (["false", "0", "fail", "failed", "error", "no", "n"].includes(text)) {
      return false;
    }
    return null;
  }

  readPayloadValue(payload, keys, depth = 0) {
    if (!payload || typeof payload !== "object" || depth > 4) {
      return undefined;
    }

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        return payload[key];
      }
    }

    const nestedKeys = [
      "data",
      "result",
      "content",
      "response",
      "error",
      "bizError",
      "biz_error",
      "payload"
    ];
    for (const key of nestedKeys) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) {
        continue;
      }
      const nested = payload[key];
      if (!nested || typeof nested !== "object") {
        continue;
      }
      const value = this.readPayloadValue(nested, keys, depth + 1);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  extractApiMessage(payload) {
    const raw = this.readPayloadValue(payload, [
      "message",
      "msg",
      "errorMsg",
      "errorMessage",
      "errMsg",
      "detailMsg",
      "toast",
      "tips",
      "retMsg",
      "subMessage",
      "subMsg"
    ]);
    if (raw === undefined || raw === null) {
      return "";
    }
    if (typeof raw === "string") {
      return raw.trim();
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      return String(raw);
    }
    try {
      return JSON.stringify(raw);
    } catch (_error) {
      return String(raw);
    }
  }

  extractApiCode(payload) {
    const raw = this.readPayloadValue(payload, [
      "code",
      "errorCode",
      "errno",
      "ret",
      "retCode",
      "status",
      "statusCode"
    ]);
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }
    return raw;
  }

  extractApiSuccessFlag(payload) {
    const raw = this.readPayloadValue(payload, [
      "success",
      "ok",
      "isSuccess",
      "resultSuccess",
      "bizSuccess",
      "passed"
    ]);
    if (raw === undefined || raw === null || raw === "") {
      return null;
    }
    return this.toBooleanLike(raw);
  }

  isLikelySuccessCode(code) {
    const text = String(code || "")
      .trim()
      .toLowerCase();
    if (!text) {
      return false;
    }
    if (text === "0" || text === "200" || text === "ok" || text === "success" || text === "true") {
      return true;
    }
    if (/^2\d\d$/.test(text)) {
      return true;
    }
    return false;
  }

  async parseCheckinApiResponse(response) {
    const request = response.request();
    const url = response.url();
    const method = request ? request.method() : "";
    if (!this.isCheckinSubmitRequest(url, method)) {
      return null;
    }

    const status = Number(response.status());
    const event = {
      at: Date.now(),
      url,
      method: method || "",
      status,
      ok: response.ok(),
      code: null,
      message: "",
      bodyText: "",
      verdict: "pending",
      reason: ""
    };

    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch (_error) {
      bodyText = "";
    }
    event.bodyText = truncateText(bodyText, 1600);

    let payload = null;
    if (bodyText) {
      try {
        payload = JSON.parse(bodyText);
      } catch (_error) {
        payload = null;
      }
    }

    event.code = this.extractApiCode(payload);
    event.message = truncateText(this.extractApiMessage(payload), 300);
    const successFlag = this.extractApiSuccessFlag(payload);
    const mergedText = `${event.message} ${event.bodyText}`.trim();

    if (status >= 500) {
      event.verdict = "failed";
      event.reason = `服务端错误(${status})`;
      return event;
    }

    if (successFlag === true) {
      event.verdict = "success";
      event.reason = event.message || "提交接口返回 success=true";
      return event;
    }
    if (successFlag === false) {
      event.verdict = "failed";
      event.reason = this.extractFailureReason(mergedText) || event.message || "提交接口返回 success=false";
      return event;
    }

    if (event.code !== null) {
      if (this.isLikelySuccessCode(event.code)) {
        event.verdict = "success";
        event.reason = event.message || `提交接口返回 code=${event.code}`;
        return event;
      }
      event.verdict = "failed";
      event.reason =
        this.extractFailureReason(mergedText) ||
        event.message ||
        `提交接口返回 code=${event.code}`;
      return event;
    }

    if (!event.ok || status >= 400) {
      event.verdict = "failed";
      event.reason =
        this.extractFailureReason(mergedText) ||
        event.message ||
        `提交接口返回 HTTP ${status}`;
      return event;
    }

    if (/(签到成功|打卡成功|提交成功|已签到|已打卡|success)/i.test(mergedText)) {
      event.verdict = "success";
      event.reason = event.message || "提交接口命中成功关键字";
      return event;
    }

    if (/(失败|错误|异常|不在|未到|超出|请先登录|登录失效|forbidden|denied|invalid)/i.test(mergedText)) {
      event.verdict = "failed";
      event.reason = this.extractFailureReason(mergedText) || event.message || "提交接口命中失败关键字";
      return event;
    }

    return event;
  }

  createCheckinApiCapture(page) {
    const capture = {
      events: [],
      pendingTasks: [],
      dispose: null
    };
    const handler = (response) => {
      const request = response.request();
      const method = request ? request.method() : "";
      if (!this.isCheckinSubmitRequest(response.url(), method)) {
        return;
      }
      const task = this.parseCheckinApiResponse(response)
        .then((event) => {
          if (event) {
            capture.events.push(event);
          }
        })
        .catch(() => {
          // ignore capture parsing errors
        });
      capture.pendingTasks.push(task);
    };
    page.on("response", handler);
    capture.dispose = () => {
      page.off("response", handler);
    };
    return capture;
  }

  async flushCheckinApiCapture(capture) {
    if (!capture || !Array.isArray(capture.pendingTasks) || capture.pendingTasks.length <= 0) {
      return;
    }
    const tasks = capture.pendingTasks.splice(0, capture.pendingTasks.length);
    await Promise.allSettled(tasks);
  }

  resolveCheckinApiVerdict(capture) {
    if (!capture || !Array.isArray(capture.events) || capture.events.length <= 0) {
      return {
        state: "pending",
        message: "no submit api response",
        event: null
      };
    }
    const terminalEvents = capture.events
      .filter((event) => event.verdict === "success" || event.verdict === "failed")
      .sort((a, b) => a.at - b.at);
    if (terminalEvents.length <= 0) {
      return {
        state: "pending",
        message: "submit api response pending",
        event: null
      };
    }
    const last = terminalEvents[terminalEvents.length - 1];
    return {
      state: last.verdict,
      message: String(last.reason || last.message || "").trim(),
      event: last
    };
  }

  async waitForCheckinApiVerdict(capture, timeoutMs = 3500) {
    const safeTimeout = Number.isFinite(timeoutMs) ? Math.max(timeoutMs, 600) : 3500;
    const deadline = Date.now() + safeTimeout;
    while (Date.now() < deadline) {
      await this.flushCheckinApiCapture(capture);
      const verdict = this.resolveCheckinApiVerdict(capture);
      if (verdict.state === "success" || verdict.state === "failed") {
        return verdict;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
    }
    await this.flushCheckinApiCapture(capture);
    return this.resolveCheckinApiVerdict(capture);
  }

  buildFailedCheckinResult(user, postCheck, apiVerdict) {
    const bodyText = String((postCheck && postCheck.bodyText) || "").trim();
    const apiMessage =
      apiVerdict && apiVerdict.state === "failed" ? String(apiVerdict.message || "").trim() : "";
    const mergedReasonText = `${apiMessage} ${bodyText}`.trim();
    const normalizedReason =
      this.extractFailureReason(mergedReasonText) ||
      apiMessage ||
      this.inferLikelyTimeReason(user);

    if (normalizedReason) {
      return {
        status: "failed",
        message: `点击后未确认成功，疑似原因: ${normalizedReason}`,
        preview: truncateText(bodyText, 300)
      };
    }
    return {
      status: "failed",
      message: "点击后未确认成功",
      preview: truncateText(bodyText, 300)
    };
  }

  async performCheckin(page, user, options = {}) {
    const debugMode = Boolean(options.debugMode);
    const signedMarkerText = user.signed_marker_text || this.config.defaultSignedMarkerText;
    const checkinButtonText = user.checkin_button_text || this.config.defaultCheckinButtonText;
    const locationRefreshText =
      user.location_refresh_text || this.config.defaultLocationRefreshText;

    if (!debugMode) {
      const preCheck = await this.detectCheckinSuccess(page, signedMarkerText, checkinButtonText, {
        allowButtonStateFallback: false
      });
      if (preCheck.success) {
        return {
          status: "failed",
          message: `already signed in page (${preCheck.reason}), skip submit`
        };
      }
    }

    if (user.radio_option_text) {
      const radioOption = page.getByText(user.radio_option_text, { exact: false }).first();
      if ((await radioOption.count()) > 0) {
        await radioOption.click({ timeout: 5000 });
      }
    }

    if (locationRefreshText) {
      const refreshBtn = page.getByText(locationRefreshText, { exact: false }).first();
      if ((await refreshBtn.count()) > 0) {
        await refreshBtn.click({ timeout: 8000 });
        await page.waitForTimeout(randomBetween(800, 1600));
      }
    }

    if (debugMode) {
      const bodyText = await page.locator("body").innerText();
      return {
        status: "failed",
        message: "debug mode enabled: location checked, sign click skipped",
        preview: bodyText.slice(0, 300)
      };
    }

    const checkinButton = page.getByText(checkinButtonText, { exact: false }).first();
    if ((await checkinButton.count()) <= 0) {
      throw new Error(`未找到签到按钮: ${checkinButtonText}`);
    }
    const capture = this.createCheckinApiCapture(page);
    const apiWaitMs = Math.min(
      4200,
      Math.max(1800, Math.floor(Number(this.config.checkinActionTimeoutMs || 60000) * 0.08))
    );

    let postCheck = {
      success: false,
      reason: "not checked yet",
      bodyText: ""
    };

    try {
      await checkinButton.click({ timeout: this.config.checkinActionTimeoutMs });
      const firstApiVerdict = await this.waitForCheckinApiVerdict(capture, apiWaitMs);
      if (firstApiVerdict.state === "success") {
        return {
          status: "success",
          message: `checkin success confirmed (submit api: ${firstApiVerdict.message || "ok"})`
        };
      }
      if (firstApiVerdict.state === "failed") {
        return this.buildFailedCheckinResult(user, postCheck, firstApiVerdict);
      }

      postCheck = await this.detectCheckinSuccess(page, signedMarkerText, checkinButtonText, {
        allowButtonStateFallback: true
      });
      if (postCheck.success) {
        return {
          status: "success",
          message: `checkin success confirmed (${postCheck.reason})`
        };
      }

      // 有些场景首次点击会被遮罩/动画吞掉，二次点击再判定一次。
      try {
        await checkinButton.click({
          timeout: this.config.checkinActionTimeoutMs,
          force: true
        });
        const retryApiVerdict = await this.waitForCheckinApiVerdict(capture, Math.max(1600, apiWaitMs - 500));
        if (retryApiVerdict.state === "success") {
          return {
            status: "success",
            message: `checkin success confirmed after retry (submit api: ${retryApiVerdict.message || "ok"})`
          };
        }
        if (retryApiVerdict.state === "failed") {
          return this.buildFailedCheckinResult(user, postCheck, retryApiVerdict);
        }

        await page.waitForTimeout(randomBetween(700, 1400));
        postCheck = await this.detectCheckinSuccess(page, signedMarkerText, checkinButtonText, {
          allowButtonStateFallback: true
        });
        if (postCheck.success) {
          return {
            status: "success",
            message: `checkin success confirmed after retry (${postCheck.reason})`
          };
        }
      } catch (_retryError) {
        // ignore retry errors and fall through to failed result
      }

      await this.flushCheckinApiCapture(capture);
      const finalApiVerdict = this.resolveCheckinApiVerdict(capture);
      if (finalApiVerdict.state === "success") {
        return {
          status: "success",
          message: `checkin success confirmed (submit api final: ${finalApiVerdict.message || "ok"})`
        };
      }
      return this.buildFailedCheckinResult(user, postCheck, finalApiVerdict);
    } finally {
      if (capture && typeof capture.dispose === "function") {
        capture.dispose();
      }
    }
  }
}

module.exports = {
  CheckinWorker
};
