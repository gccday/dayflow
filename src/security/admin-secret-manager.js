const fs = require("fs");
const path = require("path");

const { isArgon2Hash, hashPassword, verifyPassword } = require("./password");

class AdminSecretManager {
  constructor({ envPath, keyName, initialValue, logger }) {
    this.envPath = envPath;
    this.keyName = keyName;
    this.currentHash = initialValue || "";
    this.logger = logger;
    this.watcher = null;
    this.debounceTimer = null;
    this.rewriteLock = false;
  }

  getHash() {
    return this.currentHash || "";
  }

  async verify(plain) {
    if (!this.currentHash || !isArgon2Hash(this.currentHash)) {
      return false;
    }
    return verifyPassword(this.currentHash, plain);
  }

  async ensureHashed() {
    const raw = this.readRawValueFromEnv();
    if (!raw) {
      throw new Error(`${this.keyName} is empty in .env`);
    }

    if (isArgon2Hash(raw)) {
      this.currentHash = raw;
      process.env[this.keyName] = raw;
      return;
    }

    const hashed = await hashPassword(raw);
    this.currentHash = hashed;
    process.env[this.keyName] = hashed;
    this.writeValueToEnv(hashed);
    this.logger.info("admin secret auto-hashed");
  }

  async setPlaintextPassword(plain) {
    if (!plain || !String(plain).trim()) {
      throw new Error("password cannot be empty");
    }
    const raw = String(plain);
    if (raw.length < 8) {
      throw new Error("password must be at least 8 characters");
    }
    const hashed = await hashPassword(raw);
    this.currentHash = hashed;
    process.env[this.keyName] = hashed;
    this.writeValueToEnv(hashed);
  }

  startWatch() {
    if (!this.envPath || !fs.existsSync(this.envPath)) {
      return;
    }

    if (this.watcher) {
      return;
    }

    this.watcher = fs.watch(this.envPath, () => {
      if (this.rewriteLock) {
        return;
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(async () => {
        try {
          await this.ensureHashed();
        } catch (error) {
          this.logger.warn("admin secret watch update failed", {
            error: error.message
          });
        }
      }, 400);
    });
  }

  stopWatch() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  readRawValueFromEnv() {
    const envPath = this.envPath || path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
      return process.env[this.keyName] || "";
    }

    const content = fs.readFileSync(envPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const idx = trimmed.indexOf("=");
      if (idx <= 0) {
        continue;
      }
      const key = trimmed.slice(0, idx).trim();
      if (key !== this.keyName) {
        continue;
      }
      const value = trimmed.slice(idx + 1);
      return value.trim();
    }
    return process.env[this.keyName] || "";
  }

  writeValueToEnv(value) {
    const envPath = this.envPath || path.resolve(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf8");
    }

    const lines = content ? content.split(/\r?\n/) : [];
    let replaced = false;
    const output = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }
      const idx = line.indexOf("=");
      if (idx <= 0) {
        return line;
      }
      const key = line.slice(0, idx).trim();
      if (key !== this.keyName) {
        return line;
      }
      replaced = true;
      return `${this.keyName}=${value}`;
    });

    if (!replaced) {
      output.push(`${this.keyName}=${value}`);
    }

    this.rewriteLock = true;
    fs.writeFileSync(envPath, `${output.join("\n").replace(/\n+$/, "")}\n`, "utf8");
    try {
      fs.chmodSync(envPath, 0o600);
    } catch (_error) {
      // ignore chmod failure on unsupported fs
    }
    setTimeout(() => {
      this.rewriteLock = false;
    }, 300);
  }
}

module.exports = {
  AdminSecretManager
};
