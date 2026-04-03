PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  debug_mode INTEGER NOT NULL DEFAULT 0,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  target_url TEXT NOT NULL,
  user_agent TEXT,
  checkin_button_text TEXT NOT NULL DEFAULT '立即签到',
  signed_marker_text TEXT NOT NULL DEFAULT '今日已签到',
  location_refresh_text TEXT NOT NULL DEFAULT '重新定位',
  radio_option_text TEXT,
  warning_time TEXT NOT NULL DEFAULT '23:00',
  auto_checkin_pause_until TEXT,
  notifier_channel TEXT,
  notification_channel_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_states (
  user_id INTEGER PRIMARY KEY,
  storage_state_json TEXT,
  passkey_credential_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL NOT NULL DEFAULT 30,
  altitude REAL,
  altitude_accuracy REAL,
  heading REAL,
  speed REAL,
  coord_system TEXT NOT NULL DEFAULT 'auto',
  submit_address_text TEXT,
  submit_address_source TEXT,
  submit_address_raw_json TEXT,
  submit_address_updated_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checkin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  run_date TEXT NOT NULL,
  run_at TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  simulated_latitude REAL,
  simulated_longitude REAL,
  simulated_accuracy REAL,
  simulated_altitude REAL,
  simulated_altitude_accuracy REAL,
  simulated_heading REAL,
  simulated_speed REAL,
  jitter_radius_m REAL,
  raw_result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checkin_logs_user_date ON checkin_logs(user_id, run_date);
CREATE INDEX IF NOT EXISTS idx_users_enabled ON users(enabled);

CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  purchased_at TEXT,
  expires_at TEXT,
  last_login_at TEXT,
  last_login_ip TEXT,
  last_login_geo_json TEXT,
  last_login_geo_status TEXT,
  last_login_ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'bark',
  bark_server_url TEXT,
  bark_device_key TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  extra_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(app_user_id, name),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  max_checkin_accounts INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_user_group_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(app_user_id, group_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_user_checkin_user_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id INTEGER NOT NULL,
  checkin_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(app_user_id, checkin_user_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  FOREIGN KEY (checkin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id INTEGER,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  login_at TEXT NOT NULL DEFAULT (datetime('now')),
  login_ip TEXT,
  login_geo_json TEXT,
  geo_status TEXT,
  geo_error TEXT,
  user_agent TEXT,
  failure_reason TEXT,
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
CREATE INDEX IF NOT EXISTS idx_notification_channels_app_user_id
  ON notification_channels(app_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled
  ON notification_channels(enabled);
CREATE INDEX IF NOT EXISTS idx_user_groups_name ON user_groups(name);
CREATE INDEX IF NOT EXISTS idx_login_audit_logs_login_at ON login_audit_logs(login_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registration_invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 1,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registration_invite_codes_enabled
  ON registration_invite_codes(enabled);
