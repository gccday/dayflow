const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function hasColumn(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function hasOwnerScopedUniqueConstraintOnNotificationChannels(db) {
  try {
    const indexRows = db.prepare("PRAGMA index_list(notification_channels)").all();
    for (const indexRow of indexRows) {
      if (!Number(indexRow && indexRow.unique)) {
        continue;
      }
      const indexName = String(indexRow && indexRow.name ? indexRow.name : "");
      if (!indexName) {
        continue;
      }
      const cols = db
        .prepare(`PRAGMA index_info(${JSON.stringify(indexName)})`)
        .all()
        .map((col) => String(col && col.name ? col.name : "").toLowerCase())
        .filter(Boolean);
      if (cols.length === 2 && cols[0] === "app_user_id" && cols[1] === "name") {
        return true;
      }
    }
  } catch (_error) {
    return false;
  }
  return false;
}

function ensureNotificationChannelsOwnerScopedUnique(db) {
  if (hasOwnerScopedUniqueConstraintOnNotificationChannels(db)) {
    return;
  }
  db.exec("BEGIN");
  try {
    db.exec("ALTER TABLE notification_channels RENAME TO notification_channels_legacy;");
    db.exec(`
      CREATE TABLE notification_channels (
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
    `);
    db.exec(`
      INSERT INTO notification_channels (
        id, app_user_id, name, provider, bark_server_url, bark_device_key, enabled, extra_json, created_at, updated_at
      )
      SELECT
        id,
        app_user_id,
        name,
        COALESCE(provider, 'bark'),
        bark_server_url,
        bark_device_key,
        COALESCE(enabled, 1),
        extra_json,
        COALESCE(created_at, datetime('now')),
        COALESCE(updated_at, datetime('now'))
      FROM notification_channels_legacy;
    `);
    db.exec("DROP TABLE notification_channels_legacy;");
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_channels_app_user_id
        ON notification_channels(app_user_id);
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled
        ON notification_channels(enabled);
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function runMigrations(db) {
  if (!hasColumn(db, "users", "debug_mode")) {
    db.exec("ALTER TABLE users ADD COLUMN debug_mode INTEGER NOT NULL DEFAULT 0;");
  }
  if (!hasColumn(db, "user_groups", "max_checkin_accounts")) {
    db.exec("ALTER TABLE user_groups ADD COLUMN max_checkin_accounts INTEGER;");
  }
  if (!hasColumn(db, "location_profiles", "coord_system")) {
    db.exec("ALTER TABLE location_profiles ADD COLUMN coord_system TEXT NOT NULL DEFAULT 'auto';");
  }
  if (!hasColumn(db, "location_profiles", "submit_address_text")) {
    db.exec("ALTER TABLE location_profiles ADD COLUMN submit_address_text TEXT;");
  }
  if (!hasColumn(db, "location_profiles", "submit_address_source")) {
    db.exec("ALTER TABLE location_profiles ADD COLUMN submit_address_source TEXT;");
  }
  if (!hasColumn(db, "location_profiles", "submit_address_raw_json")) {
    db.exec("ALTER TABLE location_profiles ADD COLUMN submit_address_raw_json TEXT;");
  }
  if (!hasColumn(db, "location_profiles", "submit_address_updated_at")) {
    db.exec("ALTER TABLE location_profiles ADD COLUMN submit_address_updated_at TEXT;");
  }
  if (!hasColumn(db, "users", "notification_channel_id")) {
    db.exec("ALTER TABLE users ADD COLUMN notification_channel_id INTEGER;");
  }
  if (!hasColumn(db, "users", "auto_checkin_pause_until")) {
    db.exec("ALTER TABLE users ADD COLUMN auto_checkin_pause_until TEXT;");
  }
  db.exec(`
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
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_registration_invite_codes_enabled
      ON registration_invite_codes(enabled);
  `);
  db.exec(`
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
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notification_channels_app_user_id
      ON notification_channels(app_user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled
      ON notification_channels(enabled);
  `);
  ensureNotificationChannelsOwnerScopedUnique(db);
}

function initDatabase(dbPath) {
  const fullPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  const db = new Database(fullPath);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  runMigrations(db);
  return db;
}

module.exports = {
  initDatabase
};
