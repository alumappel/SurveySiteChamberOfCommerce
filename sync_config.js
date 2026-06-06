const fs = require('fs');
const path = require('path');
const db = require('./db');

async function sync() {
  const configPath = path.join(__dirname, 'survey.json');
  if (!fs.existsSync(configPath)) {
    console.error('survey.json not found');
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error("Failed to parse survey.json:", err);
    process.exit(1);
  }
  const surveyId = config.surveyId;
  const surveyName = config.surveyName;
  const configJson = JSON.stringify(config);

  try {
    const [rows] = await db.execute("SELECT * FROM surveys WHERE id = ?", [surveyId]);
    if (rows.length > 0) {
      await db.execute("UPDATE surveys SET name = ?, config_json = ? WHERE id = ?", [surveyName, configJson, surveyId]);
      console.log(`Successfully updated survey config for ID: ${surveyId} in the remote database.`);
    } else {
      await db.execute("INSERT INTO surveys (id, name, config_json, is_active) VALUES (?, ?, ?, 1)", [surveyId, surveyName, configJson]);
      console.log(`Successfully inserted new survey config for ID: ${surveyId} in the remote database.`);
    }
    process.exit(0);
  } catch (err) {
    console.error("Failed to sync config:", err);
    process.exit(1);
  }
}

sync();
