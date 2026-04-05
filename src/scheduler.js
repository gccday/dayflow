const schedule = require("node-schedule");
const { compareHHmm, nowInTz } = require("./utils/time");

const AUTO_CHECKIN_JITTER_MAX_MINUTES = 5;
const MINUTES_PER_DAY = 24 * 60;
const JITTER_RUN_DEDUP_TTL_MS = 48 * 60 * 60 * 1000;

function normalizeWarningTime(value, fallback = "23:00") {
  const fallbackText = String(fallback || "23:00").trim() || "23:00";
  const tryParse = (raw) => {
    const text = String(raw || "").trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) {
      return null;
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
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
  };
  return tryParse(value) || tryParse(fallbackText) || "23:00";
}

function isAutoCheckinPaused(user, dateText) {
  const pauseUntil = String(user && user.auto_checkin_pause_until ? user.auto_checkin_pause_until : "").trim();
  const date = String(dateText || "").trim();
  if (!pauseUntil || !/^\d{4}-\d{2}-\d{2}$/.test(pauseUntil) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  return date <= pauseUntil;
}

function parseCheckinCronExpr(cronExpr) {
  const text = String(cronExpr || "").trim();
  const parts = text.split(/\s+/);
  if (parts.length !== 6) {
    return null;
  }
  const second = Number(parts[0]);
  const minute = Number(parts[1]);
  const hour = Number(parts[2]);
  if (
    !Number.isInteger(second) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(hour) ||
    second < 0 ||
    second > 59 ||
    minute < 0 ||
    minute > 59 ||
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }
  return {
    second,
    minute,
    hour,
    dayOfMonth: parts[3],
    month: parts[4],
    dayOfWeek: parts[5],
    baseHHmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  };
}

function buildCheckinPollCronExpr(cronExpr) {
  const parsed = parseCheckinCronExpr(cronExpr);
  if (!parsed) {
    return null;
  }
  return `${parsed.second} * * ${parsed.dayOfMonth} ${parsed.month} ${parsed.dayOfWeek}`;
}

function parseHHmmToMinutes(value) {
  const text = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
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
  return hour * 60 + minute;
}

function formatMinutesToHHmm(totalMinutes) {
  const safeMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Number(totalMinutes) || 0));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function hashText(text) {
  let hash = 2166136261;
  const raw = String(text || "");
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getAutoCheckinJitterPlan(userId, dateText, baseHHmm) {
  const baseMinutes = parseHHmmToMinutes(baseHHmm);
  if (baseMinutes === null) {
    return null;
  }
  const rawOffset =
    (hashText(`${Number(userId) || 0}:${String(dateText || "")}`) %
      (AUTO_CHECKIN_JITTER_MAX_MINUTES * 2 + 1)) -
    AUTO_CHECKIN_JITTER_MAX_MINUTES;
  const targetMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - 1, baseMinutes + rawOffset));
  return {
    baseHHmm,
    offsetMinutes: targetMinutes - baseMinutes,
    targetHHmm: formatMinutesToHHmm(targetMinutes)
  };
}

class CheckinScheduler {
  constructor({ repo, worker, notifier, logger, defaultTimezone }) {
    this.repo = repo;
    this.worker = worker;
    this.notifier = notifier;
    this.logger = logger;
    this.defaultTimezone = defaultTimezone;
    this.userJobs = new Map();
    this.watchdogJob = null;
    this.syncJob = null;
    this.watchdogAlertSet = new Set();
    this.jitterRunKeyTimestamps = new Map();
  }

  start() {
    this.syncUserJobs();
    this.scheduleSyncJob();
    this.scheduleWatchdogJob();
    this.logger.info("scheduler started", { userCount: this.userJobs.size });
  }

  stop() {
    if (this.syncJob) {
      this.syncJob.cancel();
      this.syncJob = null;
    }
    if (this.watchdogJob) {
      this.watchdogJob.cancel();
      this.watchdogJob = null;
    }
    for (const { job } of this.userJobs.values()) {
      job.cancel();
    }
    this.userJobs.clear();
    this.logger.info("scheduler stopped");
  }

  pruneJitterRunKeys() {
    const cutoff = Date.now() - JITTER_RUN_DEDUP_TTL_MS;
    for (const [key, timestamp] of this.jitterRunKeyTimestamps.entries()) {
      if (!Number.isFinite(timestamp) || timestamp < cutoff) {
        this.jitterRunKeyTimestamps.delete(key);
      }
    }
  }

  tryMarkJitterRunKey(runKey) {
    this.pruneJitterRunKeys();
    if (this.jitterRunKeyTimestamps.has(runKey)) {
      return false;
    }
    this.jitterRunKeyTimestamps.set(runKey, Date.now());
    return true;
  }

  buildUserJobSignature(user) {
    const timezone = user.timezone || this.defaultTimezone;
    return `${String(user.cron_expr || "").trim()}|${timezone}`;
  }

  scheduleUserJob(user) {
    const timezone = user.timezone || this.defaultTimezone;
    const cronExpr = String(user.cron_expr || "").trim();
    const pollCronExpr = buildCheckinPollCronExpr(cronExpr);
    const userId = Number(user.id);
    if (!pollCronExpr) {
      this.logger.error("schedule user failed: invalid cron", {
        user: user.user_key,
        userId,
        cron: cronExpr,
        timezone
      });
      return false;
    }
    const job = schedule.scheduleJob(
      { rule: pollCronExpr, tz: timezone },
      async () => {
        try {
          const latestUser = this.repo.getUserById(userId);
          if (!latestUser || Number(latestUser.enabled) !== 1) {
            return;
          }
          const now = nowInTz(latestUser.timezone || this.defaultTimezone);
          if (isAutoCheckinPaused(latestUser, now.date)) {
            this.logger.info("scheduled checkin skipped by pause", {
              user: latestUser.user_key,
              userId,
              date: now.date,
              pauseUntil: latestUser.auto_checkin_pause_until
            });
            return;
          }
          const currentCronExpr = String(latestUser.cron_expr || "").trim();
          const cronPlan = parseCheckinCronExpr(currentCronExpr);
          if (!cronPlan) {
            this.logger.warn("scheduled checkin skipped: invalid cron", {
              user: latestUser.user_key,
              userId,
              cron: currentCronExpr
            });
            return;
          }
          const jitterPlan = getAutoCheckinJitterPlan(latestUser.id, now.date, cronPlan.baseHHmm);
          if (!jitterPlan || compareHHmm(now.time, jitterPlan.targetHHmm) !== 0) {
            return;
          }
          const runKey = `${userId}:${now.date}:${jitterPlan.targetHHmm}`;
          if (!this.tryMarkJitterRunKey(runKey)) {
            return;
          }
          this.logger.info("scheduled checkin matched jitter target", {
            user: latestUser.user_key,
            userId,
            date: now.date,
            scheduledTime: jitterPlan.baseHHmm,
            targetTime: jitterPlan.targetHHmm,
            offsetMinutes: jitterPlan.offsetMinutes
          });
          await this.worker.runUserCheckin(latestUser, {
            trigger: "scheduler"
          });
        } catch (error) {
          this.logger.error("scheduled checkin exception", {
            user: user.user_key,
            userId,
            error: String(error && error.message ? error.message : "unknown error")
          });
        }
      }
    );

    if (!job) {
      this.logger.error("schedule user failed", {
        user: user.user_key,
        userId,
        cron: cronExpr,
        timezone
      });
      return false;
    }

    this.userJobs.set(userId, {
      job,
      signature: this.buildUserJobSignature(user),
      userKey: String(user.user_key || userId)
    });
    this.logger.info("scheduled user", {
      user: user.user_key,
      cron: cronExpr,
      pollCron: pollCronExpr,
      timezone
    });
    return true;
  }

  unscheduleUserJob(userId, reason) {
    const safeUserId = Number(userId);
    if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
      return;
    }
    const exists = this.userJobs.get(safeUserId);
    if (!exists) {
      return;
    }
    exists.job.cancel();
    this.userJobs.delete(safeUserId);
    this.logger.info("unscheduled user", {
      user: exists.userKey,
      userId: safeUserId,
      reason: String(reason || "removed")
    });
  }

  syncUserJobs() {
    const users = this.repo.listEnabledUsers();
    const desired = new Map();
    for (const user of users) {
      const userId = Number(user.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        continue;
      }
      desired.set(userId, user);
    }

    for (const userId of Array.from(this.userJobs.keys())) {
      if (!desired.has(userId)) {
        this.unscheduleUserJob(userId, "disabled_or_deleted");
      }
    }

    for (const [userId, user] of desired.entries()) {
      const signature = this.buildUserJobSignature(user);
      const existing = this.userJobs.get(userId);
      if (!existing) {
        this.scheduleUserJob(user);
        continue;
      }
      if (existing.signature === signature) {
        continue;
      }
      this.unscheduleUserJob(userId, "schedule_changed");
      this.scheduleUserJob(user);
    }
  }

  scheduleSyncJob() {
    this.syncJob = schedule.scheduleJob("*/1 * * * *", async () => {
      try {
        this.syncUserJobs();
      } catch (error) {
        this.logger.warn("scheduler sync failed", {
          error: String(error && error.message ? error.message : "unknown error")
        });
      }
    });
  }

  scheduleWatchdogJob() {
    this.watchdogJob = schedule.scheduleJob("*/5 * * * *", async () => {
      try {
        await this.runWatchdog();
      } catch (error) {
        this.logger.warn("watchdog job failed", {
          error: String(error && error.message ? error.message : "unknown error")
        });
      }
    });
  }

  async runWatchdog() {
    const users = this.repo.listEnabledUsers();
    for (const user of users) {
      const timezone = user.timezone || this.defaultTimezone;
      const now = nowInTz(timezone);
      const warningTime = normalizeWarningTime(user.warning_time, "23:00");
      const alertKey = `${user.id}:${now.date}`;

      if (compareHHmm(now.time, warningTime) < 0) {
        continue;
      }

      if (this.watchdogAlertSet.has(alertKey)) {
        continue;
      }

      const latestUser = this.repo.getUserById(user.id);
      if (!latestUser || Number(latestUser.enabled) !== 1) {
        continue;
      }
      const status = await this.worker.checkCheckinStatus(latestUser);
      const statusCode = String(status && status.status ? status.status : "unknown");
      const statusMsg = String(status && status.message ? status.message : "");
      if (statusCode === "signed_today") {
        this.logger.info("watchdog status ok", {
          user: latestUser.user_key,
          date: now.date,
          time: now.time,
          status: statusCode
        });
        this.watchdogAlertSet.add(alertKey);
        continue;
      }

      const needRelogin = [
        "auth_missing",
        "auth_expired",
        "invalid_state",
        "csrf_missing"
      ].includes(statusCode);
      const reloginHint = needRelogin ? "；检测到登录态异常，请重新扫码登录。" : "";
      const notifyChannel =
        this.worker && typeof this.worker.resolveNotificationChannelForUser === "function"
          ? this.worker.resolveNotificationChannelForUser(latestUser)
          : this.repo.getEffectiveNotificationChannelByCheckinUserId(latestUser.id);
      const sent = await this.notifier.sendText(
        latestUser,
        "未签到警告",
        `账号 ${latestUser.display_name} 在 ${now.date} ${now.time} 检查状态为【${statusCode}】。${statusMsg}${reloginHint}`,
        notifyChannel ? { channel: notifyChannel } : {}
      );
      if (!sent) {
        this.logger.warn("watchdog alert notification skipped", {
          user: latestUser.user_key,
          date: now.date,
          time: now.time,
          status: statusCode,
          channelId:
            notifyChannel && Number.isFinite(Number(notifyChannel.id))
              ? Number(notifyChannel.id)
              : null
        });
      }
      this.logger.warn("watchdog alert", {
        user: latestUser.user_key,
        date: now.date,
        time: now.time,
        status: statusCode
      });
      this.watchdogAlertSet.add(alertKey);
    }
  }
}

module.exports = {
  CheckinScheduler
};
