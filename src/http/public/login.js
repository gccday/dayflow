(function initLoginPage() {
  const msgEl = document.getElementById("loginMsg");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const registerInviteWrap = document.getElementById("registerInviteWrap");
  const registerHint = document.getElementById("registerHint");

  let registerOptions = {
    registrationEnabled: false,
    requireInvite: false,
    defaultGroupName: ""
  };

  function showMsg(text, isError) {
    msgEl.textContent = text || "";
    msgEl.classList.remove("hidden", "ok", "error");
    msgEl.classList.add(isError ? "error" : "ok");
  }

  function clearMsg() {
    msgEl.textContent = "";
    msgEl.classList.remove("ok", "error");
    msgEl.classList.add("hidden");
  }

  function switchTab(mode) {
    const isRegister = mode === "register";
    loginForm.classList.toggle("hidden", isRegister);
    registerForm.classList.toggle("hidden", !isRegister);
    tabLogin.classList.toggle("bg-white", !isRegister);
    tabLogin.classList.toggle("text-slate-800", !isRegister);
    tabLogin.classList.toggle("shadow-sm", !isRegister);
    tabLogin.classList.toggle("text-slate-500", isRegister);
    tabRegister.classList.toggle("bg-white", isRegister);
    tabRegister.classList.toggle("text-slate-800", isRegister);
    tabRegister.classList.toggle("shadow-sm", isRegister);
    tabRegister.classList.toggle("text-slate-500", !isRegister);
    clearMsg();
  }

  function applyRegisterOptions() {
    const enabled = Boolean(registerOptions.registrationEnabled);
    const requireInvite = Boolean(registerOptions.requireInvite);
    tabRegister.disabled = !enabled;
    tabRegister.classList.toggle("opacity-50", !enabled);
    tabRegister.classList.toggle("cursor-not-allowed", !enabled);
    registerInviteWrap.classList.toggle("hidden", !requireInvite);
    if (!enabled) {
      registerHint.textContent = "当前未开放注册，请联系管理员创建账号。";
    } else if (requireInvite) {
      registerHint.textContent = "注册需要邀请码，请向管理员获取。";
    } else {
      registerHint.textContent = "注册成功后会自动分配到默认用户组。";
    }
    if (!enabled && !loginForm.classList.contains("hidden")) {
      return;
    }
    if (!enabled) {
      switchTab("login");
    }
  }

  async function loadRegisterOptions() {
    try {
      const payload = await window.DailyFlowWeb.api("/auth/register-options");
      registerOptions = {
        registrationEnabled: Boolean(payload && payload.registrationEnabled),
        requireInvite: Boolean(payload && payload.requireInvite),
        defaultGroupName:
          payload && payload.defaultGroupName ? String(payload.defaultGroupName) : ""
      };
    } catch (_error) {
      registerOptions = {
        registrationEnabled: false,
        requireInvite: false,
        defaultGroupName: ""
      };
    }
    applyRegisterOptions();
  }

  async function tryAutoLogin() {
    const token = window.DailyFlowWeb.getToken();
    if (!token) {
      return;
    }
    try {
      const me = await window.DailyFlowWeb.fetchMe();
      window.DailyFlowWeb.redirectByRole(me.user.role);
    } catch (_error) {
      window.DailyFlowWeb.clearToken();
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    if (!username || !password) {
      showMsg("请输入用户名和密码", true);
      return;
    }
    try {
      showMsg("登录中...", false);
      const payload = await window.DailyFlowWeb.api("/auth/login", {
        method: "POST",
        body: { username, password }
      });
      window.DailyFlowWeb.setToken(payload.token);
      showMsg("登录成功，正在跳转...", false);
      window.DailyFlowWeb.redirectByRole(payload.user.role);
    } catch (error) {
      showMsg("登录失败: " + error.message, true);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!registerOptions.registrationEnabled) {
      showMsg("当前未开放注册", true);
      return;
    }
    const username = String(document.getElementById("registerUsername").value || "").trim();
    const password = String(document.getElementById("registerPassword").value || "");
    const confirm = String(document.getElementById("registerPasswordConfirm").value || "");
    const inviteCode = String(document.getElementById("registerInviteCode").value || "").trim();
    if (!username || !password) {
      showMsg("请输入用户名和密码", true);
      return;
    }
    if (password.length < 6) {
      showMsg("密码至少 6 位", true);
      return;
    }
    if (password !== confirm) {
      showMsg("两次输入的密码不一致", true);
      return;
    }
    if (registerOptions.requireInvite && !inviteCode) {
      showMsg("请输入邀请码", true);
      return;
    }
    try {
      showMsg("注册中...", false);
      await window.DailyFlowWeb.api("/auth/register", {
        method: "POST",
        body: {
          username,
          password,
          inviteCode: inviteCode || null
        }
      });
      registerForm.reset();
      showMsg("注册成功，请使用新账号登录", false);
      switchTab("login");
      const loginUsername = document.getElementById("username");
      if (loginUsername) {
        loginUsername.value = username;
      }
    } catch (error) {
      showMsg("注册失败: " + error.message, true);
    }
  });

  tabLogin.addEventListener("click", () => switchTab("login"));
  tabRegister.addEventListener("click", () => {
    if (!registerOptions.registrationEnabled) {
      showMsg("当前未开放注册", true);
      return;
    }
    switchTab("register");
  });

  switchTab("login");
  loadRegisterOptions();
  tryAutoLogin();
})();
