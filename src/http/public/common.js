(function initCommon() {
  const TOKEN_KEY = "daily_flow_auth_token";
  const LEGACY_TOKEN_KEY = "yida_auth_token";

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, String(token || ""));
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || "";
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asDateInputValue(value) {
    if (!value) {
      return "";
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return "";
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    let body = opts.body;
    if (body && typeof body === "object" && !(body instanceof FormData)) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(body);
    }

    const response = await fetch(path, {
      method: opts.method || "GET",
      headers,
      body
    });

    const contentType = response.headers.get("content-type") || "";
    let payload;
    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && payload.error
          ? payload.error
          : "HTTP " + response.status;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function fetchMe() {
    return api("/auth/me");
  }

  function redirectByRole(role) {
    if (role === "admin") {
      location.replace("/web/admin");
      return;
    }
    location.replace("/web/user");
  }

  const apiBridge = {
    setToken,
    getToken,
    clearToken,
    escapeHtml,
    asDateInputValue,
    api,
    fetchMe,
    redirectByRole
  };

  window.DailyFlowWeb = apiBridge;
  window.YidaWeb = apiBridge;
})();
