const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'survey.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Create responses table
  db.run(`CREATE TABLE IF NOT EXISTS responses (
    response_id TEXT PRIMARY KEY,
    respondent_id TEXT,
    survey_id TEXT,
    business_name TEXT,
    business_sector TEXT,
    employee_count TEXT,
    topic_ratings_json TEXT,
    topic_display_order_json TEXT,
    status TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    duration_seconds INTEGER,
    last_answered_topic_index INTEGER,
    last_answered_topic_id TEXT,
    final_comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create response_versions table
  db.run(`CREATE TABLE IF NOT EXISTS response_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id TEXT,
    version_number INTEGER,
    topic_ratings_json TEXT,
    final_comment TEXT,
    change_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(response_id) REFERENCES responses(response_id)
  )`);

  // Create surveys table
  db.run(`CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    name TEXT,
    config_json TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create admin_users table
  db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default admin user if not exists (username: admin, password: password123)
  // Note: bcrypt.hashSync('password123', 10) = $2a$10$wYu2zh047bQZ2dmhCJ9wQuWLUUwagopdEk1Cby1JtkhAFX61SkEku
  db.get("SELECT * FROM admin_users WHERE username = ?", ['admin'], (err, row) => {
    if (!row) {
      db.run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", ['admin', '$2a$10$wYu2zh047bQZ2dmhCJ9wQuWLUUwagopdEk1Cby1JtkhAFX61SkEku']);
    }
  });
});

module.exports = db;
