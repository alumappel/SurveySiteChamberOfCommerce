const fs = require('fs');
const path = require('path');
const db = require('./db');

const configPath = path.join(__dirname, 'survey.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const surveyId = config.surveyId || 'survey-2026-01';
  const surveyName = config.surveyName || 'סקר עסקים - לשכת המסחר';
  
  db.serialize(() => {
    // Ensure table exists
    db.run(`CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      name TEXT,
      config_json TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert or replace
    db.get("SELECT * FROM surveys WHERE id = ?", [surveyId], (err, row) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      if (!row) {
        db.run("INSERT INTO surveys (id, name, config_json, is_active) VALUES (?, ?, ?, 1)", 
          [surveyId, surveyName, JSON.stringify(config)], 
          (err) => {
            if (err) console.error(err);
            else console.log('Successfully migrated survey.json to database.');
            process.exit(0);
          }
        );
      } else {
        console.log('Survey already exists in database. Skipping migration.');
        process.exit(0);
      }
    });
  });
} else {
  console.log('survey.json not found, nothing to migrate.');
  process.exit(0);
}
