const { getDateInTz } = require("../utils/time");

function createRepository(db) {
  const stmt = {
    listEnabledUsers: db.prepare(
      "SELECT * FROM users WHERE enabled = 1 ORDER BY id ASC"
    ),
    listAllUsers: db.prepare("SELECT * FROM users ORDER BY id ASC"),
    getUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
    getUserByKey: db.prepare("SELECT * FROM users WHERE user_key = ?"),
    insertUser: db.prepare(
      `
      INSERT INTO users (
        user_key, display_name, enabled, debug_mode, cron_expr, timezone, target_url, user_agent,
        checkin_button_text, signed_marker_text, location_refresh_text, radio_option_text, warning_time,
        auto_checkin_pause_until, notification_channel_id
      ) VALUES (
        @user_key, @display_name, @enabled, @debug_mode, @cron_expr, @timezone, @target_url, @user_agent,
        @checkin_button_text, @signed_marker_text, @location_refresh_text, @radio_option_text, @warning_time,
        @auto_checkin_pause_until, @notification_channel_id
      )
      `
    ),
    updateUserUpdatedAt: db.prepare(
      "UPDATE users SET updated_at = datetime('now') WHERE id = ?"
    ),
    updateCheckinUserBase: db.prepare(
      `
      UPDATE users SET
        display_name = @display_name,
        enabled = @enabled,
        debug_mode = @debug_mode,
        cron_expr = @cron_expr,
        timezone = @timezone,
        target_url = @target_url,
        user_agent = @user_agent,
        checkin_button_text = @checkin_button_text,
        signed_marker_text = @signed_marker_text,
        location_refresh_text = @location_refresh_text,
        radio_option_text = @radio_option_text,
        warning_time = @warning_time,
        auto_checkin_pause_until = @auto_checkin_pause_until,
        notification_channel_id = @notification_channel_id,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    updateCheckinUserAutoPause: db.prepare(
      `
      UPDATE users SET
        auto_checkin_pause_until = @auto_checkin_pause_until,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    getAuthStateByUserId: db.prepare("SELECT * FROM auth_states WHERE user_id = ?"),
    upsertAuthState: db.prepare(
      `
      INSERT INTO auth_states (user_id, storage_state_json, passkey_credential_json, updated_at)
      VALUES (@user_id, @storage_state_json, @passkey_credential_json, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        storage_state_json = excluded.storage_state_json,
        passkey_credential_json = excluded.passkey_credential_json,
        updated_at = datetime('now')
      `
    ),
    getDefaultLocationProfile: db.prepare(
      "SELECT * FROM location_profiles WHERE user_id = ? ORDER BY id ASC LIMIT 1"
    ),
    getLocationProfileByUserAndName: db.prepare(
      "SELECT * FROM location_profiles WHERE user_id = ? AND name = ? LIMIT 1"
    ),
    upsertLocationProfile: db.prepare(
      `
      INSERT INTO location_profiles (
        user_id, name, latitude, longitude, accuracy, altitude, altitude_accuracy, heading, speed, coord_system,
        submit_address_text, submit_address_source, submit_address_raw_json, submit_address_updated_at,
        source, updated_at
      ) VALUES (
        @user_id, @name, @latitude, @longitude, @accuracy, @altitude, @altitude_accuracy, @heading, @speed, @coord_system,
        @submit_address_text, @submit_address_source, @submit_address_raw_json, @submit_address_updated_at,
        @source, datetime('now')
      )
      ON CONFLICT(user_id, name) DO UPDATE SET
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy = excluded.accuracy,
        altitude = excluded.altitude,
        altitude_accuracy = excluded.altitude_accuracy,
        heading = excluded.heading,
        speed = excluded.speed,
        coord_system = excluded.coord_system,
        submit_address_text = excluded.submit_address_text,
        submit_address_source = excluded.submit_address_source,
        submit_address_raw_json = excluded.submit_address_raw_json,
        submit_address_updated_at = excluded.submit_address_updated_at,
        source = excluded.source,
        updated_at = datetime('now')
      `
    ),
    insertCheckinLog: db.prepare(
      `
      INSERT INTO checkin_logs (
        user_id, run_date, run_at, status, duration_ms, message,
        simulated_latitude, simulated_longitude, simulated_accuracy,
        simulated_altitude, simulated_altitude_accuracy, simulated_heading, simulated_speed,
        jitter_radius_m, raw_result_json
      ) VALUES (
        @user_id, @run_date, @run_at, @status, @duration_ms, @message,
        @simulated_latitude, @simulated_longitude, @simulated_accuracy,
        @simulated_altitude, @simulated_altitude_accuracy, @simulated_heading, @simulated_speed,
        @jitter_radius_m, @raw_result_json
      )
      `
    ),
    trimCheckinLogsByUserId: db.prepare(
      `
      DELETE FROM checkin_logs
      WHERE user_id = @user_id
        AND id NOT IN (
          SELECT id FROM checkin_logs
          WHERE user_id = @user_id
          ORDER BY id DESC
          LIMIT @keep
        )
      `
    ),
    listCheckinLogUserIds: db.prepare(
      "SELECT DISTINCT user_id FROM checkin_logs ORDER BY user_id ASC"
    ),
    listRecentCheckinLogsByUserId: db.prepare(
      `
      SELECT
        id,
        user_id,
        run_date,
        run_at,
        status,
        duration_ms,
        message,
        created_at,
        CASE
          WHEN raw_result_json IS NULL OR raw_result_json = '' THEN 0
          ELSE 1
        END AS has_raw_result
      FROM checkin_logs
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
      `
    ),
    getCheckinLogById: db.prepare(
      `
      SELECT *
      FROM checkin_logs
      WHERE user_id = ? AND id = ?
      LIMIT 1
      `
    ),
    clearCheckinLogsByUserId: db.prepare("DELETE FROM checkin_logs WHERE user_id = ?"),
    getTodaySuccessCount: db.prepare(
      "SELECT COUNT(1) AS c FROM checkin_logs WHERE user_id = ? AND run_date = ? AND status = 'success'"
    ),

    createAppUser: db.prepare(
      `
      INSERT INTO app_users (
        username, password_hash, role, status, purchased_at, expires_at, updated_at
      ) VALUES (
        @username, @password_hash, @role, @status, @purchased_at, @expires_at, datetime('now')
      )
      `
    ),
    getAppUserByUsername: db.prepare("SELECT * FROM app_users WHERE username = ?"),
    getAppUserById: db.prepare("SELECT * FROM app_users WHERE id = ?"),
    listAppUsers: db.prepare("SELECT * FROM app_users ORDER BY id ASC"),
    updateAppUserBase: db.prepare(
      `
      UPDATE app_users SET
        status = COALESCE(@status, status),
        purchased_at = @purchased_at,
        expires_at = @expires_at,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    updateAppUserPassword: db.prepare(
      `
      UPDATE app_users SET
        password_hash = @password_hash,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    updateAppUserLoginInfo: db.prepare(
      `
      UPDATE app_users SET
        last_login_at = @last_login_at,
        last_login_ip = @last_login_ip,
        last_login_geo_json = @last_login_geo_json,
        last_login_geo_status = @last_login_geo_status,
        last_login_ua = @last_login_ua,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    createGroup: db.prepare(
      `
      INSERT INTO user_groups (name, description, max_checkin_accounts, updated_at)
      VALUES (@name, @description, @max_checkin_accounts, datetime('now'))
      `
    ),
    updateGroup: db.prepare(
      `
      UPDATE user_groups SET
        name = COALESCE(@name, name),
        description = @description,
        max_checkin_accounts = @max_checkin_accounts,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    listGroups: db.prepare("SELECT * FROM user_groups ORDER BY id ASC"),
    getGroupById: db.prepare("SELECT * FROM user_groups WHERE id = ?"),
    getGroupByName: db.prepare("SELECT * FROM user_groups WHERE name = ?"),
    assignGroup: db.prepare(
      `
      INSERT OR IGNORE INTO app_user_group_memberships (app_user_id, group_id)
      VALUES (?, ?)
      `
    ),
    removeGroup: db.prepare(
      "DELETE FROM app_user_group_memberships WHERE app_user_id = ? AND group_id = ?"
    ),
    listGroupsByUserId: db.prepare(
      `
      SELECT g.*
      FROM user_groups g
      INNER JOIN app_user_group_memberships m ON m.group_id = g.id
      WHERE m.app_user_id = ?
      ORDER BY g.id ASC
      `
    ),
    listUserGroupRows: db.prepare(
      "SELECT * FROM app_user_group_memberships ORDER BY id ASC"
    ),
    createUserCheckinMap: db.prepare(
      `
      INSERT OR IGNORE INTO app_user_checkin_user_map (app_user_id, checkin_user_id)
      VALUES (?, ?)
      `
    ),
    listUserCheckinMapByAppUserId: db.prepare(
      `
      SELECT m.*, u.user_key, u.display_name
      FROM app_user_checkin_user_map m
      INNER JOIN users u ON u.id = m.checkin_user_id
      WHERE m.app_user_id = ?
      ORDER BY m.id ASC
      `
    ),
    countUserCheckinMapByAppUserId: db.prepare(
      "SELECT COUNT(1) AS c FROM app_user_checkin_user_map WHERE app_user_id = ?"
    ),
    listUserCheckinMapByCheckinUserId: db.prepare(
      `
      SELECT m.*, a.username, a.status AS app_user_status
      FROM app_user_checkin_user_map m
      INNER JOIN app_users a ON a.id = m.app_user_id
      WHERE m.checkin_user_id = ?
      ORDER BY m.id ASC
      `
    ),
    isCheckinMappedToAppUser: db.prepare(
      `
      SELECT 1 AS matched
      FROM app_user_checkin_user_map
      WHERE checkin_user_id = ? AND app_user_id = ?
      LIMIT 1
      `
    ),
    removeUserCheckinMapByCheckinUserId: db.prepare(
      "DELETE FROM app_user_checkin_user_map WHERE checkin_user_id = ? AND app_user_id = ?"
    ),
    createNotificationChannel: db.prepare(
      `
      INSERT INTO notification_channels (
        app_user_id, name, provider, bark_server_url, bark_device_key, enabled, extra_json, updated_at
      ) VALUES (
        @app_user_id, @name, @provider, @bark_server_url, @bark_device_key, @enabled, @extra_json, datetime('now')
      )
      `
    ),
    updateNotificationChannel: db.prepare(
      `
      UPDATE notification_channels SET
        name = @name,
        provider = @provider,
        bark_server_url = @bark_server_url,
        bark_device_key = COALESCE(@bark_device_key, bark_device_key),
        enabled = @enabled,
        extra_json = @extra_json,
        updated_at = datetime('now')
      WHERE id = @id AND app_user_id = @app_user_id
      `
    ),
    deleteNotificationChannel: db.prepare(
      "DELETE FROM notification_channels WHERE id = ? AND app_user_id = ?"
    ),
    getNotificationChannelById: db.prepare(
      `
      SELECT c.*, u.username
      FROM notification_channels c
      INNER JOIN app_users u ON u.id = c.app_user_id
      WHERE c.id = ?
      LIMIT 1
      `
    ),
    listNotificationChannelsByAppUserId: db.prepare(
      `
      SELECT c.*, u.username
      FROM notification_channels c
      INNER JOIN app_users u ON u.id = c.app_user_id
      WHERE c.app_user_id = ?
      ORDER BY c.id ASC
      `
    ),
    getNotificationChannelByOwnerAndName: db.prepare(
      `
      SELECT c.*, u.username
      FROM notification_channels c
      INNER JOIN app_users u ON u.id = c.app_user_id
      WHERE c.app_user_id = ? AND c.name = ? COLLATE NOCASE
      LIMIT 1
      `
    ),
    getNotificationChannelByOwnerAndNameExcludingId: db.prepare(
      `
      SELECT c.*, u.username
      FROM notification_channels c
      INNER JOIN app_users u ON u.id = c.app_user_id
      WHERE c.app_user_id = ? AND c.name = ? COLLATE NOCASE AND c.id != ?
      LIMIT 1
      `
    ),
    listNotificationChannels: db.prepare(
      `
      SELECT c.*, u.username
      FROM notification_channels c
      INNER JOIN app_users u ON u.id = c.app_user_id
      ORDER BY c.id ASC
      `
    ),
    listNotificationChannelsByCheckinUserId: db.prepare(
      `
      SELECT DISTINCT c.*, u.username
      FROM notification_channels c
      INNER JOIN app_users u ON u.id = c.app_user_id
      INNER JOIN app_user_checkin_user_map m ON m.app_user_id = c.app_user_id
      WHERE m.checkin_user_id = ?
      ORDER BY c.id ASC
      `
    ),
    getNotificationChannelBindingByCheckinUserId: db.prepare(
      `
      SELECT c.*, u.username
      FROM users cu
      LEFT JOIN notification_channels c ON c.id = cu.notification_channel_id
      LEFT JOIN app_users u ON u.id = c.app_user_id
      WHERE cu.id = ?
      LIMIT 1
      `
    ),
    getEffectiveNotificationChannelByCheckinUserId: db.prepare(
      `
      SELECT c.*, u.username
      FROM users cu
      INNER JOIN notification_channels c ON c.id = cu.notification_channel_id
      INNER JOIN app_users u ON u.id = c.app_user_id
      WHERE cu.id = ? AND c.enabled = 1
      LIMIT 1
      `
    ),
    updateCheckinUserNotificationChannel: db.prepare(
      `
      UPDATE users SET
        notification_channel_id = @notification_channel_id,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    clearCheckinUserNotificationChannelByChannelId: db.prepare(
      `
      UPDATE users SET
        notification_channel_id = NULL,
        updated_at = datetime('now')
      WHERE notification_channel_id = ?
      `
    ),
    insertLoginAudit: db.prepare(
      `
      INSERT INTO login_audit_logs (
        app_user_id, username, role, status, login_ip, login_geo_json, geo_status, geo_error, user_agent, failure_reason
      ) VALUES (
        @app_user_id, @username, @role, @status, @login_ip, @login_geo_json, @geo_status, @geo_error, @user_agent, @failure_reason
      )
      `
    ),
    listLoginAuditLogs: db.prepare(
      "SELECT * FROM login_audit_logs ORDER BY id DESC LIMIT ?"
    ),
    getAppSettingByKey: db.prepare("SELECT * FROM app_settings WHERE key = ?"),
    upsertAppSetting: db.prepare(
      `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (@key, @value, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
      `
    ),
    createInviteCode: db.prepare(
      `
      INSERT INTO registration_invite_codes (
        code, enabled, max_uses, used_count, expires_at, updated_at
      ) VALUES (
        @code, @enabled, @max_uses, @used_count, @expires_at, datetime('now')
      )
      `
    ),
    listInviteCodes: db.prepare(
      "SELECT * FROM registration_invite_codes ORDER BY id DESC"
    ),
    getInviteCodeById: db.prepare(
      "SELECT * FROM registration_invite_codes WHERE id = ?"
    ),
    getInviteCodeByCode: db.prepare(
      "SELECT * FROM registration_invite_codes WHERE code = ? COLLATE NOCASE"
    ),
    updateInviteCode: db.prepare(
      `
      UPDATE registration_invite_codes SET
        enabled = @enabled,
        max_uses = @max_uses,
        expires_at = @expires_at,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    consumeInviteCode: db.prepare(
      `
      UPDATE registration_invite_codes SET
        used_count = used_count + 1,
        updated_at = datetime('now')
      WHERE id = @id
        AND enabled = 1
        AND (max_uses IS NULL OR used_count < max_uses)
        AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
      `
    ),
    rollbackInviteCodeUsage: db.prepare(
      `
      UPDATE registration_invite_codes SET
        used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END,
        updated_at = datetime('now')
      WHERE id = @id
      `
    ),
    getLatestCheckinLogByUserId: db.prepare(
      "SELECT * FROM checkin_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1"
    ),
    countCheckinUsers: db.prepare("SELECT COUNT(1) AS c FROM users"),
    countEnabledScheduledCheckinUsers: db.prepare(
      "SELECT COUNT(1) AS c FROM users WHERE enabled = 1 AND cron_expr IS NOT NULL AND TRIM(cron_expr) <> ''"
    ),
    countNotificationChannels: db.prepare(
      "SELECT COUNT(1) AS c FROM notification_channels"
    ),
    countCheckinLogsSuccess: db.prepare(
      "SELECT COUNT(1) AS c FROM checkin_logs WHERE status = 'success'"
    ),
    countCheckinLogsFailed: db.prepare(
      "SELECT COUNT(1) AS c FROM checkin_logs WHERE status IN ('failed', 'error')"
    )
  };

  return {
    listEnabledUsers() {
      return stmt.listEnabledUsers.all();
    },
    listAllUsers() {
      return stmt.listAllUsers.all();
    },
    getUserByKey(userKey) {
      return stmt.getUserByKey.get(userKey);
    },
    getUserById(userId) {
      return stmt.getUserById.get(userId);
    },
    insertUser(payload) {
      return stmt.insertUser.run({
        notification_channel_id: null,
        ...payload
      });
    },
    updateCheckinUserBase(payload) {
      return stmt.updateCheckinUserBase.run(payload);
    },
    updateCheckinUserAutoPause(payload) {
      return stmt.updateCheckinUserAutoPause.run(payload);
    },
    getAuthStateByUserId(userId) {
      return stmt.getAuthStateByUserId.get(userId);
    },
    upsertAuthState(payload) {
      stmt.upsertAuthState.run(payload);
    },
    getDefaultLocationProfile(userId) {
      return stmt.getDefaultLocationProfile.get(userId);
    },
    upsertLocationProfile(payload) {
      const safePayload = {
        submit_address_text: undefined,
        submit_address_source: undefined,
        submit_address_raw_json: undefined,
        submit_address_updated_at: undefined,
        ...payload
      };
      if (
        safePayload.submit_address_text === undefined ||
        safePayload.submit_address_source === undefined ||
        safePayload.submit_address_raw_json === undefined ||
        safePayload.submit_address_updated_at === undefined
      ) {
        const existing = stmt.getLocationProfileByUserAndName.get(
          safePayload.user_id,
          safePayload.name || "default"
        );
        if (safePayload.submit_address_text === undefined) {
          safePayload.submit_address_text = existing ? existing.submit_address_text : null;
        }
        if (safePayload.submit_address_source === undefined) {
          safePayload.submit_address_source = existing ? existing.submit_address_source : null;
        }
        if (safePayload.submit_address_raw_json === undefined) {
          safePayload.submit_address_raw_json = existing ? existing.submit_address_raw_json : null;
        }
        if (safePayload.submit_address_updated_at === undefined) {
          safePayload.submit_address_updated_at = existing ? existing.submit_address_updated_at : null;
        }
      }
      stmt.upsertLocationProfile.run(safePayload);
    },
    insertCheckinLog(payload) {
      stmt.insertCheckinLog.run(payload);
      const userId = Number(payload && payload.user_id);
      if (Number.isFinite(userId) && userId > 0) {
        stmt.trimCheckinLogsByUserId.run({
          user_id: userId,
          keep: 15
        });
      }
    },
    trimCheckinLogsAll(keep = 15) {
      const safeKeep = Number.isFinite(Number(keep)) ? Math.max(1, Math.floor(Number(keep))) : 15;
      const rows = stmt.listCheckinLogUserIds.all();
      for (const row of rows) {
        const userId = Number(row && row.user_id);
        if (!Number.isFinite(userId) || userId <= 0) {
          continue;
        }
        stmt.trimCheckinLogsByUserId.run({
          user_id: userId,
          keep: safeKeep
        });
      }
    },
    listRecentCheckinLogsByUserId(userId, limit = 15) {
      const safeUserId = Number(userId);
      if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
        return [];
      }
      const safeLimit = Number.isFinite(Number(limit))
        ? Math.min(Math.max(Math.floor(Number(limit)), 1), 15)
        : 15;
      stmt.trimCheckinLogsByUserId.run({
        user_id: safeUserId,
        keep: 15
      });
      return stmt.listRecentCheckinLogsByUserId.all(safeUserId, safeLimit);
    },
    hasSuccessLogForDate(userId, runDate) {
      const row = stmt.getTodaySuccessCount.get(userId, runDate);
      return row && row.c > 0;
    },
    hasSuccessLogToday(userId, timezone) {
      return this.hasSuccessLogForDate(userId, getDateInTz(new Date(), timezone));
    },
    touchUser(userId) {
      stmt.updateUserUpdatedAt.run(userId);
    },

    createAppUser(payload) {
      return stmt.createAppUser.run(payload);
    },
    listAppUsers() {
      return stmt.listAppUsers.all();
    },
    getAppUserByUsername(username) {
      return stmt.getAppUserByUsername.get(username);
    },
    getAppUserById(id) {
      return stmt.getAppUserById.get(id);
    },
    updateAppUserBase(payload) {
      return stmt.updateAppUserBase.run(payload);
    },
    updateAppUserPassword(payload) {
      return stmt.updateAppUserPassword.run(payload);
    },
    updateAppUserLoginInfo(payload) {
      return stmt.updateAppUserLoginInfo.run(payload);
    },
    createGroup(payload) {
      return stmt.createGroup.run(payload);
    },
    updateGroup(payload) {
      return stmt.updateGroup.run(payload);
    },
    listGroups() {
      return stmt.listGroups.all();
    },
    getGroupById(id) {
      return stmt.getGroupById.get(id);
    },
    getGroupByName(name) {
      return stmt.getGroupByName.get(name);
    },
    assignGroup(appUserId, groupId) {
      return stmt.assignGroup.run(appUserId, groupId);
    },
    removeGroup(appUserId, groupId) {
      return stmt.removeGroup.run(appUserId, groupId);
    },
    listGroupsByUserId(appUserId) {
      return stmt.listGroupsByUserId.all(appUserId);
    },
    listUserGroupRows() {
      return stmt.listUserGroupRows.all();
    },
    createUserCheckinMap(appUserId, checkinUserId) {
      return stmt.createUserCheckinMap.run(appUserId, checkinUserId);
    },
    listUserCheckinMapByAppUserId(appUserId) {
      return stmt.listUserCheckinMapByAppUserId.all(appUserId);
    },
    countUserCheckinMapByAppUserId(appUserId) {
      const row = stmt.countUserCheckinMapByAppUserId.get(appUserId);
      return row ? Number(row.c || 0) : 0;
    },
    listUserCheckinMapByCheckinUserId(checkinUserId) {
      return stmt.listUserCheckinMapByCheckinUserId.all(checkinUserId);
    },
    isCheckinMappedToAppUser(checkinUserId, appUserId) {
      const row = stmt.isCheckinMappedToAppUser.get(checkinUserId, appUserId);
      return Boolean(row);
    },
    removeUserCheckinMapByCheckinUserId(checkinUserId, appUserId) {
      return stmt.removeUserCheckinMapByCheckinUserId.run(checkinUserId, appUserId);
    },
    createNotificationChannel(payload) {
      return stmt.createNotificationChannel.run(payload);
    },
    updateNotificationChannel(payload) {
      return stmt.updateNotificationChannel.run(payload);
    },
    deleteNotificationChannel(channelId, appUserId) {
      return stmt.deleteNotificationChannel.run(channelId, appUserId);
    },
    getNotificationChannelById(channelId) {
      return stmt.getNotificationChannelById.get(channelId);
    },
    listNotificationChannelsByAppUserId(appUserId) {
      return stmt.listNotificationChannelsByAppUserId.all(appUserId);
    },
    getNotificationChannelByOwnerAndName(appUserId, name) {
      return stmt.getNotificationChannelByOwnerAndName.get(appUserId, name);
    },
    getNotificationChannelByOwnerAndNameExcludingId(appUserId, name, excludeId) {
      return stmt.getNotificationChannelByOwnerAndNameExcludingId.get(
        appUserId,
        name,
        excludeId
      );
    },
    listNotificationChannels() {
      return stmt.listNotificationChannels.all();
    },
    listNotificationChannelsByCheckinUserId(checkinUserId) {
      return stmt.listNotificationChannelsByCheckinUserId.all(checkinUserId);
    },
    getNotificationChannelBindingByCheckinUserId(checkinUserId) {
      return stmt.getNotificationChannelBindingByCheckinUserId.get(checkinUserId);
    },
    getEffectiveNotificationChannelByCheckinUserId(checkinUserId) {
      return stmt.getEffectiveNotificationChannelByCheckinUserId.get(checkinUserId);
    },
    updateCheckinUserNotificationChannel(payload) {
      return stmt.updateCheckinUserNotificationChannel.run(payload);
    },
    clearCheckinUserNotificationChannelByChannelId(channelId) {
      return stmt.clearCheckinUserNotificationChannelByChannelId.run(channelId);
    },
    insertLoginAudit(payload) {
      return stmt.insertLoginAudit.run(payload);
    },
    listLoginAuditLogs(limit = 100) {
      return stmt.listLoginAuditLogs.all(limit);
    },
    getAppSettingByKey(key) {
      return stmt.getAppSettingByKey.get(key);
    },
    upsertAppSetting(key, value) {
      return stmt.upsertAppSetting.run({ key, value });
    },
    createInviteCode(payload) {
      return stmt.createInviteCode.run(payload);
    },
    listInviteCodes() {
      return stmt.listInviteCodes.all();
    },
    getInviteCodeById(id) {
      return stmt.getInviteCodeById.get(id);
    },
    getInviteCodeByCode(code) {
      return stmt.getInviteCodeByCode.get(code);
    },
    updateInviteCode(payload) {
      return stmt.updateInviteCode.run(payload);
    },
    consumeInviteCode(id) {
      return stmt.consumeInviteCode.run({ id });
    },
    rollbackInviteCodeUsage(id) {
      return stmt.rollbackInviteCodeUsage.run({ id });
    },
    getLatestCheckinLogByUserId(userId) {
      return stmt.getLatestCheckinLogByUserId.get(userId);
    },
    countCheckinUsers() {
      const row = stmt.countCheckinUsers.get();
      return row ? Number(row.c || 0) : 0;
    },
    countEnabledScheduledCheckinUsers() {
      const row = stmt.countEnabledScheduledCheckinUsers.get();
      return row ? Number(row.c || 0) : 0;
    },
    countNotificationChannels() {
      const row = stmt.countNotificationChannels.get();
      return row ? Number(row.c || 0) : 0;
    },
    countCheckinLogsSuccess() {
      const row = stmt.countCheckinLogsSuccess.get();
      return row ? Number(row.c || 0) : 0;
    },
    countCheckinLogsFailed() {
      const row = stmt.countCheckinLogsFailed.get();
      return row ? Number(row.c || 0) : 0;
    },
    getCheckinLogById(userId, logId) {
      const safeUserId = Number(userId);
      const safeLogId = Number(logId);
      if (
        !Number.isFinite(safeUserId) ||
        safeUserId <= 0 ||
        !Number.isFinite(safeLogId) ||
        safeLogId <= 0
      ) {
        return null;
      }
      return stmt.getCheckinLogById.get(safeUserId, safeLogId);
    },
    clearCheckinLogsByUserId(userId) {
      const safeUserId = Number(userId);
      if (!Number.isFinite(safeUserId) || safeUserId <= 0) {
        return { changes: 0 };
      }
      return stmt.clearCheckinLogsByUserId.run(safeUserId);
    }
  };
}

module.exports = {
  createRepository
};
