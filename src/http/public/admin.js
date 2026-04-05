(function initAdminPage() {
  const $ = (id) => document.getElementById(id);
  const appUsersTableBody = document.querySelector("#appUsersTable tbody");
  const checkinUsersTableBody = document.querySelector("#checkinUsersTable tbody");
  const groupsTableBody = document.querySelector("#groupsTable tbody");
  const menuItems = Array.from(document.querySelectorAll(".menu-item[data-menu-target]"));
  const menuGroupToggles = Array.from(
    document.querySelectorAll(".menu-group-toggle[data-menu-group]")
  );
  const sectionPanels = Array.from(document.querySelectorAll(".section-panel"));
  const sidebar = $("adminSidebar");
  const sidebarBackdrop = $("adminSidebarBackdrop");
  const btnMenuToggle = $("btnMenuToggle");
  const btnRefreshCookieStatusAll = $("btnRefreshCookieStatusAll");
  const globalMsg = $("globalMsg");
  const logModal = $("logModal");
  const btnLogModalClose = $("btnLogModalClose");
  const btnLogClear = $("btnLogClear");
  const btnLogRefresh = $("btnLogRefresh");
  const logModalHint = $("logModalHint");
  const logTableBody = document.querySelector("#logTable tbody");
  const logDetailModal = $("logDetailModal");
  const btnLogDetailClose = $("btnLogDetailClose");
  const btnLogDetailCopy = $("btnLogDetailCopy");
  const logDetailHint = $("logDetailHint");
  const logDetailContent = $("logDetailContent");
  const checkinEditModal = $("checkinEditModal");
  const btnCheckinEditClose = $("btnCheckinEditClose");
  const checkinEditHint = $("checkinEditHint");
  const appUserEditModal = $("appUserEditModal");
  const btnAppUserEditClose = $("btnAppUserEditClose");
  const btnAppUserEditSave = $("btnAppUserEditSave");
  const appUserEditHint = $("appUserEditHint");
  const appEditStatus = $("appEditStatus");
  const appEditPassword = $("appEditPassword");
  const appEditGroupAction = $("appEditGroupAction");
  const appEditGroupId = $("appEditGroupId");
  const appEditChannelProvider = $("appEditChannelProvider");
  const appEditChannelName = $("appEditChannelName");
  const appEditChannelBarkKey = $("appEditChannelBarkKey");
  const appEditChannelServerUrl = $("appEditChannelServerUrl");
  const appEditChannelEnabled = $("appEditChannelEnabled");
  const btnAppUserChannelCreate = $("btnAppUserChannelCreate");
  const appEditChannelList = $("appEditChannelList");
  const adminOwnNotifyCreateForm = $("adminOwnNotifyCreateForm");
  const btnAdminOwnNotifyCreate = $("btnAdminOwnNotifyCreate");
  const adminOwnNotifyOwnerId = $("adminOwnNotifyOwnerId");
  const adminOwnNotifyTableBody = document.querySelector("#adminOwnNotifyTable tbody");
  const btnCheckinSaveAll = $("btnCheckinSaveAll");
  const btnCheckinCheckCookie = $("btnCheckinCheckCookie");
  const btnCheckinViewCookie = $("btnCheckinViewCookie");
  const btnCheckinBindUser = $("btnCheckinBindUser");
  const editCookieSummary = $("editCookieSummary");
  const editMappingList = $("editMappingList");
  const editNotifyChannelId = $("editNotifyChannelId");
  const editNotifyChannelHint = $("editNotifyChannelHint");
  const editTargetUrl = $("editTargetUrl");
  const editAddressSource = $("editAddressSource");
  const editFingerprintDetails = $("editFingerprintDetails");
  const btnSaveRegistrationSettings = $("btnSaveRegistrationSettings");
  const inviteCodesTableBody = document.querySelector("#inviteCodesTable tbody");
  const faqAccordions = Array.from(document.querySelectorAll("#panel-faq details.faq-accordion"));
  const regEnabled = $("regEnabled");
  const regRequireInvite = $("regRequireInvite");
  const regDefaultGroupId = $("regDefaultGroupId");
  const regDefaultGroupHint = $("regDefaultGroupHint");
  const groupMaxMode = $("groupMaxMode");
  const groupMaxCheckinInput = $("groupMaxCheckin");
  const btnAdminOwnNotifyBarkCopy = $("btnAdminOwnNotifyBarkCopy");
  const adminOwnNotifyProvider = $("adminOwnNotifyProvider");
  const adminOwnNotifyKeyLabel = $("adminOwnNotifyKeyLabel");
  const adminOwnNotifyServerLabel = $("adminOwnNotifyServerLabel");
  const btnFaqDocs = $("btnFaqDocs");
  const btnSystemSettings = $("btnSystemSettings");
  const btnToggleAppPassword = $("btnToggleAppPassword");
  const btnToggleAppPasswordConfirm = $("btnToggleAppPasswordConfirm");
  const btnLogCopyLatest = $("btnLogCopyLatest");
  const btnOpenCheckinEditGuide = $("btnOpenCheckinEditGuide");
  const btnToggleCreateUserCard = $("btnToggleCreateUserCard");
  const overviewTotalUsers = $("overviewTotalUsers");
  const overviewTotalUsersHint = $("overviewTotalUsersHint");
  const overviewTotalCheckinAccounts = $("overviewTotalCheckinAccounts");
  const overviewTotalScheduledTasks = $("overviewTotalScheduledTasks");
  const overviewTotalNotificationChannels = $("overviewTotalNotificationChannels");
  const overviewCheckinSuccessCount = $("overviewCheckinSuccessCount");
  const overviewCheckinFailedCount = $("overviewCheckinFailedCount");
  const overviewGeneratedAt = $("overviewGeneratedAt");

  let appUsers = [];
  let adminOwnChannels = [];
  let groups = [];
  let checkinUsers = [];
  let inviteCodes = [];
  let adminOverview = null;
  let registrationSettings = {
    registrationEnabled: false,
    requireInvite: false,
    defaultGroupId: null,
    defaultGroupName: null
  };
  let debugModeEnabled = false;
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
  let logTargetCheckinUserId = null;
  let logTargetCheckinUserLabel = "";
  let logDetailTargetLogId = null;
  let latestLogRows = [];
  let checkinEditTargetUserId = null;
  let appUserEditTargetId = null;
  let currentPanelId = "panel-overview";
  let appUserChannelsByUserId = {};
  let messageHideTimer = null;
  let groupEditingById = {};
  let adminNotifyEditingById = {};
  let registrationAutoSaveTimer = null;
  let registrationSettingsSaving = false;
  let registrationSettingsSavePending = false;
  const QR_WS_RECONNECT_MAX = 10;
  const QR_WS_RECONNECT_BASE_MS = 700;
  const COOKIE_STATUS_CACHE_KEY = "dailyflow.admin.cookieStatus.v1";
  const CHECKIN_STATUS_CACHE_KEY = "dailyflow.admin.checkinStatus.v1";
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

  function pruneAppUserChannels(rows) {
    const valid = new Set((rows || []).map((row) => String(row.id)));
    for (const key of Object.keys(appUserChannelsByUserId)) {
      if (!valid.has(key)) {
        delete appUserChannelsByUserId[key];
      }
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
    const key = String(userId || "");
    const state = cookieStatusByUserId[key];
    if (!state) {
      return '<span class="pill warn">未检查</span>';
    }
    const statusLabel = window.DailyFlowWeb.escapeHtml(cookieStatusLabel(state.status));
    return (
      '<span class="pill ' +
      cookieStatusPillClass(state.status) +
      '">' +
      statusLabel +
      "</span>"
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
    const key = String(userId || "");
    const state = checkinStatusByUserId[key];
    if (!state) {
      return '<span class="pill warn">未检查</span>';
    }
    const label = window.DailyFlowWeb.escapeHtml(checkinStatusLabel(state.status));
    return (
      '<span class="pill ' +
      checkinStatusPillClass(state.status) +
      '">' +
      label +
      "</span>"
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

  function formatExecutionStatusHtml(statusObj) {
    const obj = statusObj && typeof statusObj === "object" ? statusObj : null;
    if (!obj) {
      return '<span class="pill warn">未执行</span>';
    }
    const status = String(obj.status || "unknown");
    const label = executionStatusLabel(status);
    return (
      '<span class="pill ' +
      executionStatusPillClass(status) +
      '">' +
      window.DailyFlowWeb.escapeHtml(label) +
      "</span>"
    );
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
    currentPanelId = String(panelId || currentPanelId || "panel-users");
    sectionPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === panelId);
    });
    menuItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.menuTarget === panelId);
    });
    const activeItem = menuItems.find((item) => item.dataset.menuTarget === panelId);
    if (activeItem) {
      const subList = activeItem.closest("[data-menu-sub-list]");
      if (subList && subList.dataset.menuSubList) {
        setMenuGroupOpen(subList.dataset.menuSubList, true);
      }
    }
    if (isCompactLayout()) {
      setSidebarOpen(false);
    }
    syncRefreshButtonMeta();
  }

  function setMenuGroupOpen(groupKey, open) {
    const key = String(groupKey || "");
    if (!key) {
      return;
    }
    const subList = document.querySelector(`[data-menu-sub-list="${key}"]`);
    const toggle = document.querySelector(`.menu-group-toggle[data-menu-group="${key}"]`);
    if (subList) {
      subList.classList.toggle("open", Boolean(open));
    }
    if (toggle) {
      toggle.classList.toggle("expanded", Boolean(open));
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  function computeMessageAutoHideMs(text, isError) {
    const len = String(text || "").length;
    const base = isError ? 3200 : 2200;
    return Math.max(base, Math.min(12000, base + len * 22));
  }

  function showMessage(text, isError, options) {
    const opts = options || {};
    globalMsg.textContent = text || "";
    globalMsg.classList.remove("hidden", "ok", "error");
    globalMsg.classList.add(isError ? "error" : "ok");
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
      clearMessage();
    }, durationMs);
  }

  function clearMessage() {
    if (messageHideTimer) {
      clearTimeout(messageHideTimer);
      messageHideTimer = null;
    }
    globalMsg.classList.add("hidden");
    globalMsg.textContent = "";
    globalMsg.classList.remove("ok", "error");
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
    showMessage("操作进行中，请稍候…", true);
  }

  function notifyActionTooFast() {
    showMessage("点击过快，请稍后再试", true);
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

  function applyDebugModeUi() {
    const toggle = $("debugModeToggle");
    const label = $("debugModeLabel");
    if (toggle) {
      toggle.checked = Boolean(debugModeEnabled);
      toggle.setAttribute("aria-checked", debugModeEnabled ? "true" : "false");
    }
    if (label) {
      label.textContent = debugModeEnabled ? "调试模式：开启" : "调试模式：关闭";
    }
  }

  function appUserStatusLabel(status) {
    return String(status || "").trim() === "active" ? "启用" : "禁用";
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

  function applyAdminOwnNotifyCreateProviderUi() {
    const provider = normalizeNotifyProvider(
      adminOwnNotifyProvider && adminOwnNotifyProvider.value
        ? adminOwnNotifyProvider.value
        : "bark"
    );
    if (adminOwnNotifyKeyLabel) {
      adminOwnNotifyKeyLabel.textContent = notifyKeyLabel(provider) + " / 一键复制链接";
    }
    if (adminOwnNotifyServerLabel) {
      adminOwnNotifyServerLabel.textContent = notifyServerLabel(provider) + "（可空）";
    }
    const keyInput = $("adminOwnNotifyBarkKey");
    if (keyInput) {
      keyInput.placeholder = notifyKeyPlaceholder(provider);
    }
    const serverInput = $("adminOwnNotifyServerUrl");
    if (serverInput) {
      serverInput.placeholder = notifyServerPlaceholder(provider);
      syncNotifyServerInputForProvider(provider, serverInput);
    }
  }

  function applyAppEditNotifyCreateProviderUi() {
    const provider = normalizeNotifyProvider(
      appEditChannelProvider && appEditChannelProvider.value ? appEditChannelProvider.value : "bark"
    );
    if (appEditChannelBarkKey) {
      appEditChannelBarkKey.placeholder =
        notifyKeyPlaceholder(provider) + "（留空不修改）";
    }
    if (appEditChannelServerUrl) {
      appEditChannelServerUrl.placeholder = notifyServerPlaceholder(provider);
      syncNotifyServerInputForProvider(provider, appEditChannelServerUrl);
    }
  }

  function applyGroupMaxModeUi() {
    if (!groupMaxMode || !groupMaxCheckinInput) {
      return;
    }
    const limited = String(groupMaxMode.value || "unlimited") === "limited";
    groupMaxCheckinInput.disabled = !limited;
    if (!limited) {
      groupMaxCheckinInput.value = "";
    }
  }

  function maskSensitiveValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    if (text.length <= 6) {
      return text[0] + "***" + text[text.length - 1];
    }
    return text.slice(0, 3) + "****" + text.slice(-3);
  }

  function getSensitiveInputRawValue(input) {
    if (!input) {
      return "";
    }
    if (input.dataset && input.dataset.masked === "1") {
      return String(input.dataset.rawValue || "").trim();
    }
    return String(input.value || "").trim();
  }

  function setupSensitiveInputMask(input) {
    if (!input) {
      return;
    }
    input.addEventListener("focus", () => {
      if (input.dataset.masked === "1") {
        input.value = String(input.dataset.rawValue || "");
        input.dataset.masked = "0";
      }
    });
    input.addEventListener("blur", () => {
      const raw = String(input.value || "").trim();
      if (!raw) {
        input.dataset.rawValue = "";
        input.dataset.masked = "0";
        return;
      }
      input.dataset.rawValue = raw;
      input.value = maskSensitiveValue(raw);
      input.dataset.masked = "1";
    });
    input.addEventListener("input", () => {
      input.dataset.rawValue = String(input.value || "");
      input.dataset.masked = "0";
    });
  }

  function getPanelRefreshMeta(panelId) {
    const map = {
      "panel-overview": {
        title: "刷新全局总览",
        message: "全局总览已刷新"
      },
      "panel-users": {
        title: "刷新用户列表",
        message: "用户与注册配置已刷新"
      },
      "panel-groups": {
        title: "刷新用户组列表",
        message: "用户组列表已刷新"
      },
      "panel-checkin": {
        title: "刷新签到账号状态",
        message: "签到账号状态已刷新"
      },
      "panel-admin-notify": {
        title: "刷新推送通道列表",
        message: "推送通道列表已刷新"
      },
      "panel-qr": {
        title: "刷新二维码状态",
        message: "二维码状态已刷新"
      },
      "panel-faq": {
        title: "重置常见问题展开状态",
        message: "常见问题已重置为默认展开状态"
      }
    };
    return map[String(panelId || "")] || {
      title: "刷新当前面板",
      message: "当前面板已刷新"
    };
  }

  function syncRefreshButtonMeta() {
    const button = $("btnRefresh");
    if (!button) {
      return;
    }
    const meta = getPanelRefreshMeta(currentPanelId);
    button.title = meta.title;
    button.setAttribute("aria-label", meta.title);
  }

  function resetFaqAccordions() {
    if (!Array.isArray(faqAccordions) || faqAccordions.length <= 0) {
      return;
    }
    faqAccordions.forEach((el, index) => {
      el.open = index === 0;
    });
  }

  function setupPasswordToggle(buttonId, inputId) {
    const button = $(buttonId);
    const input = $(inputId);
    if (!button || !input) {
      return;
    }
    button.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      button.innerHTML = hidden
        ? '<i class="ph ph-eye-slash text-base"></i>'
        : '<i class="ph ph-eye text-base"></i>';
      button.setAttribute("aria-label", hidden ? "隐藏密码" : "显示密码");
      button.title = hidden ? "隐藏密码" : "显示密码";
    });
  }

  function logout() {
    closeCheckinEditModal();
    stopQrWs();
    stopQrPoll();
    window.DailyFlowWeb.clearToken();
    location.replace("/web/login");
  }

  function subscriptionText(user) {
    if (!user.expiresAt) {
      return "不设有效期";
    }
    return "到期: " + window.DailyFlowWeb.asDateInputValue(user.expiresAt);
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

  function formatCookieExpiresLabel(expires) {
    const n = Number(expires);
    if (!Number.isFinite(n) || n <= 0) {
      return "session";
    }
    return new Date(n * 1000).toISOString();
  }

  function asDatetimeLocalInputValue(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
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

  function showCookieInspectDialog(checkinUser) {
    const text = buildCookieInspectText(checkinUser);
    showMessage(text, false);
  }

  function closeLogModal() {
    closeLogDetailModal();
    logTargetCheckinUserId = null;
    logTargetCheckinUserLabel = "";
    latestLogRows = [];
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

  function closeLogDetailModal() {
    logDetailTargetLogId = null;
    if (logDetailHint) {
      logDetailHint.textContent = "-";
    }
    if (logDetailContent) {
      logDetailContent.textContent = "";
    }
    if (logDetailModal) {
      logDetailModal.classList.add("hidden");
    }
  }

  function openLogDetailModal(logId, label) {
    logDetailTargetLogId = Number(logId) || null;
    if (logDetailHint) {
      logDetailHint.textContent = label || "-";
    }
    if (logDetailModal) {
      logDetailModal.classList.remove("hidden");
    }
  }

  function formatLogDetailContent(rawResult) {
    if (rawResult === null || rawResult === undefined) {
      return "当前日志无调试详情。请开启该签到账号的 Debug 模式后再执行签到。";
    }
    if (typeof rawResult === "string") {
      return rawResult;
    }
    try {
      return JSON.stringify(rawResult, null, 2);
    } catch (_error) {
      return String(rawResult);
    }
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value.trim()) {
      throw new Error("日志详情为空");
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
    latestLogRows = rows.slice(0, 15);
    if (!rows.length) {
      logTableBody.innerHTML = '<tr><td colspan="6" class="muted">暂无日志记录</td></tr>';
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
        const hasRaw = Boolean(log.hasRawResult);
        const detailBtn = hasRaw
          ? '<button class="btn-log-detail" data-action="view-log-detail" data-log-id="' +
            String(log.id || "") +
            '">详情</button>'
          : '<span class="muted">无</span>';
        return (
          "<tr>" +
          "<td>" + String(log.id || "-") + "</td>" +
          "<td>" + window.DailyFlowWeb.escapeHtml(runAt) + "</td>" +
          "<td><span class='pill " + statusClass + "'>" + window.DailyFlowWeb.escapeHtml(statusText) + "</span></td>" +
          "<td>" + window.DailyFlowWeb.escapeHtml(durationText) + "</td>" +
          "<td>" + msg + "</td>" +
          "<td>" + detailBtn + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function buildLatestLogsCopyText() {
    if (!Array.isArray(latestLogRows) || latestLogRows.length <= 0) {
      return "";
    }
    const lines = [];
    lines.push("账号: " + (logTargetCheckinUserLabel || "-"));
    lines.push("最近日志条数: " + String(latestLogRows.length));
    lines.push("");
    latestLogRows.forEach((log) => {
      const runAt = formatBeijingDateTime(log.runAt || log.createdAt || "-");
      const statusRaw = String(log.status || "-");
      const statusText = statusRaw === "-" ? "-" : statusLabelZh(statusRaw);
      const durationText = Number.isFinite(Number(log.durationMs))
        ? String(Number(log.durationMs))
        : "-";
      lines.push(
        `#${String(log.id || "-")} | ${runAt} | ${statusText} | ${durationText}ms | ${String(
          log.message || "-"
        )}`
      );
    });
    return lines.join("\n");
  }

  async function loadCheckinLogs(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/admin/checkin-users/" + checkinUserId + "/logs"
    );
    renderLogRows(payload && payload.logs ? payload.logs : []);
  }

  async function clearCheckinLogs(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/admin/checkin-users/" + checkinUserId + "/logs",
      {
        method: "DELETE"
      }
    );
    return Number(payload && payload.deleted ? payload.deleted : 0);
  }

  async function loadCheckinLogDetail(checkinUserId, logId) {
    const payload = await window.DailyFlowWeb.api(
      "/admin/checkin-users/" +
        checkinUserId +
        "/logs/" +
        logId
    );
    if (!payload || !payload.log) {
      throw new Error("日志详情为空");
    }
    return payload.log;
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
      return String(cronExpr || "-");
    }
    const minute = Number(parts[1]);
    const hour = Number(parts[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return String(cronExpr || "-");
    }
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function findCheckinUserById(id) {
    const nextId = Number(id);
    if (!Number.isFinite(nextId) || nextId <= 0) {
      return null;
    }
    return checkinUsers.find((row) => Number(row.id) === nextId) || null;
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

  function normalizeCoordSystemInput(value) {
    const next = String(value || "auto")
      .trim()
      .toLowerCase();
    if (!/^(auto|wgs84|gcj02|bd09)$/.test(next)) {
      throw new Error("coordSystem 仅支持 auto/wgs84/gcj02/bd09");
    }
    return next;
  }

  function getSimulationCenterFromProfile(profile) {
    const centerLng = Number(profile && profile.longitude);
    const centerLat = Number(profile && profile.latitude);
    if (Number.isFinite(centerLng) && Number.isFinite(centerLat)) {
      return { lat: centerLat, lng: centerLng };
    }
    return { lat: 39.908823, lng: 116.39747 };
  }

  function getOptionalSimulationDefaults(profile) {
    const p = profile || {};
    const center = getSimulationCenterFromProfile(p);
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

  function renderCheckinEditCookieSummary(checkinUser) {
    if (!editCookieSummary) {
      return;
    }
    const user = checkinUser || {};
    const state = cookieStatusByUserId[String(user.id || "")] || null;
    const authPill =
      '<span class="pill ' +
      (user.hasAuthState ? "ok" : "warn") +
      '">' +
      (user.hasAuthState ? "已登录态" : "无登录态") +
      "</span>";
    const statusPill = state
      ? '<span class="pill ' +
        cookieStatusPillClass(state.status) +
        '">' +
        window.DailyFlowWeb.escapeHtml(cookieStatusLabel(state.status)) +
        "</span>"
      : '<span class="pill warn">未检查</span>';
    const checkedAt = state && state.checkedAt
      ? window.DailyFlowWeb.escapeHtml(String(state.checkedAt))
      : "-";
    const message = state && state.message
      ? window.DailyFlowWeb.escapeHtml(String(state.message))
      : "-";
    editCookieSummary.innerHTML =
      authPill +
      '<div class="muted">Cookie 数量: ' +
      String(Number(user.authCookieCount || 0)) +
      "</div>" +
      '<div style="margin-top:4px;">' +
      statusPill +
      "</div>" +
      '<div class="muted">检查时间: ' +
      checkedAt +
      "</div>" +
      '<div class="muted">结果: ' +
      message +
      "</div>";
  }

  function renderCheckinEditMappings(checkinUser) {
    if (!editMappingList) {
      return;
    }
    const user = checkinUser || {};
    const mappings = Array.isArray(user.mappings) ? user.mappings : [];
    if (!mappings.length) {
      editMappingList.innerHTML = '<span class="muted">当前无绑定</span>';
      return;
    }
    editMappingList.innerHTML = mappings
      .map((m) => {
        const mapId = Number(m.appUserId || 0);
        return (
          '<span class="pill" style="display:inline-flex;align-items:center;gap:4px;">#' +
          mapId +
          " " +
          window.DailyFlowWeb.escapeHtml(String(m.username || "-")) +
          ' <button data-action="modal-unbind" data-app-user-id="' +
          mapId +
          '" class="btn-table btn-table-muted" style="min-height:22px;padding:1px 6px;font-size:11px;border-radius:4px;">移除</button></span>'
        );
      })
      .join(" ");
  }

  function fillCheckinEditModal(checkinUser) {
    const user = checkinUser || {};
    const profile = user.locationProfile || {};
    const defaults = getOptionalSimulationDefaults(profile);
    checkinEditTargetUserId = Number(user.id) || null;
    if (checkinEditHint) {
      checkinEditHint.textContent =
        "账号: " +
        String(user.userKey || "-") +
        " / " +
        String(user.displayName || "-") +
        (user.debugMode ? "（Debug模式已开启）" : "") +
        "；" +
        AUTO_CHECKIN_JITTER_HINT;
    }
    $("editDisplayName").value = String(user.displayName || "");
    if (editTargetUrl) {
      editTargetUrl.value = String(user.targetUrl || "");
    }
    const timeLabel = String(parseCronToTimeLabel(user.cronExpr || "") || "");
    $("editCheckinTime").value = /^\d{2}:\d{2}$/.test(timeLabel) ? timeLabel : "08:00";
    $("editWarningTime").value = String(user.warningTime || "23:00");
    $("editEnabled").checked = Boolean(user.enabled);
    $("editDebugMode").checked = Boolean(user.debugMode);

    $("editLat").value = Number(defaults.latitude).toFixed(7);
    $("editLng").value = Number(defaults.longitude).toFixed(7);
    $("editAccuracy").value = defaults.accuracy;
    try {
      $("editCoordSystem").value = defaults.coordSystem;
    } catch (_error) {
      $("editCoordSystem").value = "wgs84";
    }
    $("editAltitude").value = profile.altitude ?? "";
    $("editAltitudeAccuracy").value = profile.altitudeAccuracy ?? "";
    $("editHeading").value = profile.heading ?? "";
    $("editSpeed").value = profile.speed ?? "";
    $("editSubmitAddressText").value = profile.submitAddressText || "";
    if (editAddressSource) {
      const source = String(profile.submitAddressSource || "").trim();
      const updatedAt = String(profile.submitAddressUpdatedAt || "").trim();
      editAddressSource.textContent =
        !source && !updatedAt
          ? "未填写地址"
          : `来源: ${source || "-"}${updatedAt ? ` | ${updatedAt}` : ""}`;
    }
    if (editFingerprintDetails) {
      editFingerprintDetails.open = false;
    }
    $("editBindAppUserId").value = "";
    renderCheckinEditCookieSummary(user);
    renderCheckinEditMappings(user);
    renderCheckinEditNotifyChannelOptions(user);
  }

  function openCheckinEditModal(checkinUser) {
    if (!checkinEditModal) {
      return;
    }
    fillCheckinEditModal(checkinUser);
    checkinEditModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
  }

  function openCheckinTimeSettings(checkinUser) {
    openCheckinEditModal(checkinUser);
    if ($("editCheckinTime")) {
      $("editCheckinTime").focus();
    }
  }

  function closeCheckinEditModal() {
    if (!checkinEditModal) {
      return;
    }
    checkinEditTargetUserId = null;
    if (editFingerprintDetails) {
      editFingerprintDetails.open = false;
    }
    checkinEditModal.classList.add("hidden");
    document.body.classList.toggle("sidebar-open", Boolean(sidebar && sidebar.classList.contains("open")));
  }

  function syncCheckinEditModalByCurrentData() {
    if (!Number.isFinite(Number(checkinEditTargetUserId)) || Number(checkinEditTargetUserId) <= 0) {
      return;
    }
    const latest = findCheckinUserById(checkinEditTargetUserId);
    if (!latest) {
      closeCheckinEditModal();
      return;
    }
    fillCheckinEditModal(latest);
  }

  function buildCheckinEditBasicPayload() {
    return {
      displayName: $("editDisplayName").value.trim(),
      cronExpr: timeToCronExpr($("editCheckinTime").value),
      timezone: "Asia/Shanghai",
      warningTime: $("editWarningTime").value.trim() || "23:00",
      enabled: Boolean($("editEnabled").checked),
      debugMode: Boolean($("editDebugMode").checked),
      notificationChannelId:
        editNotifyChannelId && String(editNotifyChannelId.value || "").trim()
          ? Number(editNotifyChannelId.value)
          : null
    };
  }

  function buildCheckinEditLocationPayloadOrNull() {
    const targetUser = findCheckinUserById(checkinEditTargetUserId);
    const existingProfile =
      targetUser && targetUser.locationProfile ? targetUser.locationProfile : {};
    const defaults = getOptionalSimulationDefaults(existingProfile);
    const rawLatitude = String($("editLat").value ?? "").trim();
    const rawLongitude = String($("editLng").value ?? "").trim();
    let latitude = parseOptionalNumberInput(rawLatitude, "纬度");
    let longitude = parseOptionalNumberInput(rawLongitude, "经度");
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
    const accuracyInput = parseOptionalNumberInput($("editAccuracy").value, "位置精度", { min: 0 });
    const accuracy = accuracyInput === null ? defaults.accuracy : accuracyInput;
    const altitude = parseOptionalNumberInput($("editAltitude").value, "高度");
    const altitudeAccuracy = parseOptionalNumberInput($("editAltitudeAccuracy").value, "高度精度", {
      min: 0
    });
    const heading = parseOptionalNumberInput($("editHeading").value, "方向", { min: 0, max: 360 });
    const speed = parseOptionalNumberInput($("editSpeed").value, "速度", { min: 0 });
    const submitAddressText = String($("editSubmitAddressText").value || "").trim();
    if (!submitAddressText) {
      throw new Error("请手动填写提交地址文本");
    }
    return {
      latitude,
      longitude,
      coordSystem: normalizeCoordSystemInput(
        $("editCoordSystem").value || defaults.coordSystem
      ),
      accuracy,
      altitude,
      altitudeAccuracy,
      heading,
      speed,
      submitAddressText,
      submitAddressSource: "manual-input",
      submitAddressRawJson: null
    };
  }

  function ensureGroupEditDraft(group) {
    const id = Number(group && group.id ? group.id : 0);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    if (!groupEditingById[id]) {
      const max = group.maxCheckinAccounts;
      groupEditingById[id] = {
        name: String(group.name || ""),
        description: String(group.description || ""),
        maxMode: max === null || max === undefined ? "unlimited" : "limited",
        maxCheckin: max === null || max === undefined ? "" : String(max)
      };
    }
    return groupEditingById[id];
  }

  function renderGroups() {
    if (!groups.length) {
      groupsTableBody.innerHTML = '<tr><td colspan="5" class="muted">暂无用户组</td></tr>';
      return;
    }
    groupsTableBody.innerHTML = groups
      .map((g) => {
        const id = Number(g.id || 0);
        const draft = ensureGroupEditDraft(g);
        const isEditing = Boolean(draft && draft.editing);
        let maxText = '<span class="pill ok">不限制</span>';
        if (!(g.maxCheckinAccounts === null || g.maxCheckinAccounts === undefined)) {
          const maxValue = Number(g.maxCheckinAccounts);
          maxText = Number.isFinite(maxValue) && maxValue === 0
            ? '<span class="pill warn">限制：0（不可创建）</span>'
            : '<span class="pill warn">限制：' + window.DailyFlowWeb.escapeHtml(String(g.maxCheckinAccounts)) + "</span>";
        }
        if (!isEditing) {
          return (
            "<tr>" +
            "<td>" + id + "</td>" +
            "<td>" + window.DailyFlowWeb.escapeHtml(String(g.name || "-")) + "</td>" +
            "<td>" + (g.description ? window.DailyFlowWeb.escapeHtml(String(g.description)) : '<span class="muted">无</span>') + "</td>" +
            "<td>" + maxText + "</td>" +
            "<td><div class='checkin-action-group'>" +
            "<button data-action='edit-group' data-id='" + id + "' class='btn-table btn-table-default' title='编辑用户组' aria-label='编辑用户组'>编辑</button>" +
            "</div></td>" +
            "</tr>"
          );
        }
        return (
          "<tr>" +
          "<td>" + id + "</td>" +
          "<td><input id='group-name-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' value='" +
          window.DailyFlowWeb.escapeHtml(String(draft.name || "")) +
          "'></td>" +
          "<td><textarea id='group-desc-" + id + "' rows='2' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full resize-y min-h-[52px]'>" +
          window.DailyFlowWeb.escapeHtml(String(draft.description || "")) +
          "</textarea></td>" +
          "<td><div class='grid grid-cols-[110px_minmax(0,1fr)] gap-2'>" +
          "<select id='group-max-mode-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary'>" +
          "<option value='unlimited'" + (draft.maxMode === "unlimited" ? " selected" : "") + ">不限制</option>" +
          "<option value='limited'" + (draft.maxMode === "limited" ? " selected" : "") + ">限制数量</option>" +
          "</select>" +
          "<input id='group-max-" + id + "' type='number' min='0' placeholder='例如 5' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full'" +
          (draft.maxMode === "unlimited" ? " disabled" : "") +
          " value='" + window.DailyFlowWeb.escapeHtml(String(draft.maxCheckin || "")) + "'></div></td>" +
          "<td><div class='checkin-action-group'>" +
          "<button data-action='save-group' data-id='" + id + "' class='btn-table btn-table-primary'>保存</button>" +
          "<button data-action='cancel-group' data-id='" + id + "' class='btn-table btn-table-default'>取消</button>" +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderAppUsers() {
    if (!appUsers.length) {
      appUsersTableBody.innerHTML =
        '<tr><td colspan="6" class="px-6 py-10 text-center">' +
        '<div class="inline-flex flex-col items-center gap-3 text-slate-500">' +
        '<i class="ph ph-user-list text-4xl text-slate-300"></i>' +
        "<p>暂无用户</p>" +
        '<button data-action="jump-create-app-user" class="btn-table btn-table-primary">去创建用户</button>' +
        "</div></td></tr>";
      return;
    }
    appUsersTableBody.innerHTML = appUsers
      .map((u) => {
        const groupNames = (u.groups || [])
          .map((g) => '<span class="pill">#' + g.id + " " + window.DailyFlowWeb.escapeHtml(g.name) + "</span>")
          .join("");
        return (
          "<tr>" +
          "<td>" +
          u.id +
          "</td>" +
          "<td>" +
          window.DailyFlowWeb.escapeHtml(u.username) +
          "</td>" +
          "<td>" +
          '<span class="pill ' +
          (u.status === "active" ? "ok" : "warn") +
          '">' +
          window.DailyFlowWeb.escapeHtml(appUserStatusLabel(u.status)) +
          "</span>" +
          "</td>" +
          "<td>" +
          window.DailyFlowWeb.escapeHtml(subscriptionText(u)) +
          "</td>" +
          "<td>" +
          (groupNames || '<span class="muted">无</span>') +
          "</td>" +
          "<td>" +
          '<div class="checkin-action-group">' +
          '<button data-action="manage-notify-channel" data-id="' +
          u.id +
          '" class="btn-table btn-table-default">推送通道</button>' +
          '<button data-action="edit-app-user" data-id="' +
          u.id +
          '" class="btn-table btn-table-primary">编辑</button>' +
          "</div>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function buildAdminNotifyOwnerOptions(selectedValue) {
    const selected = String(selectedValue || "admin");
    const options = [
      '<option value="admin"' + (selected === "admin" ? " selected" : "") + ">admin（管理员）</option>",
      ...appUsers.map(
        (u) =>
          '<option value="' +
          Number(u.id) +
          '"' +
          (selected === String(Number(u.id)) ? " selected" : "") +
          ">" +
          window.DailyFlowWeb.escapeHtml(String(u.username || "-")) +
          " (#" +
          Number(u.id) +
          ")</option>"
      )
    ];
    return options.join("");
  }

  function renderAdminNotifyOwnerSelect(selectedValue = "admin") {
    if (!adminOwnNotifyOwnerId) {
      return;
    }
    adminOwnNotifyOwnerId.innerHTML = buildAdminNotifyOwnerOptions(selectedValue);
  }

  function formatChannelOwnerText(item) {
    if (!item || item.ownerType === "admin" || String(item.username || "") === "admin") {
      return "admin（管理员）";
    }
    const username = String(item.username || "-");
    const appUserId = Number(item.appUserId || 0);
    return appUserId > 0 ? `${username} (#${appUserId})` : username;
  }

  function renderAdminOwnChannels() {
    if (!adminOwnNotifyTableBody) {
      return;
    }
    renderAdminNotifyOwnerSelect(
      adminOwnNotifyOwnerId && adminOwnNotifyOwnerId.value
        ? String(adminOwnNotifyOwnerId.value)
        : "admin"
    );
    if (!Array.isArray(adminOwnChannels) || !adminOwnChannels.length) {
      adminOwnNotifyTableBody.innerHTML =
        '<tr><td colspan="8" class="muted">暂无推送通道</td></tr>';
      return;
    }
    adminOwnNotifyTableBody.innerHTML = adminOwnChannels
      .map((item) => {
        const id = Number(item && item.id ? item.id : 0);
        const editing = Boolean(adminNotifyEditingById[id]);
        const provider = normalizeNotifyProvider(item && item.provider);
        const providerLabel = notifyProviderLabel(provider);
        const keyLabel = notifyKeyLabel(provider);
        const masked = window.DailyFlowWeb.escapeHtml(getNotifyChannelSecretMasked(item));
        const serverUrl = getNotifyChannelServerUrl(item);
        if (!editing) {
          return (
            "<tr>" +
            "<td>" + id + "</td>" +
            "<td>" + window.DailyFlowWeb.escapeHtml(formatChannelOwnerText(item)) + "</td>" +
            "<td>" + window.DailyFlowWeb.escapeHtml(String(item.name || "-")) + "</td>" +
            "<td><span class='pill'>" + window.DailyFlowWeb.escapeHtml(providerLabel) + "</span></td>" +
            "<td><div class='inline-flex items-center gap-2'><code>" + masked + "</code><button data-action='copy-admin-own-notify-channel' data-id='" + id + "' class='btn-table btn-table-default' title='复制" + window.DailyFlowWeb.escapeHtml(keyLabel) + "' aria-label='复制" + window.DailyFlowWeb.escapeHtml(keyLabel) + "'><i class='ph ph-copy'></i></button></div></td>" +
            "<td>" + (serverUrl ? window.DailyFlowWeb.escapeHtml(serverUrl) : '<span class="muted">默认</span>') + "</td>" +
            "<td><span class='pill " + (item.enabled ? "ok" : "warn") + "'>" + (item.enabled ? "启用" : "禁用") + "</span></td>" +
            "<td><div class='checkin-action-group'>" +
            "<button data-action='test-admin-own-notify-channel' data-id='" + id + "' class='btn-table btn-table-default' title='向当前通道发送一条测试通知'>测试</button>" +
            "<button data-action='edit-admin-own-notify-channel' data-id='" + id + "' class='btn-table btn-table-primary'>编辑</button>" +
            "<button data-action='delete-admin-own-notify-channel' data-id='" + id + "' class='btn-table btn-table-danger' title='删除通道' aria-label='删除通道'><i class='ph ph-trash'></i></button>" +
            "</div></td>" +
            "</tr>"
          );
        }
        return (
          "<tr>" +
          "<td>" + id + "</td>" +
          "<td>" + window.DailyFlowWeb.escapeHtml(formatChannelOwnerText(item)) + "</td>" +
          "<td><input id='admin-own-notify-name-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' value='" +
          window.DailyFlowWeb.escapeHtml(String(item.name || "")) +
          "'></td>" +
          "<td><select id='admin-own-notify-provider-" + id + "' data-prev-provider='" +
          window.DailyFlowWeb.escapeHtml(provider) +
          "' class='df-select px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary'>" +
          "<option value='bark'" + (provider === "bark" ? " selected" : "") + ">Bark</option>" +
          "<option value='serverchan'" + (provider === "serverchan" ? " selected" : "") + ">Server酱</option>" +
          "</select></td>" +
          "<td><input id='admin-own-notify-key-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' placeholder='留空不修改，当前 " +
          masked +
          "'></td>" +
          "<td><input id='admin-own-notify-server-" +
          id +
          "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full' placeholder='" +
          window.DailyFlowWeb.escapeHtml(notifyServerPlaceholder(provider)) +
          "' value='" +
          window.DailyFlowWeb.escapeHtml(String(serverUrl || "")) +
          "'></td>" +
          "<td><select id='admin-own-notify-enabled-" + id + "' class='px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary'>" +
          "<option value='1'" + (item.enabled ? " selected" : "") + ">启用</option>" +
          "<option value='0'" + (!item.enabled ? " selected" : "") + ">禁用</option>" +
          "</select></td>" +
          "<td><div class='checkin-action-group'>" +
          "<button data-action='save-admin-own-notify-channel' data-id='" + id + "' class='btn-table btn-table-primary'>保存</button>" +
          "<button data-action='cancel-admin-own-notify-channel' data-id='" + id + "' class='btn-table btn-table-default'>取消</button>" +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderRegistrationSettings() {
    if (!regEnabled || !regRequireInvite || !regDefaultGroupId) {
      return;
    }
    regEnabled.checked = Boolean(registrationSettings.registrationEnabled);
    regRequireInvite.checked = Boolean(registrationSettings.requireInvite);
    const selected = registrationSettings.defaultGroupId
      ? String(registrationSettings.defaultGroupId)
      : "";
    const options = [
      '<option value="">默认 user 组</option>',
      ...groups.map(
        (g) =>
          '<option value="' +
          g.id +
          '"' +
          (String(g.id) === selected ? " selected" : "") +
          ">" +
          window.DailyFlowWeb.escapeHtml(String(g.name || "")) +
          " (#" +
          g.id +
          ")</option>"
      )
    ];
    regDefaultGroupId.innerHTML = options.join("");
    if (regDefaultGroupHint) {
      regDefaultGroupHint.textContent = registrationSettings.defaultGroupName
        ? "当前默认组: " + String(registrationSettings.defaultGroupName)
        : "未选择时自动回退到 user 组";
    }
  }

  function buildRegistrationSettingsPayload() {
    return {
      registrationEnabled: Boolean(regEnabled && regEnabled.checked),
      requireInvite: Boolean(regRequireInvite && regRequireInvite.checked),
      defaultGroupId:
        regDefaultGroupId && String(regDefaultGroupId.value || "").trim()
          ? Number(regDefaultGroupId.value)
          : null
    };
  }

  async function saveRegistrationSettings(options = {}) {
    const opts = options || {};
    const fromAuto = Boolean(opts.fromAuto);
    const button = opts.button || null;
    const saveCore = async () => {
      await window.DailyFlowWeb.api("/admin/registration-settings", {
        method: "PATCH",
        body: buildRegistrationSettingsPayload()
      });
      await loadAll();
      showMessage(fromAuto ? "注册设置已自动保存" : "注册设置已更新", false);
    };
    if (button) {
      await runGuardedButtonAction(
        button,
        { key: "admin:registration-settings-save", loadingText: "保存中..." },
        async () => {
          try {
            await saveCore();
          } catch (error) {
            showMessage("保存注册设置失败: " + error.message, true);
          }
        }
      );
      return;
    }
    if (registrationSettingsSaving) {
      registrationSettingsSavePending = true;
      return;
    }
    registrationSettingsSaving = true;
    try {
      await saveCore();
    } catch (error) {
      showMessage(
        (fromAuto ? "自动保存注册设置失败: " : "保存注册设置失败: ") + error.message,
        true
      );
    } finally {
      registrationSettingsSaving = false;
      if (registrationSettingsSavePending) {
        registrationSettingsSavePending = false;
        void saveRegistrationSettings({ fromAuto: true });
      }
    }
  }

  function scheduleRegistrationAutoSave() {
    if (!regEnabled || !regRequireInvite || !regDefaultGroupId) {
      return;
    }
    if (registrationAutoSaveTimer) {
      clearTimeout(registrationAutoSaveTimer);
    }
    registrationAutoSaveTimer = setTimeout(() => {
      registrationAutoSaveTimer = null;
      void saveRegistrationSettings({ fromAuto: true });
    }, 320);
  }

  function renderInviteCodes() {
    if (!inviteCodesTableBody) {
      return;
    }
    if (!inviteCodes.length) {
      inviteCodesTableBody.innerHTML =
        '<tr><td colspan="6" class="muted">暂无邀请码</td></tr>';
      return;
    }
    inviteCodesTableBody.innerHTML = inviteCodes
      .map((item) => {
        const statusPill = item.enabled
          ? '<span class="pill ok">启用</span>'
          : '<span class="pill warn">禁用</span>';
        const limitText =
          item.maxUses === null || item.maxUses === undefined
            ? "无限制"
            : String(item.maxUses);
        const usageText = String(item.usedCount || 0) + " / " + limitText;
        const expiryText = item.expiresAt
          ? window.DailyFlowWeb.escapeHtml(formatBeijingDateTime(item.expiresAt))
          : '<span class="muted">不设有效期</span>';
        return (
          "<tr>" +
          "<td>" +
          item.id +
          "</td>" +
          "<td><code>" +
          window.DailyFlowWeb.escapeHtml(String(item.code || "")) +
          "</code></td>" +
          "<td>" +
          statusPill +
          (item.isExpired ? ' <span class="pill error">已过期</span>' : "") +
          (item.isExhausted ? ' <span class="pill warn">次数用尽</span>' : "") +
          "</td>" +
          "<td>" +
          usageText +
          "</td>" +
          "<td>" +
          expiryText +
          "</td>" +
          "<td>" +
          '<div class="checkin-action-group">' +
          '<select id="invite-enabled-' +
          item.id +
          '" class="df-select px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary">' +
          '<option value="1"' +
          (item.enabled ? " selected" : "") +
          ">启用</option>" +
          '<option value="0"' +
          (!item.enabled ? " selected" : "") +
          ">禁用</option>" +
          "</select>" +
          '<input id="invite-max-' +
          item.id +
          '" type="number" min="0" placeholder="次数上限" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary w-[110px]" value="' +
          window.DailyFlowWeb.escapeHtml(
            item.maxUses === null || item.maxUses === undefined
              ? ""
              : String(item.maxUses)
          ) +
          '">' +
          '<input id="invite-expire-' +
          item.id +
          '" type="datetime-local" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary" value="' +
          window.DailyFlowWeb.escapeHtml(asDatetimeLocalInputValue(item.expiresAt)) +
          '">' +
          '<button data-action="save-invite" data-id="' +
          item.id +
          '" class="btn-table btn-table-primary">保存</button>' +
          "</div>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function findAppUserById(appUserId) {
    const id = Number(appUserId);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    return appUsers.find((item) => Number(item.id) === id) || null;
  }

  function buildAppUserGroupOptions(selectedValue) {
    const selected = String(selectedValue || "");
    const options = [
      '<option value="">选择用户组</option>',
      ...groups.map(
        (g) =>
          '<option value="' +
          g.id +
          '"' +
          (String(g.id) === selected ? " selected" : "") +
          '>#' +
          g.id +
          " " +
          window.DailyFlowWeb.escapeHtml(String(g.name || "")) +
          "</option>"
      )
    ];
    return options.join("");
  }

  function syncAppUserGroupActionUi() {
    if (!appEditGroupAction || !appEditGroupId) {
      return;
    }
    const action = String(appEditGroupAction.value || "none");
    const requiresGroup = action === "assign" || action === "remove";
    appEditGroupId.disabled = !requiresGroup;
    if (!requiresGroup) {
      appEditGroupId.value = "";
    }
  }

  function fillAppUserEditModal(appUser) {
    const user = appUser || {};
    appUserEditTargetId = Number(user.id) || null;
    if (appUserEditHint) {
      appUserEditHint.textContent =
        "用户: " + String(user.username || "-") + " (ID: " + String(user.id || "-") + ")";
    }
    if (appEditStatus) {
      appEditStatus.value = String(user.status || "active");
    }
    if (appEditPassword) {
      appEditPassword.value = "";
    }
    if (appEditGroupAction) {
      appEditGroupAction.value = "none";
    }
    if (appEditGroupId) {
      appEditGroupId.innerHTML = buildAppUserGroupOptions("");
    }
    if (appEditChannelName) {
      appEditChannelName.value = "";
    }
    if (appEditChannelProvider) {
      appEditChannelProvider.value = "bark";
    }
    if (appEditChannelBarkKey) {
      appEditChannelBarkKey.value = "";
    }
    if (appEditChannelServerUrl) {
      appEditChannelServerUrl.value = "";
    }
    if (appEditChannelEnabled) {
      appEditChannelEnabled.checked = true;
    }
    if (appEditChannelList) {
      appEditChannelList.innerHTML = '<span class="muted">加载推送通道中...</span>';
    }
    applyAppEditNotifyCreateProviderUi();
    syncAppUserGroupActionUi();
  }

  function getAppUserChannels(appUserId) {
    return appUserChannelsByUserId[String(appUserId || "")] || [];
  }

  function renderAppUserChannelList(appUserId) {
    if (!appEditChannelList) {
      return;
    }
    const rows = getAppUserChannels(appUserId);
    if (!rows.length) {
      appEditChannelList.innerHTML = '<span class="muted">暂无推送通道</span>';
      return;
    }
    appEditChannelList.innerHTML = rows
      .map((item) => {
        const channelId = Number(item.id || 0);
        const provider = normalizeNotifyProvider(item.provider);
        const serverUrl = getNotifyChannelServerUrl(item);
        const masked = window.DailyFlowWeb.escapeHtml(getNotifyChannelSecretMasked(item));
        return (
          '<div class="grid grid-cols-1 md:grid-cols-[110px_140px_minmax(0,1fr)_150px_88px_88px] gap-2 items-center p-2 bg-white border border-slate-200 rounded-lg">' +
          '<select id="channel-provider-' +
          channelId +
          '" data-prev-provider="' +
          window.DailyFlowWeb.escapeHtml(provider) +
          '" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary">' +
          '<option value="bark"' +
          (provider === "bark" ? " selected" : "") +
          ">Bark</option>" +
          '<option value="serverchan"' +
          (provider === "serverchan" ? " selected" : "") +
          ">Server酱</option>" +
          "</select>" +
          '<input id="channel-name-' +
          channelId +
          '" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary" value="' +
          window.DailyFlowWeb.escapeHtml(String(item.name || "")) +
          '">' +
          '<input id="channel-key-' +
          channelId +
          '" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary" placeholder="留空不修改，当前 ' +
          masked +
          '">' +
          '<input id="channel-server-' +
          channelId +
          '" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary" placeholder="' +
          window.DailyFlowWeb.escapeHtml(notifyServerPlaceholder(provider)) +
          '" value="' +
          window.DailyFlowWeb.escapeHtml(String(serverUrl || "")) +
          '">' +
          '<select id="channel-enabled-' +
          channelId +
          '" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary">' +
          '<option value="1"' +
          (item.enabled ? " selected" : "") +
          ">启用</option>" +
          '<option value="0"' +
          (!item.enabled ? " selected" : "") +
          ">禁用</option>" +
          "</select>" +
          '<div class="flex items-center gap-1 justify-end">' +
          '<button data-action="test-channel" data-channel-id="' +
          channelId +
          '" class="btn-table btn-table-default" style="min-height:30px;padding:4px 10px;">测试</button>' +
          '<button data-action="save-channel" data-channel-id="' +
          channelId +
          '" class="btn-table btn-table-primary" style="min-height:30px;padding:4px 10px;">保存</button>' +
          '<button data-action="delete-channel" data-channel-id="' +
          channelId +
          '" class="btn-table btn-table-danger" style="min-height:30px;padding:4px 10px;">删除</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  async function loadAppUserChannels(appUserId) {
    if (!Number.isFinite(Number(appUserId)) || Number(appUserId) <= 0) {
      return [];
    }
    const payload = await window.DailyFlowWeb.api(
      "/admin/users/" + Number(appUserId) + "/notification-channels"
    );
    const rows = Array.isArray(payload && payload.channels) ? payload.channels : [];
    appUserChannelsByUserId[String(appUserId)] = rows;
    if (Number(appUserEditTargetId) === Number(appUserId)) {
      renderAppUserChannelList(appUserId);
    }
    return rows;
  }

  function renderCheckinEditNotifyChannelOptions(checkinUser) {
    if (!editNotifyChannelId) {
      return;
    }
    const user = checkinUser || {};
    const channels = Array.isArray(user.availableNotificationChannels)
      ? user.availableNotificationChannels
      : [];
    const selectedId = user.notificationChannelId === null || user.notificationChannelId === undefined
      ? ""
      : String(user.notificationChannelId);
    const options = ['<option value="">不绑定（不推送）</option>'];
    for (const channel of channels) {
      const id = Number(channel && channel.id ? channel.id : 0);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      const label =
        "#" +
        id +
        " " +
        String(channel.name || "-") +
        (channel.username ? ` (${channel.username})` : "") +
        (channel.enabled ? "" : " [禁用]");
      options.push(
        '<option value="' +
          id +
          '"' +
          (String(id) === selectedId ? " selected" : "") +
          ">" +
          window.DailyFlowWeb.escapeHtml(label) +
          "</option>"
      );
    }
    editNotifyChannelId.innerHTML = options.join("");
    if (editNotifyChannelHint) {
      if (!channels.length) {
        editNotifyChannelHint.textContent = "当前无可用通道，请先在对应登录用户中创建推送通道。";
      } else if (user.notificationChannel && user.notificationChannel.name) {
        editNotifyChannelHint.textContent =
          "当前绑定: " +
          String(user.notificationChannel.name) +
          (user.notificationChannel.username ? ` (${user.notificationChannel.username})` : "");
      } else {
        editNotifyChannelHint.textContent = "已选择后点击“保存设置”即可生效。";
      }
    }
  }

  function openAppUserEditModal(appUser) {
    if (!appUserEditModal) {
      return;
    }
    fillAppUserEditModal(appUser);
    appUserEditModal.classList.remove("hidden");
    document.body.classList.add("sidebar-open");
    loadAppUserChannels(appUser.id).catch((error) => {
      if (appEditChannelList) {
        appEditChannelList.innerHTML =
          '<span class="muted">加载失败: ' +
          window.DailyFlowWeb.escapeHtml(String(error.message || "unknown")) +
          "</span>";
      }
    });
  }

  function closeAppUserEditModal() {
    if (!appUserEditModal) {
      return;
    }
    appUserEditTargetId = null;
    appUserEditModal.classList.add("hidden");
    document.body.classList.toggle("sidebar-open", Boolean(sidebar && sidebar.classList.contains("open")));
  }

  function syncAppUserEditModalByCurrentData() {
    if (!Number.isFinite(Number(appUserEditTargetId)) || Number(appUserEditTargetId) <= 0) {
      return;
    }
    const latest = findAppUserById(appUserEditTargetId);
    if (!latest) {
      closeAppUserEditModal();
      return;
    }
    fillAppUserEditModal(latest);
    loadAppUserChannels(latest.id).catch(() => {
      // ignore refresh failure in background
    });
  }

  function renderCheckinUsers() {
    if (!checkinUsers.length) {
      checkinUsersTableBody.innerHTML = '<tr><td colspan="10" class="muted">暂无签到账号</td></tr>';
      return;
    }
    checkinUsersTableBody.innerHTML = checkinUsers
      .map((u) => {
        const cookieState = cookieStatusByUserId[String(u.id || "")] || null;
        const mappings = (u.mappings || [])
          .map(
            (m) =>
              '<span class="pill">#' +
              m.appUserId +
              " " +
              window.DailyFlowWeb.escapeHtml(m.username) +
              "</span>"
          )
          .join(" ");
        const cookieStatusHtml = formatCookieStatusHtml(u.id);
        const checkinStatusHtml = formatCheckinStatusHtml(u.id);
        const executionObj =
          u.executionStatus && typeof u.executionStatus === "object" ? u.executionStatus : null;
        const executionStatusBadge = formatExecutionStatusHtml(executionObj);
        const executionSummary = executionObj
          ? executionStatusLabel(executionObj.status || "unknown") +
            (executionObj.finishedAt
              ? " | " + formatBeijingDateTime(executionObj.finishedAt)
              : "")
          : "暂无执行记录";
        const executionMessage = executionObj && executionObj.message
          ? String(executionObj.message)
          : "暂无详情";
        const executionDetailText = window.DailyFlowWeb.escapeHtml(
          executionSummary +
            (executionMessage && executionMessage !== "暂无详情" ? "\n" + executionMessage : "")
        );
        const notifyChannelText = u.notificationChannel && u.notificationChannel.name
          ? window.DailyFlowWeb.escapeHtml(
              String(u.notificationChannel.name) +
                (u.notificationChannel.username ? ` (${u.notificationChannel.username})` : "")
            )
          : "未绑定";
        const showQrAction =
          !u.hasAuthState ||
          (cookieState &&
            ["expired", "missing", "error", "invalid_state"].includes(
              String(cookieState.status || "").toLowerCase()
            ));
        const loginBadge =
          '<span class="pill ' + (u.hasAuthState ? "ok" : "warn") + '">' + (u.hasAuthState ? "已登录" : "未登录") + "</span>";
        const runningBadge =
          '<span class="pill ' + (u.enabled ? "ok" : "warn") + '">' + (u.enabled ? "启用" : "禁用") + "</span>" +
          (u.debugMode ? ' <span class="pill warn">Debug</span>' : "");
        const cookieMeta =
          '<span class="muted checkin-cookie-id">ID: ' +
          window.DailyFlowWeb.escapeHtml(String(u.id || "-")) +
          "</span>" +
          (u.authStateParseError ? ' <span class="pill error">解析异常</span>' : "");
        const bindBadge =
          u.notificationChannel && u.notificationChannel.name
            ? '<span class="pill ok">已绑定</span>'
            : '<span class="pill warn">未绑定</span>';
        return (
          "<tr>" +
          "<td>" + u.id + "</td>" +
          "<td>" + window.DailyFlowWeb.escapeHtml(u.displayName || "-") + "</td>" +
          "<td><span class='muted inline-flex items-center gap-1'><i class='ph ph-clock text-slate-400'></i>" + window.DailyFlowWeb.escapeHtml(parseCronToTimeLabel(u.cronExpr)) + "</span></td>" +
          "<td><span class='muted inline-flex items-center gap-1'><i class='ph ph-bell text-slate-400'></i>" + window.DailyFlowWeb.escapeHtml(u.warningTime || "-") + "</span></td>" +
          "<td>" + runningBadge + "</td>" +
          "<td>" + loginBadge + "</td>" +
          "<td>" + cookieStatusHtml + "<div class='checkin-cookie-meta'>" + cookieMeta + "</div></td>" +
          "<td><div class='checkin-status-main'>" + checkinStatusHtml + "</div></td>" +
          "<td>" +
          "<div class='execution-cell'>" +
            "<button type='button' data-action='toggle-execution-popover' data-id='" + u.id + "' class='execution-popover-trigger' title='查看执行详情' aria-label='查看执行详情'>" +
              executionStatusBadge +
            "</button>" +
            "<div class='execution-popover hidden' data-role='execution-popover'>" +
              "<div class='execution-popover-title'>执行详情</div>" +
              "<pre class='execution-popover-content'>" + executionDetailText + "</pre>" +
            "</div>" +
          "</div>" +
          "</td>" +
          "<td>" + bindBadge + "<div class='muted checkin-notify-meta'>" + notifyChannelText + "</div></td>" +
          "<td>" +
            '<div class="checkin-action-group">' +
              '<button data-action="time-settings" data-id="' + u.id + '" class="btn-table btn-table-primary">修改时间</button>' +
              '<button data-action="edit-checkin" data-id="' + u.id + '" class="btn-table btn-table-default">编辑</button>' +
              '<button data-action="manual-run" data-id="' + u.id + '" class="btn-table btn-table-default">手动签到</button>' +
              '<button data-action="view-logs" data-id="' + u.id + '" class="btn-table btn-table-link" title="查看并复制日志">查看日志</button>' +
              '<details class="inline-block checkin-more-menu">' +
              '<summary class="btn-table btn-table-default cursor-pointer list-none">更多</summary>' +
              '<div class="checkin-more-panel">' +
              (showQrAction
                ? '<button data-action="start-qr" data-id="' + u.id + '" class="btn-table btn-table-default w-full text-left">二维码登录</button>'
                : "") +
              '<button data-action="check-checkin-status" data-id="' + u.id + '" class="btn-table btn-table-default w-full text-left">检查签到</button>' +
              (mappings
                ? '<div class="checkin-more-meta">用户：' + mappings + '</div>'
                : '<div class="checkin-more-meta">用户：<span class="muted">无绑定</span></div>') +
              "</div>" +
              "</details>" +
            '</div>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderAdminOverview() {
    const data = adminOverview && typeof adminOverview === "object" ? adminOverview : {};
    const totalUsers = Number(data.totalUsers || 0);
    const totalRegularUsers = Number(data.totalRegularUsers || 0);
    const totalCheckinAccounts = Number(data.totalCheckinAccounts || 0);
    const totalScheduledTasks = Number(data.totalScheduledTasks || 0);
    const totalNotificationChannels = Number(data.totalNotificationChannels || 0);
    const checkinSuccessCount = Number(data.checkinSuccessCount || 0);
    const checkinFailedCount = Number(data.checkinFailedCount || 0);

    if (overviewTotalUsers) {
      overviewTotalUsers.textContent = String(totalUsers);
    }
    if (overviewTotalUsersHint) {
      overviewTotalUsersHint.textContent = `普通用户 ${totalRegularUsers} + 管理员 1`;
    }
    if (overviewTotalCheckinAccounts) {
      overviewTotalCheckinAccounts.textContent = String(totalCheckinAccounts);
    }
    if (overviewTotalScheduledTasks) {
      overviewTotalScheduledTasks.textContent = String(totalScheduledTasks);
    }
    if (overviewTotalNotificationChannels) {
      overviewTotalNotificationChannels.textContent = String(totalNotificationChannels);
    }
    if (overviewCheckinSuccessCount) {
      overviewCheckinSuccessCount.textContent = String(checkinSuccessCount);
    }
    if (overviewCheckinFailedCount) {
      overviewCheckinFailedCount.textContent = String(checkinFailedCount);
    }
    if (overviewGeneratedAt) {
      overviewGeneratedAt.textContent = "更新时间：" + formatBeijingDateTime(data.generatedAt || "-");
    }
  }

  function renderAll() {
    renderAdminOverview();
    renderGroups();
    renderAppUsers();
    renderAdminOwnChannels();
    renderRegistrationSettings();
    renderInviteCodes();
    renderCheckinUsers();
    syncAppUserEditModalByCurrentData();
    syncCheckinEditModalByCurrentData();
  }

  async function loadAll() {
    const [overviewRes, userRes, groupRes, checkinRes, regRes, inviteRes, adminNotifyRes] = await Promise.all([
      window.DailyFlowWeb.api("/admin/overview"),
      window.DailyFlowWeb.api("/admin/users"),
      window.DailyFlowWeb.api("/admin/groups"),
      window.DailyFlowWeb.api("/admin/checkin-users"),
      window.DailyFlowWeb.api("/admin/registration-settings"),
      window.DailyFlowWeb.api("/admin/invite-codes"),
      window.DailyFlowWeb.api("/admin/notification-channels?includeSecret=1")
    ]);
    adminOverview = overviewRes && overviewRes.overview ? overviewRes.overview : null;
    appUsers = userRes.users || [];
    adminOwnChannels =
      adminNotifyRes && Array.isArray(adminNotifyRes.channels)
        ? adminNotifyRes.channels
        : [];
    groups = groupRes.groups || [];
    checkinUsers = checkinRes.checkinUsers || [];
    registrationSettings = {
      registrationEnabled: Boolean(regRes && regRes.registrationEnabled),
      requireInvite: Boolean(regRes && regRes.requireInvite),
      defaultGroupId:
        regRes && Number.isFinite(Number(regRes.defaultGroupId))
          ? Number(regRes.defaultGroupId)
          : null,
      defaultGroupName:
        regRes && regRes.defaultGroupName ? String(regRes.defaultGroupName) : null
    };
    inviteCodes = Array.isArray(inviteRes && inviteRes.inviteCodes)
      ? inviteRes.inviteCodes
      : [];
    pruneAppUserChannels(appUsers);
    const validGroupIds = new Set(groups.map((g) => String(g.id)));
    for (const key of Object.keys(groupEditingById)) {
      if (!validGroupIds.has(String(key))) {
        delete groupEditingById[key];
      }
    }
    const validNotifyIds = new Set(adminOwnChannels.map((c) => String(c.id)));
    for (const key of Object.keys(adminNotifyEditingById)) {
      if (!validNotifyIds.has(String(key))) {
        delete adminNotifyEditingById[key];
      }
    }
    pruneCookieStatusCache(checkinUsers);
    pruneCheckinStatusCache(checkinUsers);
    syncStatusCacheFromServerRows(checkinUsers);
    renderAll();
  }

  async function loadDebugMode() {
    const payload = await window.DailyFlowWeb.api("/admin/checkin-debug-mode");
    debugModeEnabled = Boolean(payload.enabled);
    applyDebugModeUi();
  }

  async function refreshCookieStatusForUser(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/admin/checkin-users/" + checkinUserId + "/check-cookie",
      { method: "POST" }
    );
    const result = payload && payload.result ? payload.result : null;
    updateCookieStatus(checkinUserId, result);
    return normalizeCookieStatusResult(result);
  }

  async function refreshCheckinStatusForUser(checkinUserId) {
    const payload = await window.DailyFlowWeb.api(
      "/admin/checkin-users/" + checkinUserId + "/check-checkin-status",
      { method: "POST" }
    );
    const result = payload && payload.result ? payload.result : null;
    updateCheckinStatus(checkinUserId, result);
    return normalizeCheckinStatusResult(result);
  }

  async function refreshCookieStatusForAll() {
    const rows = Array.isArray(checkinUsers) ? checkinUsers.slice() : [];
    if (!rows.length) {
      showMessage("暂无签到账号可刷新状态", true);
      return;
    }
    let okCount = 0;
    let failCount = 0;
    for (const row of rows) {
      try {
        const [cookieResult, checkinResult] = await Promise.all([
          refreshCookieStatusForUser(row.id),
          refreshCheckinStatusForUser(row.id)
        ]);
        if (cookieResult.ok && checkinResult.ok) {
          okCount += 1;
        } else {
          failCount += 1;
        }
      } catch (error) {
        failCount += 1;
        updateCookieStatus(row.id, {
          ok: false,
          status: "error",
          message: String(error.message || "刷新失败"),
          checkedAt: new Date().toISOString(),
          finalUrl: ""
        });
        updateCheckinStatus(row.id, {
          ok: false,
          status: "error",
          message: String(error.message || "刷新失败"),
          checkedAt: new Date().toISOString()
        });
      }
      renderCheckinUsers();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    showMessage(`状态刷新完成：成功 ${okCount}，失败 ${failCount}`, failCount > 0);
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
    switchPanel("panel-qr");
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
        showMessage("二维码实时连接异常，已自动重连: " + payload.error, true);
        return;
      }
      if (!payload.session) {
        return;
      }
      setQrPanel(payload.session);
      if (payload.session.done) {
        stopQrWs();
        stopQrPoll();
        await loadAll();
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
        "/admin/qr-login-sessions/" +
          currentQrSessionId +
          "?qrImageVersion=" +
          encodeURIComponent(String(currentQrImageVersion))
      );
      qrPollErrorCount = 0;
      setQrPanel(next.session);
      if (next.session.done) {
        stopQrWs();
        stopQrPoll();
        await loadAll();
      }
    } catch (error) {
      qrPollErrorCount += 1;
      if (qrPollErrorCount >= 6) {
        stopQrPoll({ resetVersion: false });
        ensureQrPolling(3200);
        if (!qrWsConnected) {
          scheduleQrWsReconnect();
        }
        showMessage("二维码状态获取波动，已切换慢速重试并自动重连实时通道: " + error.message, true);
      } else {
        showMessage(
          "网络波动，正在自动重试并重连实时通道（" + qrPollErrorCount + "/5）",
          true
        );
      }
    } finally {
      qrPollInFlight = false;
    }
  }

  async function startQrFlow(checkinUserId) {
    currentQrCheckinUserId = Number(checkinUserId) || null;
    const payload = await window.DailyFlowWeb.api("/admin/checkin-users/" + checkinUserId + "/qr-login", {
      method: "POST"
    });
    const session = payload.session;
    currentQrSessionId = session.id;
    currentQrDone = false;
    clearQrWsReconnect(true);
    stopQrPoll();
    stopQrWs();
    setQrPanel(session);
    startQrWs();
    await pollQrSessionOnce();
    if (!qrWsConnected) {
      ensureQrPolling();
    }
  }

  async function refreshQrByImageClick() {
    const now = Date.now();
    if (now - lastManualQrRefreshAt < 4000) {
      showMessage("二维码刷新过快，请稍后再试", true);
      return;
    }
    if (qrRefreshInFlight) {
      showMessage("二维码正在刷新，请稍候…", true);
      return;
    }
    if (!Number.isFinite(Number(currentQrCheckinUserId)) || Number(currentQrCheckinUserId) <= 0) {
      showMessage("请先在“签到账号管理”中点击“二维码登录”启动会话", true);
      return;
    }
    qrRefreshInFlight = true;
    lastManualQrRefreshAt = now;
    try {
      showMessage("正在刷新二维码...", false);
      await startQrFlow(currentQrCheckinUserId);
      showMessage("二维码已刷新，请扫码", false);
    } catch (error) {
      showMessage("刷新二维码失败: " + error.message, true);
    } finally {
      qrRefreshInFlight = false;
    }
  }

  async function refreshCurrentPanelData() {
    if (currentPanelId === "panel-faq") {
      resetFaqAccordions();
      return;
    }
    if (currentPanelId === "panel-overview") {
      await Promise.all([loadAll(), loadDebugMode()]);
      return;
    }
    if (currentPanelId === "panel-checkin") {
      await loadAll();
      return;
    }
    if (currentPanelId === "panel-users") {
      await Promise.all([loadAll(), loadDebugMode()]);
      return;
    }
    if (currentPanelId === "panel-qr") {
      if (currentQrSessionId) {
        await pollQrSessionOnce();
      } else {
        await loadAll();
      }
      return;
    }
    await loadAll();
  }

  $("btnRefresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await runGuardedButtonAction(
      button,
      {
        key: "admin:refresh-page",
        cooldownMs: 1200,
        minLoadingMs: 2000,
        silentBlocked: true,
        lockWidth: true
      },
      async () => {
        try {
          clearMessage();
          await refreshCurrentPanelData();
        } catch (error) {
          console.warn("refresh failed", error);
        }
      }
    );
  });

  $("debugModeToggle").addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      await window.DailyFlowWeb.api("/admin/checkin-debug-mode", {
        method: "PATCH",
        body: { enabled }
      });
      debugModeEnabled = enabled;
      applyDebugModeUi();
      showMessage(enabled ? "调试模式已开启" : "调试模式已关闭", false);
    } catch (error) {
      event.target.checked = !enabled;
      showMessage("设置调试模式失败: " + error.message, true);
    }
  });

  if (groupMaxMode) {
    groupMaxMode.addEventListener("change", applyGroupMaxModeUi);
  }
  if (btnSystemSettings) {
    btnSystemSettings.addEventListener("click", () => {
      showMessage("系统设置入口已预留，可在此扩展系统级配置项。", false);
    });
  }
  if (btnFaqDocs) {
    btnFaqDocs.addEventListener("click", () => {
      showMessage("文档入口预留中，可先查看本页 FAQ 与系统 README。", false);
    });
  }
  if (btnOpenCheckinEditGuide) {
    btnOpenCheckinEditGuide.addEventListener("click", () => {
      const target = Array.isArray(checkinUsers) && checkinUsers.length > 0 ? checkinUsers[0] : null;
      if (!target) {
        showMessage("请先创建签到账号，再点击“编辑”查看完整配置项。", false);
        return;
      }
      openCheckinEditModal(target);
      showMessage("已打开首个签到账号的编辑示例。", false);
    });
  }
  setupPasswordToggle("btnToggleAppPassword", "appPassword");
  setupPasswordToggle("btnToggleAppPasswordConfirm", "appPasswordConfirm");
  if ($("adminOwnNotifyBarkKey")) {
    setupSensitiveInputMask($("adminOwnNotifyBarkKey"));
  }
  if (btnAdminOwnNotifyBarkCopy) {
    btnAdminOwnNotifyBarkCopy.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:copy-bark-key", loadingText: "复制中...", cooldownMs: 600 },
        async () => {
          const value = getSensitiveInputRawValue($("adminOwnNotifyBarkKey"));
          if (!value) {
            showMessage("当前没有可复制的通道密钥", true);
            return;
          }
          await copyTextToClipboard(value);
          showMessage("通道密钥已复制", false);
        }
      );
    });
  }
  if (adminOwnNotifyProvider) {
    adminOwnNotifyProvider.addEventListener("change", () => {
      applyAdminOwnNotifyCreateProviderUi();
    });
  }
  if (appEditChannelProvider) {
    appEditChannelProvider.addEventListener("change", () => {
      applyAppEditNotifyCreateProviderUi();
    });
  }
  $("qrImage").title = "点击刷新二维码";
  $("qrImage").style.cursor = "pointer";
  $("qrImage").addEventListener("click", (event) => {
    if (!event || !event.isTrusted) {
      return;
    }
    refreshQrByImageClick();
  });
  $("btnLogout").addEventListener("click", () => {
    stopQrWs();
    stopQrPoll();
    logout();
  });
  if (btnLogModalClose) {
    btnLogModalClose.addEventListener("click", () => {
      closeLogModal();
    });
  }
  if (btnLogDetailClose) {
    btnLogDetailClose.addEventListener("click", () => {
      closeLogDetailModal();
    });
  }
  if (btnLogDetailCopy) {
    btnLogDetailCopy.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:log-detail-copy", loadingText: "复制中...", cooldownMs: 700 },
        async () => {
          try {
            const text = logDetailContent ? String(logDetailContent.textContent || "") : "";
            await copyTextToClipboard(text);
            showMessage("日志详情已复制到剪贴板", false);
          } catch (error) {
            showMessage("复制失败: " + error.message, true);
          }
        }
      );
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
        { key: "admin:checkin-log-refresh", loadingText: "刷新中..." },
        async () => {
          try {
            await loadCheckinLogs(logTargetCheckinUserId);
          } catch (error) {
            showMessage("刷新日志失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnLogCopyLatest) {
    btnLogCopyLatest.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:checkin-log-copy-latest", loadingText: "复制中...", cooldownMs: 700 },
        async () => {
          try {
            const text = buildLatestLogsCopyText();
            if (!text) {
              showMessage("当前没有可复制的日志", true);
              return;
            }
            await copyTextToClipboard(text);
            showMessage("最近日志已复制到剪贴板", false);
          } catch (error) {
            showMessage("复制日志失败: " + error.message, true);
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
        { key: "admin:checkin-log-clear", loadingText: "清除中..." },
        async () => {
          try {
            const deleted = await clearCheckinLogs(logTargetCheckinUserId);
            closeLogDetailModal();
            await loadCheckinLogs(logTargetCheckinUserId);
            showMessage(`日志已清除，删除 ${deleted} 条记录`, false);
          } catch (error) {
            showMessage("清除日志失败: " + error.message, true);
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
  if (logDetailModal) {
    logDetailModal.addEventListener("click", (event) => {
      if (event.target === logDetailModal) {
        closeLogDetailModal();
      }
    });
  }
  if (logTableBody) {
    logTableBody.addEventListener("click", async (event) => {
      const target = event.target.closest("button[data-action='view-log-detail']");
      if (!target) {
        return;
      }
      const checkinUserId = Number(logTargetCheckinUserId);
      const logId = Number(target.dataset.logId);
      if (!Number.isFinite(checkinUserId) || checkinUserId <= 0) {
        showMessage("未选择签到账号", true);
        return;
      }
      if (!Number.isFinite(logId) || logId <= 0) {
        showMessage("日志ID无效", true);
        return;
      }
      await runGuardedButtonAction(
        target,
        {
          key: "admin:view-log-detail:" + checkinUserId + ":" + logId,
          loadingText: "加载中..."
        },
        async () => {
          try {
            const detail = await loadCheckinLogDetail(checkinUserId, logId);
            const label =
              "账号: " +
              (logTargetCheckinUserLabel || "-") +
              " | 日志ID: " +
              String(detail.id || logId);
            if (logDetailContent) {
              logDetailContent.textContent = formatLogDetailContent(detail.rawResult);
            }
            openLogDetailModal(logId, label);
          } catch (error) {
            showMessage("加载日志详情失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnCheckinEditClose) {
    btnCheckinEditClose.addEventListener("click", () => {
      closeCheckinEditModal();
    });
  }
  if (checkinEditModal) {
    checkinEditModal.addEventListener("click", (event) => {
      if (event.target === checkinEditModal) {
        closeCheckinEditModal();
      }
    });
  }
  if (btnCheckinSaveAll) {
    btnCheckinSaveAll.addEventListener("click", async (event) => {
      const targetUser = findCheckinUserById(checkinEditTargetUserId);
      if (!targetUser) {
        showMessage("签到账号不存在", true);
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:modal-save-all:" + targetUser.id, loadingText: "保存中..." },
        async () => {
          try {
            const basicPayload = buildCheckinEditBasicPayload();
            const locationPayload = buildCheckinEditLocationPayloadOrNull();
            await window.DailyFlowWeb.api("/admin/checkin-users/" + targetUser.id, {
              method: "PATCH",
              body: basicPayload
            });
            if (locationPayload) {
              await window.DailyFlowWeb.api("/admin/checkin-users/" + targetUser.id + "/location", {
                method: "POST",
                body: locationPayload
              });
            }
            await loadAll();
            showMessage("设置已保存", false);
          } catch (error) {
            showMessage("保存设置失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnCheckinCheckCookie) {
    btnCheckinCheckCookie.addEventListener("click", async (event) => {
      const targetUser = findCheckinUserById(checkinEditTargetUserId);
      if (!targetUser) {
        showMessage("签到账号不存在", true);
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:modal-check-cookie:" + targetUser.id, loadingText: "检查中..." },
        async () => {
          try {
            const result = await refreshCookieStatusForUser(targetUser.id);
            await loadAll();
            const status = result && result.status ? String(result.status) : "unknown";
            const statusText = cookieStatusLabel(status);
            const msg = result && result.message ? String(result.message) : "";
            const reloginHint = ["missing", "expired", "invalid_state"].includes(status)
              ? "，请重新扫码登录"
              : "";
            showMessage(
              "Cookie检查: " + statusText + (msg ? " - " + msg : "") + reloginHint,
              !result || !result.ok
            );
          } catch (error) {
            showMessage("刷新 Cookie 状态失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnCheckinViewCookie) {
    btnCheckinViewCookie.addEventListener("click", () => {
      const targetUser = findCheckinUserById(checkinEditTargetUserId);
      if (!targetUser) {
        showMessage("签到账号不存在", true);
        return;
      }
      showCookieInspectDialog(targetUser);
    });
  }
  if (btnCheckinBindUser) {
    btnCheckinBindUser.addEventListener("click", async (event) => {
      const targetUser = findCheckinUserById(checkinEditTargetUserId);
      if (!targetUser) {
        showMessage("签到账号不存在", true);
        return;
      }
      const appUserId = Number($("editBindAppUserId").value);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        showMessage("请输入合法登录用户ID", true);
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:modal-bind-user:" + targetUser.id, loadingText: "绑定中..." },
        async () => {
          try {
            await window.DailyFlowWeb.api(
              "/admin/checkin-users/" + targetUser.id + "/mappings/" + appUserId,
              { method: "POST" }
            );
            $("editBindAppUserId").value = "";
            await loadAll();
            showMessage("绑定成功", false);
          } catch (error) {
            showMessage("绑定失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (editNotifyChannelId) {
    editNotifyChannelId.addEventListener("change", () => {
      if (!editNotifyChannelHint) {
        return;
      }
      const value = String(editNotifyChannelId.value || "").trim();
      if (!value) {
        editNotifyChannelHint.textContent = "当前未绑定推送通道。";
        return;
      }
      const text = editNotifyChannelId.options[editNotifyChannelId.selectedIndex]
        ? editNotifyChannelId.options[editNotifyChannelId.selectedIndex].textContent
        : "";
      editNotifyChannelHint.textContent = "待绑定: " + String(text || value);
    });
  }
  if (editMappingList) {
    editMappingList.addEventListener("click", async (event) => {
      const target = event.target.closest("button[data-action='modal-unbind']");
      if (!target) {
        return;
      }
      const targetUser = findCheckinUserById(checkinEditTargetUserId);
      if (!targetUser) {
        showMessage("签到账号不存在", true);
        return;
      }
      const appUserId = Number(target.dataset.appUserId);
      if (!Number.isFinite(appUserId) || appUserId <= 0) {
        return;
      }
      await runGuardedButtonAction(
        target,
        { key: "admin:modal-unbind-user:" + targetUser.id + ":" + appUserId, loadingText: "移除中..." },
        async () => {
          try {
            await window.DailyFlowWeb.api(
              "/admin/checkin-users/" + targetUser.id + "/mappings/" + appUserId,
              { method: "DELETE" }
            );
            await loadAll();
            showMessage("解绑成功", false);
          } catch (error) {
            showMessage("解绑失败: " + error.message, true);
          }
        }
      );
    });
  }

  $("createAppUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button =
      event.submitter || $("createAppUserForm").querySelector('button[type="submit"]');
    await runGuardedButtonAction(
      button,
      { key: "admin:create-app-user", loadingText: "创建中..." },
      async () => {
        try {
          clearMessage();
          const password = String($("appPassword").value || "");
          const confirmPassword = String($("appPasswordConfirm").value || "");
          if (!password) {
            throw new Error("请输入密码");
          }
          if (password !== confirmPassword) {
            throw new Error("两次输入的密码不一致");
          }
          await window.DailyFlowWeb.api("/admin/users", {
            method: "POST",
            body: {
              username: $("appUsername").value.trim(),
              password,
              status: $("appStatus").value,
              purchasedAt: $("appPurchasedAt").value || null,
              expiresAt: $("appExpiresAt").value || null
            }
          });
          $("createAppUserForm").reset();
          $("appStatus").value = "active";
          if ($("appPassword")) {
            $("appPassword").type = "password";
          }
          if ($("appPasswordConfirm")) {
            $("appPasswordConfirm").type = "password";
          }
          if (btnToggleAppPassword) {
            btnToggleAppPassword.innerHTML = '<i class="ph ph-eye text-base"></i>';
          }
          if (btnToggleAppPasswordConfirm) {
            btnToggleAppPasswordConfirm.innerHTML = '<i class="ph ph-eye text-base"></i>';
          }
          await loadAll();
          showMessage("登录用户创建成功", false);
        } catch (error) {
          showMessage("创建登录用户失败: " + error.message, true);
        }
      }
    );
  });

  $("createGroupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button =
      event.submitter || $("createGroupForm").querySelector('button[type="submit"]');
    await runGuardedButtonAction(
      button,
      { key: "admin:create-group", loadingText: "创建中..." },
      async () => {
        try {
          clearMessage();
          await window.DailyFlowWeb.api("/admin/groups", {
            method: "POST",
            body: {
              name: $("groupName").value.trim(),
              description: $("groupDesc").value.trim() || null,
              maxCheckinAccounts:
                String(groupMaxMode && groupMaxMode.value ? groupMaxMode.value : "unlimited") !== "limited"
                  ? null
                  : $("groupMaxCheckin").value.trim() === ""
                  ? null
                  : Number($("groupMaxCheckin").value.trim())
            }
          });
          $("createGroupForm").reset();
          if (groupMaxMode) {
            groupMaxMode.value = "unlimited";
          }
          applyGroupMaxModeUi();
          await loadAll();
          showMessage("用户组创建成功", false);
        } catch (error) {
          showMessage("创建用户组失败: " + error.message, true);
        }
      }
    );
  });

  if (btnSaveRegistrationSettings) {
    btnSaveRegistrationSettings.addEventListener("click", async (event) => {
      await saveRegistrationSettings({ button: event.currentTarget });
    });
  }
  if (regEnabled) {
    regEnabled.addEventListener("change", scheduleRegistrationAutoSave);
  }
  if (regRequireInvite) {
    regRequireInvite.addEventListener("change", scheduleRegistrationAutoSave);
  }
  if (regDefaultGroupId) {
    regDefaultGroupId.addEventListener("change", scheduleRegistrationAutoSave);
  }

  const createInviteCodeForm = $("createInviteCodeForm");
  if (createInviteCodeForm) {
    createInviteCodeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button =
        event.submitter || createInviteCodeForm.querySelector('button[type="submit"]');
      await runGuardedButtonAction(
        button,
        { key: "admin:create-invite-code", loadingText: "创建中..." },
        async () => {
          try {
            await window.DailyFlowWeb.api("/admin/invite-codes", {
              method: "POST",
              body: {
                code: String($("inviteCode") && $("inviteCode").value ? $("inviteCode").value : "").trim() || null,
                maxUses:
                  String($("inviteMaxUses") && $("inviteMaxUses").value ? $("inviteMaxUses").value : "").trim() === ""
                    ? null
                    : Number($("inviteMaxUses").value),
                expiresAt: $("inviteExpiresAt") && $("inviteExpiresAt").value
                  ? new Date($("inviteExpiresAt").value).toISOString()
                  : null,
                enabled: Boolean($("inviteEnabled") && $("inviteEnabled").checked)
              }
            });
            createInviteCodeForm.reset();
            if ($("inviteEnabled")) {
              $("inviteEnabled").checked = true;
            }
            await loadAll();
            showMessage("邀请码创建成功", false);
          } catch (error) {
            showMessage("创建邀请码失败: " + error.message, true);
          }
        }
      );
    });
  }

  groupsTableBody.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }
    const action = target.dataset.action;
    const id = Number(target.dataset.id);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    if (action === "edit-group") {
      const current = groups.find((item) => Number(item.id) === id);
      if (!current) {
        showMessage("用户组不存在", true);
        return;
      }
      const max = current.maxCheckinAccounts;
      groupEditingById[id] = {
        name: String(current.name || ""),
        description: String(current.description || ""),
        maxMode: max === null || max === undefined ? "unlimited" : "limited",
        maxCheckin: max === null || max === undefined ? "" : String(max),
        editing: true
      };
      renderGroups();
      return;
    }
    if (action === "cancel-group") {
      const current = groups.find((item) => Number(item.id) === id);
      if (!current) {
        return;
      }
      groupEditingById[id] = {
        ...ensureGroupEditDraft(current),
        editing: false
      };
      renderGroups();
      return;
    }
    if (action !== "save-group") {
      return;
    }
    await runGuardedButtonAction(
      target,
      { key: "admin:group-save:" + id, loadingText: "保存中..." },
      async () => {
        try {
          const name = $("group-name-" + id).value.trim();
          const descEl = $("group-desc-" + id);
          const description = descEl ? String(descEl.value || "").trim() : "";
          const modeEl = $("group-max-mode-" + id);
          const maxEl = $("group-max-" + id);
          const maxRaw = maxEl ? String(maxEl.value || "").trim() : "";
          const maxMode = modeEl ? String(modeEl.value || "unlimited") : "unlimited";
          await window.DailyFlowWeb.api("/admin/groups/" + id, {
            method: "PATCH",
            body: {
              name,
              description: description || null,
              maxCheckinAccounts: maxMode !== "limited" || maxRaw === "" ? null : Number(maxRaw)
            }
          });
          if (groupEditingById[id]) {
            groupEditingById[id].editing = false;
          }
          showMessage("用户组已更新", false);
          await loadAll();
        } catch (error) {
          showMessage("更新用户组失败: " + error.message, true);
        }
      }
    );
  });

  groupsTableBody.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || !target.id || !target.id.startsWith("group-max-mode-")) {
      return;
    }
    const id = Number(target.id.replace("group-max-mode-", ""));
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    const maxInput = $("group-max-" + id);
    const limited = String(target.value || "unlimited") === "limited";
    if (maxInput) {
      maxInput.disabled = !limited;
      if (!limited) {
        maxInput.value = "";
      }
    }
  });

  if (inviteCodesTableBody) {
    inviteCodesTableBody.addEventListener("click", async (event) => {
      const target = event.target.closest("button[data-action]");
      if (!target) {
        return;
      }
      const action = String(target.dataset.action || "");
      const id = Number(target.dataset.id);
      if (action !== "save-invite" || !Number.isFinite(id) || id <= 0) {
        return;
      }
      await runGuardedButtonAction(
        target,
        { key: "admin:invite-save:" + id, loadingText: "保存中..." },
        async () => {
          try {
            const enabledSelect = $("invite-enabled-" + id);
            const maxInput = $("invite-max-" + id);
            const expireInput = $("invite-expire-" + id);
            const maxRaw = String(maxInput && maxInput.value ? maxInput.value : "").trim();
            const expiresRaw = String(
              expireInput && expireInput.value ? expireInput.value : ""
            ).trim();
            await window.DailyFlowWeb.api("/admin/invite-codes/" + id, {
              method: "PATCH",
              body: {
                enabled: String(enabledSelect && enabledSelect.value ? enabledSelect.value : "1") === "1",
                maxUses: maxRaw === "" ? null : Number(maxRaw),
                expiresAt: expiresRaw ? new Date(expiresRaw).toISOString() : null
              }
            });
            await loadAll();
            showMessage("邀请码已更新", false);
          } catch (error) {
            showMessage("更新邀请码失败: " + error.message, true);
          }
        }
      );
    });
  }

  $("createCheckinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button =
      event.submitter || $("createCheckinForm").querySelector('button[type="submit"]');
    await runGuardedButtonAction(
      button,
      { key: "admin:create-checkin-user", loadingText: "创建中..." },
      async () => {
        try {
          clearMessage();
          const payload = await window.DailyFlowWeb.api("/admin/checkin-users", {
            method: "POST",
            body: {
              displayName: $("ckDisplayName").value.trim(),
              cronExpr: timeToCronExpr($("ckCheckinTime").value),
              timezone: "Asia/Shanghai",
              warningTime: $("ckWarning").value.trim()
            }
          });
          $("createCheckinForm").reset();
          $("ckCheckinTime").value = "08:00";
          $("ckWarning").value = "23:00";
          await loadAll();
          const createdKey =
            payload && payload.checkinUser && payload.checkinUser.userKey
              ? payload.checkinUser.userKey
              : "";
          showMessage(
            createdKey ? "签到账号创建成功，系统编号: " + createdKey : "签到账号创建成功",
            false
          );
          if ($("ckAutoQr").checked && payload.checkinUser && payload.checkinUser.id) {
            await startQrFlow(payload.checkinUser.id);
          }
        } catch (error) {
          showMessage("创建签到账号失败: " + error.message, true);
        }
      }
    );
  });

  appUsersTableBody.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }
    const action = target.dataset.action;
    const id = Number(target.dataset.id);
    if (action === "jump-create-app-user") {
      if (btnToggleCreateUserCard) {
        const collapsed = btnToggleCreateUserCard.textContent.includes("展开");
        if (collapsed) {
          btnToggleCreateUserCard.click();
        }
      }
      const form = $("createAppUserForm");
      if (form) {
        try {
          form.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_error) {
          // ignore scroll failure
        }
      }
      return;
    }
    if (!action || !Number.isFinite(id)) {
      return;
    }
    const loadingTextByAction = {
      "edit-app-user": "打开中...",
      "manage-notify-channel": "打开中..."
    };
    await runGuardedButtonAction(
      target,
      {
        key: "admin:app-user:" + action + ":" + id,
        loadingText: loadingTextByAction[action] || "处理中..."
      },
      async () => {
        try {
          clearMessage();
          if (action === "edit-app-user" || action === "manage-notify-channel") {
            const currentUser = findAppUserById(id);
            if (!currentUser) {
              showMessage("用户不存在", true);
              return;
            }
            openAppUserEditModal(currentUser);
            if (action === "manage-notify-channel") {
              const channelCard = $("appEditChannelCard");
              if (channelCard) {
                setTimeout(() => {
                  try {
                    channelCard.scrollIntoView({ behavior: "smooth", block: "start" });
                  } catch (_error) {
                    // ignore scroll failure
                  }
                }, 40);
              }
            }
            return;
          }
        } catch (error) {
          showMessage("操作失败: " + error.message, true);
        }
      }
    );
  });

  if (appEditGroupAction) {
    appEditGroupAction.addEventListener("change", () => {
      syncAppUserGroupActionUi();
    });
  }
  if (btnAppUserEditClose) {
    btnAppUserEditClose.addEventListener("click", () => {
      closeAppUserEditModal();
    });
  }
  if (appUserEditModal) {
    appUserEditModal.addEventListener("click", (event) => {
      if (event.target === appUserEditModal) {
        closeAppUserEditModal();
      }
    });
  }
  if (btnAppUserEditSave) {
    btnAppUserEditSave.addEventListener("click", async (event) => {
      const targetUser = findAppUserById(appUserEditTargetId);
      if (!targetUser) {
        showMessage("用户不存在", true);
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:app-user-modal-save:" + targetUser.id, loadingText: "保存中..." },
        async () => {
          try {
            const status = String((appEditStatus && appEditStatus.value) || "").trim();
            const newPassword = String((appEditPassword && appEditPassword.value) || "");
            const groupAction = String(
              (appEditGroupAction && appEditGroupAction.value) || "none"
            ).trim();
            const groupIdRaw = String((appEditGroupId && appEditGroupId.value) || "").trim();
            const updatedParts = [];

            if (status && status !== String(targetUser.status || "")) {
              await window.DailyFlowWeb.api("/admin/users/" + targetUser.id, {
                method: "PATCH",
                body: { status }
              });
              updatedParts.push("状态");
            }
            if (newPassword) {
              await window.DailyFlowWeb.api("/admin/users/" + targetUser.id + "/password", {
                method: "PATCH",
                body: { password: newPassword }
              });
              updatedParts.push("密码");
            }
            if (groupAction === "assign" || groupAction === "remove") {
              const groupId = Number(groupIdRaw);
              if (!Number.isFinite(groupId) || groupId <= 0) {
                showMessage("请选择有效用户组", true);
                return;
              }
              await window.DailyFlowWeb.api(
                "/admin/users/" + targetUser.id + "/groups/" + groupId,
                { method: groupAction === "assign" ? "POST" : "DELETE" }
              );
              updatedParts.push(groupAction === "assign" ? "加入用户组" : "移出用户组");
            }

            if (!updatedParts.length) {
              showMessage("未检测到变更", true);
              return;
            }
            await loadAll();
            closeAppUserEditModal();
            showMessage("已更新: " + updatedParts.join("、"), false);
          } catch (error) {
            showMessage("操作失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (btnAppUserChannelCreate) {
    btnAppUserChannelCreate.addEventListener("click", async (event) => {
      const targetUser = findAppUserById(appUserEditTargetId);
      if (!targetUser) {
        showMessage("用户不存在", true);
        return;
      }
      const button = event.currentTarget;
      await runGuardedButtonAction(
        button,
        { key: "admin:create-user-channel:" + targetUser.id, loadingText: "创建中..." },
        async () => {
          try {
            const normalized = normalizeNotifySubmitInput(
              appEditChannelProvider && appEditChannelProvider.value
                ? appEditChannelProvider.value
                : "bark",
              appEditChannelBarkKey && appEditChannelBarkKey.value
                ? appEditChannelBarkKey.value
                : "",
              appEditChannelServerUrl && appEditChannelServerUrl.value
                ? appEditChannelServerUrl.value
                : "",
              { requiredKey: true }
            );
            await window.DailyFlowWeb.api(
              "/admin/users/" + targetUser.id + "/notification-channels",
              {
                method: "POST",
                body: {
                  name: String(appEditChannelName && appEditChannelName.value ? appEditChannelName.value : "").trim(),
                  provider: normalized.provider,
                  barkServerUrl: normalized.serverUrl,
                  barkDeviceKey: normalized.secretKey,
                  enabled: Boolean(appEditChannelEnabled && appEditChannelEnabled.checked)
                }
              }
            );
            if (appEditChannelName) {
              appEditChannelName.value = "";
            }
            if (appEditChannelProvider) {
              appEditChannelProvider.value = "bark";
            }
            if (appEditChannelBarkKey) {
              appEditChannelBarkKey.value = "";
            }
            if (appEditChannelServerUrl) {
              appEditChannelServerUrl.value = "";
            }
            if (appEditChannelEnabled) {
              appEditChannelEnabled.checked = true;
            }
            applyAppEditNotifyCreateProviderUi();
            await loadAppUserChannels(targetUser.id);
            await loadAll();
            showMessage("推送通道创建成功", false);
          } catch (error) {
            showMessage("创建推送通道失败: " + error.message, true);
          }
        }
      );
    });
  }
  if (appEditChannelList) {
    appEditChannelList.addEventListener("change", (event) => {
      const select = event.target.closest("select[id^='channel-provider-']");
      if (!select) {
        return;
      }
      const channelId = Number(String(select.id).replace("channel-provider-", ""));
      if (!Number.isFinite(channelId) || channelId <= 0) {
        return;
      }
      const serverInput = $("channel-server-" + channelId);
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
    appEditChannelList.addEventListener("click", async (event) => {
      const target = event.target.closest("button[data-action]");
      if (!target) {
        return;
      }
      const targetUser = findAppUserById(appUserEditTargetId);
      if (!targetUser) {
        showMessage("用户不存在", true);
        return;
      }
      const channelId = Number(target.dataset.channelId);
      if (!Number.isFinite(channelId) || channelId <= 0) {
        return;
      }
      const action = String(target.dataset.action || "");
      if (action === "test-channel") {
        await runGuardedButtonAction(
          target,
          { key: "admin:test-user-channel:" + targetUser.id + ":" + channelId, loadingText: "测试中..." },
          async () => {
            try {
              const payload = await window.DailyFlowWeb.api(
                "/admin/users/" + targetUser.id + "/notification-channels/" + channelId + "/test",
                {
                  method: "POST"
                }
              );
              const message =
                payload && payload.result && payload.result.message
                  ? String(payload.result.message)
                  : "测试消息已发送";
              showMessage(message, false);
            } catch (error) {
              showMessage("测试推送通道失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "save-channel") {
        await runGuardedButtonAction(
          target,
          { key: "admin:save-user-channel:" + targetUser.id + ":" + channelId, loadingText: "保存中..." },
          async () => {
            try {
              const normalized = normalizeNotifySubmitInput(
                String($("channel-provider-" + channelId).value || "bark"),
                String($("channel-key-" + channelId).value || ""),
                String($("channel-server-" + channelId).value || ""),
                { requiredKey: false }
              );
              await window.DailyFlowWeb.api(
                "/admin/users/" + targetUser.id + "/notification-channels/" + channelId,
                {
                  method: "PATCH",
                  body: {
                    name: String($("channel-name-" + channelId).value || "").trim(),
                    provider: normalized.provider,
                    barkServerUrl: normalized.serverUrl,
                    barkDeviceKey: normalized.secretKey || undefined,
                    enabled: String($("channel-enabled-" + channelId).value || "1") === "1"
                  }
                }
              );
              if ($("channel-key-" + channelId)) {
                $("channel-key-" + channelId).value = "";
              }
              await loadAppUserChannels(targetUser.id);
              await loadAll();
              showMessage("推送通道已更新", false);
            } catch (error) {
              showMessage("更新推送通道失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "delete-channel") {
        if (!window.confirm("确认删除该推送通道吗？已绑定该通道的签到账号会自动解绑。")) {
          return;
        }
        await runGuardedButtonAction(
          target,
          { key: "admin:delete-user-channel:" + targetUser.id + ":" + channelId, loadingText: "删除中..." },
          async () => {
            try {
              await window.DailyFlowWeb.api(
                "/admin/users/" + targetUser.id + "/notification-channels/" + channelId,
                {
                  method: "DELETE"
                }
              );
              await loadAppUserChannels(targetUser.id);
              await loadAll();
              showMessage("推送通道已删除", false);
            } catch (error) {
              showMessage("删除推送通道失败: " + error.message, true);
            }
          }
        );
      }
    });
  }

  if (adminOwnNotifyCreateForm) {
    adminOwnNotifyCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button =
        event.submitter ||
        btnAdminOwnNotifyCreate ||
        adminOwnNotifyCreateForm.querySelector('button[type="submit"]');
      await runGuardedButtonAction(
        button,
        { key: "admin:create-own-notify-channel", loadingText: "创建中..." },
        async () => {
          try {
            const ownerRaw = String(
              adminOwnNotifyOwnerId && adminOwnNotifyOwnerId.value
                ? adminOwnNotifyOwnerId.value
                : "admin"
            ).trim();
            await window.DailyFlowWeb.api("/admin/notification-channels", {
              method: "POST",
              body: {
                appUserId:
                ownerRaw === "admin"
                    ? "admin"
                    : Number.isFinite(Number(ownerRaw))
                      ? Number(ownerRaw)
                      : ownerRaw,
                name: String($("adminOwnNotifyName") && $("adminOwnNotifyName").value ? $("adminOwnNotifyName").value : "").trim(),
                ...(() => {
                  const normalized = normalizeNotifySubmitInput(
                    adminOwnNotifyProvider && adminOwnNotifyProvider.value
                      ? adminOwnNotifyProvider.value
                      : "bark",
                    getSensitiveInputRawValue($("adminOwnNotifyBarkKey")),
                    String(
                      $("adminOwnNotifyServerUrl") && $("adminOwnNotifyServerUrl").value
                        ? $("adminOwnNotifyServerUrl").value
                        : ""
                    ),
                    { requiredKey: true }
                  );
                  return {
                    provider: normalized.provider,
                    barkDeviceKey: normalized.secretKey,
                    barkServerUrl: normalized.serverUrl
                  };
                })(),
                enabled: true
              }
            });
            adminOwnNotifyCreateForm.reset();
            if (adminOwnNotifyProvider) {
              adminOwnNotifyProvider.value = "bark";
            }
            if ($("adminOwnNotifyBarkKey")) {
              $("adminOwnNotifyBarkKey").dataset.rawValue = "";
              $("adminOwnNotifyBarkKey").dataset.masked = "0";
            }
            applyAdminOwnNotifyCreateProviderUi();
            renderAdminNotifyOwnerSelect(ownerRaw || "admin");
            await loadAll();
            showMessage("推送通道创建成功", false);
          } catch (error) {
            showMessage("创建推送通道失败: " + error.message, true);
          }
        }
      );
    });
  }

  if (adminOwnNotifyTableBody) {
    adminOwnNotifyTableBody.addEventListener("change", (event) => {
      const select = event.target.closest("select[id^='admin-own-notify-provider-']");
      if (!select) {
        return;
      }
      const channelId = Number(String(select.id).replace("admin-own-notify-provider-", ""));
      if (!Number.isFinite(channelId) || channelId <= 0) {
        return;
      }
      const serverInput = $("admin-own-notify-server-" + channelId);
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
    adminOwnNotifyTableBody.addEventListener("click", async (event) => {
      const target = event.target.closest("button[data-action]");
      if (!target) {
        return;
      }
      const action = String(target.dataset.action || "");
      const channelId = Number(target.dataset.id);
      if (!Number.isFinite(channelId) || channelId <= 0) {
        return;
      }
      if (action === "edit-admin-own-notify-channel") {
        adminNotifyEditingById[channelId] = true;
        renderAdminOwnChannels();
        return;
      }
      if (action === "cancel-admin-own-notify-channel") {
        delete adminNotifyEditingById[channelId];
        renderAdminOwnChannels();
        return;
      }
      if (action === "test-admin-own-notify-channel") {
        await runGuardedButtonAction(
          target,
          { key: "admin:test-own-notify-channel:" + channelId, loadingText: "测试中..." },
          async () => {
            try {
              const payload = await window.DailyFlowWeb.api(
                "/admin/notification-channels/" + channelId + "/test",
                { method: "POST" }
              );
              const message =
                payload && payload.result && payload.result.message
                  ? String(payload.result.message)
                  : "测试消息已发送";
              showMessage(message, false);
            } catch (error) {
              showMessage("测试推送通道失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "copy-admin-own-notify-channel") {
        await runGuardedButtonAction(
          target,
          { key: "admin:copy-own-notify-channel:" + channelId, loadingText: "复制中...", cooldownMs: 600 },
          async () => {
            try {
              const channel = adminOwnChannels.find((row) => Number(row && row.id) === channelId);
              const raw = getNotifyChannelSecretRaw(channel);
              if (!raw) {
                showMessage("该通道未返回可复制的密钥（出于安全策略，请使用编辑后保存方式更新）", true);
                return;
              }
              await copyTextToClipboard(raw);
              showMessage("通道密钥已复制", false);
            } catch (error) {
              showMessage("复制通道密钥失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "save-admin-own-notify-channel") {
        await runGuardedButtonAction(
          target,
          { key: "admin:save-own-notify-channel:" + channelId, loadingText: "保存中..." },
          async () => {
            try {
              const normalized = normalizeNotifySubmitInput(
                String($("admin-own-notify-provider-" + channelId).value || "bark"),
                String($("admin-own-notify-key-" + channelId).value || ""),
                String($("admin-own-notify-server-" + channelId).value || ""),
                { requiredKey: false }
              );
              await window.DailyFlowWeb.api("/admin/notification-channels/" + channelId, {
                method: "PATCH",
                body: {
                  name: String($("admin-own-notify-name-" + channelId).value || "").trim(),
                  provider: normalized.provider,
                  barkDeviceKey: normalized.secretKey || undefined,
                  barkServerUrl: normalized.serverUrl,
                  enabled:
                    String($("admin-own-notify-enabled-" + channelId).value || "1") === "1"
                }
              });
              delete adminNotifyEditingById[channelId];
              await loadAll();
              showMessage("推送通道已更新", false);
            } catch (error) {
              showMessage("更新推送通道失败: " + error.message, true);
            }
          }
        );
        return;
      }
      if (action === "delete-admin-own-notify-channel") {
        if (!window.confirm("确认删除该推送通道吗？已绑定该通道的签到账号会自动解绑。")) {
          return;
        }
        await runGuardedButtonAction(
          target,
          { key: "admin:delete-own-notify-channel:" + channelId, loadingText: "删除中..." },
          async () => {
            try {
              await window.DailyFlowWeb.api("/admin/notification-channels/" + channelId, {
                method: "DELETE"
              });
              await loadAll();
              showMessage("推送通道已删除", false);
            } catch (error) {
              showMessage("删除推送通道失败: " + error.message, true);
            }
          }
        );
      }
    });
  }

  checkinUsersTableBody.addEventListener("click", async (event) => {
    const popoverTrigger = event.target.closest("button[data-action='toggle-execution-popover']");
    if (popoverTrigger) {
      const td = popoverTrigger.closest("td");
      if (!td) {
        return;
      }
      const popover = td.querySelector("[data-role='execution-popover']");
      if (!popover) {
        return;
      }
      const isHidden = popover.classList.contains("hidden");
      document
        .querySelectorAll("#checkinUsersTable [data-role='execution-popover']")
        .forEach((node) => node.classList.add("hidden"));
      if (isHidden) {
        popover.classList.remove("hidden");
      }
      return;
    }

    const target = event.target.closest("button[data-action]");
    if (!target) {
      return;
    }
    const action = target.dataset.action;
    const checkinUserId = Number(target.dataset.id);
    if (!action || !Number.isFinite(checkinUserId)) {
      return;
    }
    const loadingTextByAction = {
      "time-settings": "打开中...",
      "edit-checkin": "打开中...",
      "start-qr": "生成中...",
      "manual-run": "执行中...",
      "check-checkin-status": "检查中...",
      "view-logs": "加载中..."
    };
    await runGuardedButtonAction(
      target,
      {
        key: "admin:checkin-user:" + action + ":" + checkinUserId,
        loadingText: loadingTextByAction[action] || "处理中..."
      },
      async () => {
        try {
          clearMessage();
          if (action === "time-settings") {
            const targetUser = checkinUsers.find((u) => u.id === checkinUserId);
            if (!targetUser) {
              showMessage("签到账号不存在", true);
              return;
            }
            openCheckinTimeSettings(targetUser);
            showMessage("请修改自动签到时间和未签到告警时间。", false);
            return;
          }
          if (action === "edit-checkin") {
            const targetUser = checkinUsers.find((u) => u.id === checkinUserId);
            if (!targetUser) {
              showMessage("签到账号不存在", true);
              return;
            }
            openCheckinEditModal(targetUser);
            return;
          }
          if (action === "start-qr") {
            await startQrFlow(checkinUserId);
            showMessage("二维码会话已启动，请扫码", false);
            return;
          }
          if (action === "manual-run") {
            const runPayload = await window.DailyFlowWeb.api(
              "/admin/checkin-users/" + checkinUserId + "/manual-run",
              { method: "POST" }
            );
            const status = runPayload && runPayload.result ? runPayload.result.status : "unknown";
            const statusText = statusLabelZh(status);
            const message = runPayload && runPayload.result ? runPayload.result.message : "";
            const preview =
              runPayload && runPayload.result && runPayload.result.preview
                ? String(runPayload.result.preview).replace(/\s+/g, " ").slice(0, 120)
                : "";
            const hint =
              status === "failed" && preview ? " | 页面预览: " + preview : "";
            showMessage("手动执行完成: " + statusText + (message ? " - " + message : "") + hint, false);
            await loadAll();
            return;
          }
          if (action === "check-checkin-status") {
            const result = await refreshCheckinStatusForUser(checkinUserId);
            const status = String(result && result.status ? result.status : "unknown");
            const message = String(result && result.message ? result.message : "");
            renderCheckinUsers();
            showMessage(
              "签到状态检查: " +
                checkinStatusLabel(status) +
                (message ? " - " + message : ""),
              status === "error" || status === "auth_missing" || status === "auth_expired" || status === "invalid_state"
            );
            return;
          }
          if (action === "view-logs") {
            const targetUser = checkinUsers.find((u) => u.id === checkinUserId);
            if (!targetUser) {
              showMessage("签到账号不存在", true);
              return;
            }
            openLogModal(
              checkinUserId,
              String(targetUser.userKey || "-") + " / " + String(targetUser.displayName || "-")
            );
            await loadCheckinLogs(checkinUserId);
            return;
          }
        } catch (error) {
          showMessage("操作失败: " + error.message, true);
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
          key: "admin:refresh-cookie-status-all",
          loadingText: "刷新中...",
          cooldownMs: 1400
        },
        async () => {
          try {
            clearMessage();
            await refreshCookieStatusForAll();
          } catch (error) {
            showMessage("刷新状态失败: " + error.message, true);
          }
        }
      );
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".execution-popover-trigger") || event.target.closest("[data-role='execution-popover']")) {
      return;
    }
    document
      .querySelectorAll("#checkinUsersTable [data-role='execution-popover']")
      .forEach((node) => node.classList.add("hidden"));
  });

  menuGroupToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const key = String(toggle.dataset.menuGroup || "");
      if (!key) {
        return;
      }
      const subList = document.querySelector(`[data-menu-sub-list="${key}"]`);
      const next = !(subList && subList.classList.contains("open"));
      setMenuGroupOpen(key, next);
    });
  });

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.menuTarget;
      if (target) {
        switchPanel(target);
      }
    });
  });
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
      if (appUserEditModal && !appUserEditModal.classList.contains("hidden")) {
        closeAppUserEditModal();
        return;
      }
      if (logDetailModal && !logDetailModal.classList.contains("hidden")) {
        closeLogDetailModal();
        return;
      }
      if (logModal && !logModal.classList.contains("hidden")) {
        closeLogModal();
        return;
      }
      if (checkinEditModal && !checkinEditModal.classList.contains("hidden")) {
        closeCheckinEditModal();
        return;
      }
      const visiblePopover = document.querySelector("#checkinUsersTable [data-role='execution-popover']:not(.hidden)");
      if (visiblePopover) {
        visiblePopover.classList.add("hidden");
        return;
      }
      setSidebarOpen(false);
    }
  });

  async function init() {
    try {
      const me = await window.DailyFlowWeb.fetchMe();
      if (!me || !me.user || me.user.role !== "admin") {
        location.replace("/web/user");
        return;
      }
      $("currentUser").textContent = me.user.username || "admin";
      switchPanel("panel-overview");
      applyGroupMaxModeUi();
      applyAdminOwnNotifyCreateProviderUi();
      applyAppEditNotifyCreateProviderUi();
      syncRefreshButtonMeta();
      await Promise.all([loadAll(), loadDebugMode()]);
    } catch (_error) {
      logout();
    }
  }

  init();
})();
