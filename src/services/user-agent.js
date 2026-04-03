function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHexChar() {
  const chars = "abcdef";
  return chars.charAt(randomInt(0, chars.length - 1));
}

function generateIosDingTalkUserAgent() {
  const iosMajor = 26;
  const iosMinor = randomInt(3, 6);
  const dingtalkPatch = randomInt(4, 7);
  const appBuild = randomInt(53930000, 53999999);
  const mobileBuild = `23E${randomInt(1200, 9999)}${randomHexChar()}`;

  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosMajor}_${iosMinor} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/${mobileBuild} AliApp(DingTalk/8.3.${dingtalkPatch}) com.laiwang.DingTalk/${appBuild} Channel/20`;
}

function normalizeProfile(profile) {
  return String(profile || "ios")
    .trim()
    .toLowerCase();
}

function listUaProfiles() {
  return [
    {
      id: "ios",
      label: "iOS DingTalk",
      enabled: true
    }
  ];
}

function generateUserAgentByProfile(profile) {
  const safeProfile = normalizeProfile(profile);
  if (safeProfile === "ios") {
    return generateIosDingTalkUserAgent();
  }
  throw new Error(`unsupported ua profile: ${safeProfile}`);
}

module.exports = {
  listUaProfiles,
  generateUserAgentByProfile
};
