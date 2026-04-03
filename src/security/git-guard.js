const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SENSITIVE_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /^data\//,
  /\.sqlite$/i,
  /\.db$/i
];

function isSensitivePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  if (normalized === ".env.example") {
    return false;
  }
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function safeExec(command, cwd) {
  try {
    return execSync(command, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();
  } catch (_error) {
    return "";
  }
}

function getGitRoot(cwd) {
  const root = safeExec("git rev-parse --show-toplevel", cwd);
  return root || "";
}

function listTrackedSensitiveFiles(cwd) {
  const output = safeExec("git ls-files", cwd);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((file) => isSensitivePath(file));
}

function listStagedSensitiveFiles(cwd) {
  const output = safeExec("git diff --cached --name-only", cwd);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((file) => isSensitivePath(file));
}

function buildFixHint(files) {
  const cmdList = files.map((file) => `git rm --cached "${file}"`).join("\n");
  return `Detected tracked sensitive files.\n${files.join("\n")}\n\nUse:\n${cmdList}`;
}

function runStartupGitGuard({ enabled, strict, logger, cwd }) {
  if (!enabled) {
    return;
  }

  const gitRoot = getGitRoot(cwd);
  if (!gitRoot) {
    return;
  }

  const files = listTrackedSensitiveFiles(cwd);
  if (files.length === 0) {
    return;
  }

  const message = buildFixHint(files);
  if (strict) {
    throw new Error(message);
  }

  logger.warn("git guard warning", { message });
}

function installPreCommitHook({ logger, cwd }) {
  const gitRoot = getGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("not a git repository");
  }

  const hooksDir = path.join(gitRoot, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, "pre-commit");
  const scriptPath = path.resolve(cwd, "src/security/precommit-check.js");
  const hookBody = `#!/bin/sh
node "${scriptPath}"
status=$?
if [ $status -ne 0 ]; then
  exit $status
fi
exit 0
`;
  fs.writeFileSync(hookPath, hookBody, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);
  logger.info("pre-commit hook installed", { hookPath });
}

module.exports = {
  isSensitivePath,
  listTrackedSensitiveFiles,
  listStagedSensitiveFiles,
  runStartupGitGuard,
  installPreCommitHook
};
