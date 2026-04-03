const fs = require("fs");
const path = require("path");

function isDingLoginPage(url) {
  if (!url) {
    return false;
  }
  return /login\.dingtalk\.com/i.test(url);
}

const REMEMBER_LOGIN_CHECKED_SELECTORS = [
  ".module-qrcode-op-item .dingtalk-login-icon-checkbox-done",
  ".module-qrcode-op-item .base-comp-check-box-rememberme-box.active",
  ".module-pass-login-op-item-rememberme .dingtalk-login-icon-checkbox-done",
  ".module-pass-login-op-item-rememberme .base-comp-check-box-rememberme-box.active",
  ".module-login-name-op-item-rememberme .dingtalk-login-icon-checkbox-done",
  ".module-sso-login-op-item-rememberme .dingtalk-login-icon-checkbox-done",
  ".module-onestep-login-op-item-rememberme .dingtalk-login-icon-checkbox-done"
];

const REMEMBER_LOGIN_CLICK_TARGET_SELECTORS = [
  ".module-qrcode-op-item:has-text('自动登录')",
  ".module-qrcode-op-item:has-text('保持登录')",
  ".module-qrcode-op-item:has-text('记住我')",
  ".module-pass-login-op-item-rememberme",
  ".module-login-name-op-item-rememberme",
  ".module-sso-login-op-item-rememberme",
  ".module-onestep-login-op-item-rememberme",
  ".base-comp-check-box:has-text('自动登录')",
  ".base-comp-check-box:has-text('保持登录')",
  ".base-comp-check-box:has-text('记住我')",
  "label:has-text('自动登录')",
  "label:has-text('保持登录')",
  "label:has-text('记住我')"
];

const REMEMBER_LOGIN_UNDONE_ICON_SELECTORS = [
  ".module-qrcode-op-item .dingtalk-login-icon-checkbox-undone",
  ".module-pass-login-op-item-rememberme .dingtalk-login-icon-checkbox-undone",
  ".module-login-name-op-item-rememberme .dingtalk-login-icon-checkbox-undone",
  ".module-sso-login-op-item-rememberme .dingtalk-login-icon-checkbox-undone",
  ".module-onestep-login-op-item-rememberme .dingtalk-login-icon-checkbox-undone",
  ".base-comp-check-box:has-text('自动登录') .dingtalk-login-icon-checkbox-undone",
  ".base-comp-check-box:has-text('保持登录') .dingtalk-login-icon-checkbox-undone",
  ".base-comp-check-box:has-text('记住我') .dingtalk-login-icon-checkbox-undone"
];

async function isRememberLoginChecked(page) {
  for (const selector of REMEMBER_LOGIN_CHECKED_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count <= 0) {
      continue;
    }
    try {
      if (await locator.isVisible()) {
        return true;
      }
    } catch (_error) {
      // ignore and try next selector
    }
  }
  return false;
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count <= 0) {
      continue;
    }
    try {
      if (!(await locator.isVisible())) {
        continue;
      }
      await locator.click({ timeout: 1200 });
      return true;
    } catch (_error) {
      // ignore and try next selector
    }
  }
  return false;
}

async function ensureRememberLoginChecked(page) {
  if (!isDingLoginPage(page.url())) {
    return { found: false, checked: false, clicked: false };
  }
  let found = false;
  let clicked = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await isRememberLoginChecked(page)) {
      return { found: true, checked: true, clicked };
    }
    const clickedByText = await clickFirstVisible(page, REMEMBER_LOGIN_CLICK_TARGET_SELECTORS);
    const clickedByIcon = clickedByText
      ? false
      : await clickFirstVisible(page, REMEMBER_LOGIN_UNDONE_ICON_SELECTORS);
    if (!clickedByText && !clickedByIcon) {
      break;
    }
    found = true;
    clicked = true;
    await page.waitForTimeout(220);
  }
  return { found, checked: await isRememberLoginChecked(page), clicked };
}

async function tryCaptureQr(page, outputPath) {
  const selectors = [
    "canvas",
    "img[alt*=二维码]",
    ".module-qrcode",
    ".qrcode",
    "#qrcode"
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count > 0) {
      try {
        await locator.screenshot({ path: outputPath });
        return true;
      } catch (_error) {
        // ignore and fallback
      }
    }
  }

  await page.screenshot({ path: outputPath, fullPage: true });
  return false;
}

async function waitForLoginComplete(page, timeoutMs) {
  const begin = Date.now();
  while (Date.now() - begin < timeoutMs) {
    const current = page.url();
    if (!isDingLoginPage(current)) {
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function ensureAuthenticated({
  page,
  user,
  repo,
  notifier,
  notifyOptions,
  artifactsDir,
  loginWaitTimeoutMs,
  logger
}) {
  if (!isDingLoginPage(page.url())) {
    return;
  }

  fs.mkdirSync(artifactsDir, { recursive: true });
  const fileName = `${user.user_key}-qr-${Date.now()}.png`;
  const qrPath = path.join(artifactsDir, fileName);

  await ensureRememberLoginChecked(page).catch(() => ({
    found: false,
    checked: false,
    clicked: false
  }));
  await tryCaptureQr(page, qrPath);
  await notifier.sendQrImage(user, qrPath, notifyOptions || {});
  await notifier.sendText(
    user,
    "登录态失效，请重新扫码",
    `检测到 Cookie 已失效或需要重新认证，请在 ${Math.floor(loginWaitTimeoutMs / 1000)} 秒内完成扫码登录。`,
    notifyOptions || {}
  );

  logger.info("waiting for qr login", { user: user.user_key, qrPath });
  const ok = await waitForLoginComplete(page, loginWaitTimeoutMs);
  if (!ok) {
    throw new Error("扫码登录超时");
  }

  const storageState = await page.context().storageState();
  repo.upsertAuthState({
    user_id: user.id,
    storage_state_json: JSON.stringify(storageState),
    passkey_credential_json: null
  });
}

module.exports = {
  isDingLoginPage,
  ensureRememberLoginChecked,
  ensureAuthenticated
};
