async function injectSavedPasskey(_browserContext, _passkeyCredentialJson) {
  // TODO: 预留 Passkey 注入逻辑（Virtual Authenticator / CDP）
  return false;
}

async function registerPasskeyAfterLogin(_browserContext) {
  // TODO: 预留 Passkey 注册逻辑（扫码后自动注册并回写数据库）
  return null;
}

module.exports = {
  injectSavedPasskey,
  registerPasskeyAfterLogin
};
