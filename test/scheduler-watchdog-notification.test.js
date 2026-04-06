const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "node-schedule") {
    return {
      scheduleJob() {
        return {
          cancel() {}
        };
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { CheckinScheduler } = require("../src/scheduler");
Module._load = originalLoad;

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function createRepo() {
  const users = [
    {
      id: 1,
      user_key: "user_0001",
      display_name: "U1",
      warning_time: "00:00",
      timezone: "Asia/Shanghai",
      enabled: 1
    }
  ];
  return {
    listEnabledUsers() {
      return users;
    },
    getUserById(id) {
      return users.find((user) => Number(user.id) === Number(id)) || null;
    },
    getEffectiveNotificationChannelByCheckinUserId() {
      return null;
    }
  };
}

test("runWatchdog does not lock daily alert when notification sending fails", async () => {
  const repo = createRepo();
  const scheduler = new CheckinScheduler({
    repo,
    worker: {
      async checkCheckinStatus() {
        return {
          status: "not_signed_today",
          message: "not signed"
        };
      },
      resolveNotificationChannelForUser() {
        return null;
      }
    },
    notifier: {
      async sendText() {
        return false;
      }
    },
    logger: createLogger(),
    defaultTimezone: "Asia/Shanghai"
  });

  await scheduler.runWatchdog();
  assert.equal(scheduler.watchdogAlertSet.size, 0);
});

test("runWatchdog locks daily alert after successful notification", async () => {
  const repo = createRepo();
  const scheduler = new CheckinScheduler({
    repo,
    worker: {
      async checkCheckinStatus() {
        return {
          status: "not_signed_today",
          message: "not signed"
        };
      },
      resolveNotificationChannelForUser() {
        return {
          id: 9,
          provider: "bark"
        };
      }
    },
    notifier: {
      async sendText() {
        return true;
      }
    },
    logger: createLogger(),
    defaultTimezone: "Asia/Shanghai"
  });

  await scheduler.runWatchdog();
  assert.equal(scheduler.watchdogAlertSet.size, 1);
});
