const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./utils/logger");
const { initDatabase } = require("./db");
const { createRepository } = require("./db/repository");
const { Notifier } = require("./services/notifier");
const { CheckinWorker } = require("./worker/checkin-worker");
const { CheckinScheduler } = require("./scheduler");
const { JwtService } = require("./security/jwt-service");
const { AdminSecretManager } = require("./security/admin-secret-manager");
const { createAuthHttpServer } = require("./http/auth-http-server");
const { IpLookupService } = require("./services/ip-lookup");
const { WebQrSessionManager } = require("./services/web-qr-session-manager");
const { runStartupGitGuard, installPreCommitHook } = require("./security/git-guard");
const { hashPassword } = require("./security/password");
const { createMonitorServer } = require("./health/monitor-server");
const { promptHidden } = require("./utils/secure-prompt");
const { writeDefaultEnvFile } = require("./default-env-template");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(name) {
  const hit = process.argv.find((item) => item.startsWith(`${name}=`));
  if (!hit) {
    return null;
  }
  return hit.slice(name.length + 1);
}

async function seedDemo(repo) {
  let checkinUser = repo.getUserByKey("demo_user");
  if (!checkinUser) {
    const inserted = repo.insertUser({
      user_key: "demo_user",
      display_name: "示例账号",
      enabled: 1,
      debug_mode: 0,
      cron_expr: "10 0 21 * * *",
      timezone: config.defaultTimezone,
      target_url: config.defaultTargetUrl,
      user_agent: config.defaultUserAgent || null,
      checkin_button_text: config.defaultCheckinButtonText,
      signed_marker_text: config.defaultSignedMarkerText,
      location_refresh_text: config.defaultLocationRefreshText,
      radio_option_text: "校内",
      warning_time: "23:00",
      auto_checkin_pause_until: null
    });
    checkinUser = repo.getUserByKey("demo_user");

    repo.upsertLocationProfile({
      user_id: inserted.lastInsertRowid,
      name: "default",
      latitude: 23.313946,
      longitude: 113.569955,
      accuracy: 20,
      altitude: 14.2,
      altitude_accuracy: 1.8,
      heading: 96.4,
      speed: 0,
      coord_system: "auto",
      source: "seed"
    });
  }

  const appUserExists = repo.getAppUserByUsername("demo_app_user");
  if (!appUserExists) {
    const passwordHash = await hashPassword("demo123456");
    repo.createAppUser({
      username: "demo_app_user",
      password_hash: passwordHash,
      role: "user",
      status: "active",
      purchased_at: null,
      expires_at: null
    });
  }

  logger.info("seed demo done", {
    checkinUserId: checkinUser ? checkinUser.id : null
  });
}

async function runOnce(worker, repo) {
  const userKey = getArgValue("--user");
  let users = [];

  if (userKey) {
    const user = repo.getUserByKey(userKey);
    if (!user) {
      throw new Error(`user not found: ${userKey}`);
    }
    users = [user];
  } else {
    users = repo.listEnabledUsers();
  }

  for (const user of users) {
    await worker.runUserCheckin(user, {
      force: true,
      trigger: "cli_once"
    });
  }
}

function ensureDefaultGroups(repo, logger) {
  const defaults = [
    {
      name: "admin",
      description: "管理员组（不限制创建签到账号）",
      max_checkin_accounts: null
    },
    {
      name: "user",
      description: "普通用户组（默认不可创建签到账号）",
      max_checkin_accounts: 0
    }
  ];

  for (const group of defaults) {
    const existing = repo.getGroupByName(group.name);
    if (existing) {
      continue;
    }
    repo.createGroup(group);
    logger.info("default group created", {
      name: group.name
    });
  }

  const adminGroup = repo.getGroupByName("admin");
  const userGroup = repo.getGroupByName("user");
  const appUsers = repo.listAppUsers();
  for (const appUser of appUsers) {
    const assignedGroups = repo.listGroupsByUserId(appUser.id);
    if (assignedGroups.length > 0) {
      continue;
    }
    const targetGroup =
      appUser.role === "admin" && adminGroup ? adminGroup : userGroup;
    if (!targetGroup) {
      continue;
    }
    repo.assignGroup(appUser.id, targetGroup.id);
    logger.info("default group assigned", {
      userId: appUser.id,
      group: targetGroup.name
    });
  }
}

async function main() {
  if (hasFlag("--set-admin-password")) {
    const envPath = config.envPath || path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
      const envExamplePath = path.resolve(process.cwd(), ".env.example");
      if (fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
      } else {
        writeDefaultEnvFile(envPath);
      }
      try {
        fs.chmodSync(envPath, 0o600);
      } catch (_error) {
        // ignore chmod failure
      }
    }

    const adminSecretManager = new AdminSecretManager({
      envPath,
      keyName: "ADMIN_PASSWORD_HASH",
      initialValue: config.adminPasswordHash,
      logger
    });
    const first = await promptHidden("Input new admin password");
    const second = await promptHidden("Repeat new admin password");
    if (first !== second) {
      throw new Error("password mismatch");
    }
    await adminSecretManager.setPlaintextPassword(first);
    logger.info("admin password updated");
    return;
  }

  if (hasFlag("--install-git-hook")) {
    try {
      installPreCommitHook({
        logger,
        cwd: process.cwd()
      });
    } catch (error) {
      logger.warn("install git hook skipped", { error: error.message });
    }
    return;
  }

  if (hasFlag("--check-git-guard")) {
    runStartupGitGuard({
      enabled: true,
      strict: true,
      logger,
      cwd: process.cwd()
    });
    logger.info("git guard check passed");
    return;
  }

  runStartupGitGuard({
    enabled: config.gitGuardEnabled,
    strict: config.gitGuardStrict,
    logger,
    cwd: process.cwd()
  });

  const db = initDatabase(config.dbPath);
  const repo = createRepository(db);
  repo.trimCheckinLogsAll(15);
  ensureDefaultGroups(repo, logger);
  const notifier = new Notifier({
    provider: config.notifierProvider,
    webhook: config.notifierWebhook,
    barkServerUrl: config.barkServerUrl,
    barkDeviceKey: config.barkDeviceKey,
    barkGroup: config.barkGroup,
    serverChanServerUrl: config.serverChanServerUrl,
    logger
  });

  if (hasFlag("--init-db")) {
    logger.info("database initialized", { dbPath: config.dbPath });
    return;
  }

  if (hasFlag("--seed-demo")) {
    await seedDemo(repo);
    return;
  }

  const adminSecretManager = new AdminSecretManager({
    envPath: config.envPath,
    keyName: "ADMIN_PASSWORD_HASH",
    initialValue: config.adminPasswordHash,
    logger
  });
  await adminSecretManager.ensureHashed();
  adminSecretManager.startWatch();

  const worker = new CheckinWorker({
    config,
    repo,
    notifier,
    logger
  });

  if (hasFlag("--once")) {
    await runOnce(worker, repo);
    adminSecretManager.stopWatch();
    return;
  }

  const scheduler = new CheckinScheduler({
    repo,
    worker,
    notifier,
    logger,
    defaultTimezone: config.defaultTimezone
  });
  const monitorServer = createMonitorServer({
    port: config.healthPort,
    logger
  });

  const jwtService = new JwtService({
    secret: config.jwtSecret,
    ttlHours: config.jwtTtlHours
  });
  const ipLookupService = new IpLookupService({
    provider: config.ipLookupProvider,
    timeoutMs: config.ipLookupTimeoutMs
  });
  const qrSessionManager = new WebQrSessionManager({
    repo,
    config,
    logger
  });
  const httpServer = createAuthHttpServer({
    config,
    repo,
    worker,
    notifier,
    jwtService,
    adminSecretManager,
    ipLookupService,
    qrSessionManager,
    logger
  });

  await monitorServer.start();
  scheduler.start();
  await httpServer.start();

  const shutdown = async () => {
    try {
      scheduler.stop();
      adminSecretManager.stopWatch();
      await httpServer.stop();
      await monitorServer.stop();
    } catch (error) {
      logger.warn("shutdown warning", { error: error.message });
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("fatal", { error: error.message, stack: error.stack });
  process.exit(1);
});
