const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const exceljs = require('exceljs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 30 * 24 * 60 * 60 * 1000
};

// // Middleware
// app.use(cors());
// app.use(bodyParser.json());
// app.use(cookieParser());
// app.use(express.static(path.join(__dirname, 'public')));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Middleware
const allowedOrigins = [
  'https://alumappel.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.set('trust proxy', 1);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'ngrok-skip-browser-warning'
  ]
}));

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads dir exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Admin Authentication Middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader === 'Bearer authenticated') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// --- API ROUTES ---

// Get Survey Config (Client)
app.get('/api/survey/config', (req, res) => {
  const surveyId = req.query.id;
  let query = "SELECT config_json FROM surveys WHERE is_active = 1";
  let params = [];
  
  if (surveyId) {
    query += " AND id = ?";
    params.push(surveyId);
  } else {
    query += " ORDER BY created_at ASC LIMIT 1"; // Default to the first active survey
  }
  
  db.get(query, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      res.json(JSON.parse(row.config_json));
    } else {
      res.status(404).json({ error: 'Configuration not found' });
    }
  });
});

// Start/Resume Survey
app.post('/api/survey/start', (req, res) => {
  const { respondent_id, survey_id, business_name, business_sector, employee_count } = req.body;
  const response_id = 'resp_' + Date.now() + Math.random().toString(36).substr(2, 9);

  if (respondent_id) {
    res.cookie('respondent_id', respondent_id, COOKIE_OPTIONS);
  }


  db.get("SELECT * FROM responses WHERE respondent_id = ? AND status IN ('in_progress', 'abandoned')", [respondent_id], (err, row) => {
    if (row) {
      res.json({ message: 'Resumed', response_id: row.response_id, data: row });
    } else {
      db.run(`INSERT INTO responses (response_id, respondent_id, survey_id, business_name, business_sector, employee_count, status, started_at) 
              VALUES (?, ?, ?, ?, ?, ?, 'in_progress', CURRENT_TIMESTAMP)`,
        [response_id, respondent_id, survey_id, business_name, business_sector, employee_count], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Started', response_id });
        });
    }
  });
});

// Update Survey Progress
app.put('/api/survey/update/:response_id', (req, res) => {
  const { response_id } = req.params;
  const { topic_ratings_json, last_answered_topic_index, last_answered_topic_id, status, final_comment } = req.body;

  let query = `UPDATE responses SET topic_ratings_json = ?, last_answered_topic_index = ?, last_answered_topic_id = ?, status = ?, final_comment = ?, updated_at = CURRENT_TIMESTAMP`;
  let params = [topic_ratings_json, last_answered_topic_index, last_answered_topic_id, status, final_comment];

  if (status === 'completed') {
    query += `, completed_at = CURRENT_TIMESTAMP`;
  }

  query += ` WHERE response_id = ?`;
  params.push(response_id);

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Updated' });
  });
});

// --- ADMIN ROUTES ---

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM admin_users WHERE username = ?", [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      res.json({ message: 'Logged in', token: 'authenticated' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

// --- ADMIN SURVEYS ROUTES ---

// Get all surveys
app.get('/api/admin/surveys', authenticateAdmin, (req, res) => {
  db.all("SELECT id, name, is_active, created_at FROM surveys ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get single survey config for admin
app.get('/api/admin/surveys/:id', authenticateAdmin, (req, res) => {
  db.get("SELECT * FROM surveys WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Survey not found' });
    res.json(JSON.parse(row.config_json));
  });
});

// Create new survey
app.post('/api/admin/surveys', authenticateAdmin, (req, res) => {
  const { name, config } = req.body;
  const id = 'survey_' + Date.now() + Math.random().toString(36).substr(2, 9);
  const configJson = JSON.stringify(config);
  
  db.run("INSERT INTO surveys (id, name, config_json, is_active) VALUES (?, ?, ?, 1)", [id, name, configJson], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name, message: 'Survey created' });
  });
});

// Update survey config
app.put('/api/admin/surveys/:id', authenticateAdmin, (req, res) => {
  const { name, config, is_active } = req.body;
  const configJson = JSON.stringify(config);
  
  db.run("UPDATE surveys SET name = ?, config_json = ?, is_active = ? WHERE id = ?", 
    [name || config.surveyName, configJson, is_active === false ? 0 : 1, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Survey updated' });
  });
});

// Upload Image
app.post('/api/admin/upload', authenticateAdmin, upload.single('image'), (req, res) => {
  if (req.file) {
    res.json({ url: '/uploads/' + req.file.filename });
  } else {
    res.status(400).json({ error: 'Upload failed' });
  }
});

// Export Data
app.get('/api/admin/export', authenticateAdmin, (req, res) => {
  const surveyId = req.query.survey_id;
  
  // First, get survey configs to map topic IDs to titles
  db.all("SELECT id, config_json FROM surveys", [], (err, surveyRows) => {
    if (err) return res.status(500).send(err.message);
    
    const topicIdToTitle = {};
    const orderedTopicsForSurvey = [];

    surveyRows.forEach(s => {
       try {
           const config = JSON.parse(s.config_json);
           if (config && config.topics) {
               config.topics.forEach(t => {
                   topicIdToTitle[t.id] = t.title || t.id;
                   if (surveyId && s.id === surveyId) {
                       orderedTopicsForSurvey.push(t.id);
                   }
               });
           }
       } catch (e) {
           console.error("Failed to parse survey config", e);
       }
    });

    let query = "SELECT * FROM responses";
    let params = [];
    if (surveyId) {
      query += " WHERE survey_id = ?";
      params.push(surveyId);
    }
    
    db.all(query, params, async (err, rows) => {
      if (err) return res.status(500).send(err.message);

      rows.forEach(row => {
          try {
              row.ratings = JSON.parse(row.topic_ratings_json || '{}');
          } catch (e) {
              row.ratings = {};
          }
      });

      let orderedTopicIds = [];
      if (surveyId && orderedTopicsForSurvey.length > 0) {
          orderedTopicIds = orderedTopicsForSurvey;
      } else {
          const topicIds = new Set();
          rows.forEach(row => {
              Object.keys(row.ratings).forEach(topicId => topicIds.add(topicId));
          });
          orderedTopicIds = Array.from(topicIds);
      }

      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Responses');

      const columns = [
        { header: 'ID', key: 'response_id', width: 20 },
        { header: 'Business Name', key: 'business_name', width: 20 },
        { header: 'Sector', key: 'business_sector', width: 15 },
        { header: 'Employees', key: 'employee_count', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Started', key: 'started_at', width: 20 },
        { header: 'Completed', key: 'completed_at', width: 20 }
      ];

      orderedTopicIds.forEach(topicId => {
          columns.push({
             header: topicIdToTitle[topicId] || topicId,
             key: `topic_${topicId}`,
             width: 25
          });
      });

      worksheet.columns = columns;

      rows.forEach(row => {
          const rowData = { ...row };
          orderedTopicIds.forEach(topicId => {
              rowData[`topic_${topicId}`] = row.ratings[topicId] !== undefined ? row.ratings[topicId] : '';
          });
          worksheet.addRow(rowData);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=' + (surveyId ? `survey_responses_${surveyId}.xlsx` : 'survey_responses.xlsx'));

      await workbook.xlsx.write(res);
      res.end();
    });
  });
});

// Debug route to view all records in the DB
app.get('/api/debug/responses', (req, res) => {
  db.all("SELECT * FROM responses", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Fallback to index.html for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
