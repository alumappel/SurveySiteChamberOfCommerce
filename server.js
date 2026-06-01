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

// Get Survey Config
app.get('/api/survey/config', (req, res) => {
  const configPath = path.join(__dirname, 'survey.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json(config);
  } else {
    res.status(404).json({ error: 'Configuration not found' });
  }
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
  const { topic_ratings_json, last_answered_topic_index, last_answered_topic_id, status } = req.body;

  let query = `UPDATE responses SET topic_ratings_json = ?, last_answered_topic_index = ?, last_answered_topic_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP`;
  let params = [topic_ratings_json, last_answered_topic_index, last_answered_topic_id, status];

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

// Get Survey Config for Admin (protected)
app.get('/api/admin/config', authenticateAdmin, (req, res) => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'survey.json'), 'utf8'));
  res.json(config);
});

// Update Survey Config
app.put('/api/admin/config', authenticateAdmin, (req, res) => {
  fs.writeFileSync(path.join(__dirname, 'survey.json'), JSON.stringify(req.body, null, 2), 'utf8');
  res.json({ message: 'Config updated' });
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
  db.all("SELECT * FROM responses", [], async (err, rows) => {
    if (err) return res.status(500).send(err.message);

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Responses');

    worksheet.columns = [
      { header: 'ID', key: 'response_id', width: 20 },
      { header: 'Business Name', key: 'business_name', width: 20 },
      { header: 'Sector', key: 'business_sector', width: 15 },
      { header: 'Employees', key: 'employee_count', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Started', key: 'started_at', width: 20 },
      { header: 'Completed', key: 'completed_at', width: 20 },
      { header: 'Ratings', key: 'topic_ratings_json', width: 50 }
    ];

    rows.forEach(row => worksheet.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + 'survey_responses.xlsx');

    await workbook.xlsx.write(res);
    res.end();
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
