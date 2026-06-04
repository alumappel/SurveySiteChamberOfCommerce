require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');

const sqliteDbPath = path.resolve(__dirname, 'survey.db');
const sqliteDb = new sqlite3.Database(sqliteDbPath);

const mysqlPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'survey_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function migrate() {
  try {
    console.log("Starting migration from SQLite to MySQL...");
    
    // 1. Migrate Admin Users
    console.log("Migrating admin_users...");
    sqliteDb.all("SELECT * FROM admin_users", [], async (err, users) => {
      if (err) {
        console.error("Error reading admin_users from SQLite:", err);
        return;
      }
      
      for (const user of users) {
        try {
          // Check if user already exists in MySQL
          const [existingUsers] = await mysqlPool.execute("SELECT * FROM admin_users WHERE username = ?", [user.username]);
          
          if (existingUsers.length === 0) {
            await mysqlPool.execute(
              "INSERT INTO admin_users (username, password_hash, last_login_at, created_at) VALUES (?, ?, ?, ?)", 
              [user.username, user.password_hash, user.last_login_at || null, user.created_at]
            );
            console.log(`Migrated user: ${user.username}`);
          } else {
            console.log(`User ${user.username} already exists in MySQL. Skipping.`);
          }
        } catch (e) {
          console.error(`Error inserting user ${user.username} into MySQL:`, e);
        }
      }
      
      // 2. Migrate Surveys
      console.log("Migrating surveys...");
      sqliteDb.all("SELECT * FROM surveys", [], async (err, surveys) => {
        if (err) {
          console.error("Error reading surveys from SQLite:", err);
          return;
        }
        
        for (const survey of surveys) {
          try {
            // Check if survey already exists
            const [existingSurveys] = await mysqlPool.execute("SELECT * FROM surveys WHERE id = ?", [survey.id]);
            
            if (existingSurveys.length === 0) {
              await mysqlPool.execute(
                "INSERT INTO surveys (id, name, config_json, is_active, created_at) VALUES (?, ?, ?, ?, ?)", 
                [survey.id, survey.name, survey.config_json, survey.is_active, survey.created_at]
              );
              console.log(`Migrated survey: ${survey.name} (${survey.id})`);
            } else {
              console.log(`Survey ${survey.id} already exists in MySQL. Skipping.`);
            }
          } catch (e) {
            console.error(`Error inserting survey ${survey.id} into MySQL:`, e);
          }
        }
        
        console.log("Migration complete!");
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

// Ensure the db initialization from db.js is not needed directly since tables should be there, 
// but if they are not, db.js initializes them. Let's wait a second and then run.
setTimeout(migrate, 2000);
