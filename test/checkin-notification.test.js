const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "playwright-extra") {
    return {
      chromium: {
        use() {},
        async launch() {
          throw new Error("browser launch should not run in this test");
        }
      }
    };
  }
  if (request === "puppeteer-extra-plugin-stealth") {
    return function StealthPlugin() {
      return {};
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { CheckinWorker } = require("../src/worker/checkin-worker");
Module._load = originalLoad;

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

test("runUserCheckin sends success notification through sole available enabled channel", async () => {
  const sentMessages = [];
  const fallbackChannel = {
    id: 7,
    name: "only-channel",
    provider: "bark",
    bark_device_key: "test-device-key",
    bark_server_url: "https://api.day.app",
    enabled: 1
  };
  const repo = {
    getAppSettingByKey() {
      return null;
    },
    upsertAppSetting() {},
    hasSuccessLogForDate() {
      return false;
    },
    getAuthStateByUserId() {
      return null;
    },
    getDefaultLocationProfile() {
      return {
        latitude: 31.2304,
        longitude: 121.4737,
        accuracy: 20,
        coord_system: "wgs84"
      };
    },
    insertCheckinLog() {},
    getEffectiveNotificationChannelByCheckinUserId() {
      return null;
    },
    listNotificationChannelsByCheckinUserId() {
      return [fallbackChannel];
    }
  };
  const notifier = {
    async sendText(user, title, message, options = {}) {
      sentMessages.push({
        user,
        title,
        message,
        options
      });
      return true;
    }
  };
  const worker = new CheckinWorker({
    config: {
      defaultTimezone: "Asia/Shanghai"
    },
    repo,
    notifier,
    logger: createLogger()
  });
  worker.runWithBrowser = async () => ({
    status: "success",
    message: "接口提交成功"
  });

  const result = await worker.runUserCheckin({
    id: 3,
    user_key: "user_0003",
    display_name: "测试账号",
    timezone: "Asia/Shanghai",
    debug_mode: 0
  });

  assert.equal(result.status, "success");
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].title, "签到成功");
  assert.equal(sentMessages[0].options.channel.id, 7);
  assert.match(sentMessages[0].message, /账号：测试账号/);
  assert.match(sentMessages[0].message, /结果：接口提交成功/);
});
