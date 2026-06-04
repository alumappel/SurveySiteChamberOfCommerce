require('dotenv').config();
const mysql = require('mysql2/promise');

// Create the connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'survey_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDb() {
  try {
    // Create responses table
    await pool.execute(`CREATE TABLE IF NOT EXISTS responses (
      response_id VARCHAR(255) PRIMARY KEY,
      respondent_id VARCHAR(255),
      survey_id VARCHAR(255),
      business_name VARCHAR(255),
      business_sector VARCHAR(255),
      employee_count VARCHAR(255),
      topic_ratings_json TEXT,
      topic_display_order_json TEXT,
      status VARCHAR(50),
      started_at DATETIME,
      completed_at DATETIME,
      duration_seconds INT,
      last_answered_topic_index INT,
      last_answered_topic_id VARCHAR(255),
      final_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // Create response_versions table
    await pool.execute(`CREATE TABLE IF NOT EXISTS response_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      response_id VARCHAR(255),
      version_number INT,
      topic_ratings_json TEXT,
      final_comment TEXT,
      change_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(response_id) REFERENCES responses(response_id) ON DELETE CASCADE
    )`);

    // Create surveys table
    await pool.execute(`CREATE TABLE IF NOT EXISTS surveys (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      config_json TEXT,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create admin_users table
    await pool.execute(`CREATE TABLE IF NOT EXISTS admin_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255),
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert default admin user if not exists (username: admin, password: password123)
    const [rows] = await pool.execute("SELECT * FROM admin_users WHERE username = ?", ['admin']);
    if (rows.length === 0) {
      await pool.execute("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", ['admin', '$2a$10$wYu2zh047bQZ2dmhCJ9wQuWLUUwagopdEk1Cby1JtkhAFX61SkEku']);
    }
    
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
}

initDb();

module.exports = pool;
