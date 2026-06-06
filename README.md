# Survey System for Chamber of Commerce

A comprehensive, dynamic web-based survey management system designed for the Chamber of Commerce. This platform enables administrators to create, edit, and analyze custom business surveys while providing a seamless, state-saving survey-taking experience for business owners.

## 🚀 Features

### 📋 Respondent Interface
- **Dynamic Survey Loading:** Survey configurations (topics, questions, etc.) are fetched dynamically from the database.
- **Progress Auto-Saving:** Saves progress locally and on the server. Respondents can resume incomplete surveys.
- **State Management:** Captures business metadata (Name, Sector, Employee Count) and tracks survey duration.

### 📊 Admin Dashboard
- **Admin Authentication:** Secure login dashboard utilizing `bcryptjs` password hashing.
- **Survey Creator & Manager:** Create, update, and delete surveys. Manage active configurations dynamically without code changes.
- **Image Upload:** Upload images directly through the dashboard (powered by `multer`).
- **Data Visualization:** Graphical analytics of response ratings using `Chart.js`.
- **Excel Export:** Download complete survey response data as formatted Excel sheets using `exceljs`, mapping topic IDs to actual survey titles.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MySQL (relational database using `mysql2/promise` pool)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+), Chart.js
- **Dependencies:** `bcryptjs`, `cookie-parser`, `cors`, `dotenv`, `exceljs`, `express`, `multer`, `mysql2`

---

## 📂 Project Structure

```text
├── db.js                   # Database configuration, pool setup, and table migration script
├── server.js               # Express server, API routing (Auth, Survey Client APIs, Admin Dashboard APIs)
├── package.json            # Node.js project manifest & script commands
├── .env.example            # Environment variables template
├── .env                    # Local environment variables (git-ignored)
└── public/                 # Static frontend files
    ├── index.html          # Respondent Welcome Page
    ├── survey.html         # Respondent Interactive Survey Page
    ├── admin.html          # Admin Login Page
    ├── admin-dashboard.html# Admin Analytics and Dashboard Page
    ├── css/
    │   ├── user-styles.css # Styles for survey pages
    │   └── admin-styles.css# Styles for admin pages
    └── js/
        ├── user-app.js     # Frontend logic for survey client
        ├── admin-app.js    # Frontend logic for admin dashboard
        └── chart.min.js    # Chart.js library for reporting
```

---

## ⚙️ Installation & Setup

Follow these steps to run the project locally:

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- [MySQL](https://www.mysql.com/) database server

### 2. Configure Environment Variables
Create a `.env` file in the root directory. You can base it on `.env.example`:
```env
DB_HOST=your_mysql_host
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_database_name
PORT=3000
```

### 3. Install Dependencies
Run the package installation command to pull in all required libraries:
```bash
npm install
```

### 4. Database Setup
The server is designed to initialize the required tables automatically on startup if they don't exist. Ensure that your MySQL database (`DB_NAME`) is created beforehand.
The initialized tables are:
- `responses`: Holds client responses, metadata, and status.
- `response_versions`: Tracks changes and versioning for responses.
- `surveys`: Stores JSON configurations of surveys.
- `admin_users`: Manages admin login credentials.

*Note: A default admin user is created automatically on the first run:*
- **Username:** `admin`
- **Password:** `password123` *(Remember to update this hash in production!)*

### 5. Run the Server
Launch the development server:
```bash
npm start
```
The application will be running at [http://localhost:3000](http://localhost:3000).

---

## 🔒 API Endpoints Overview

### User APIs
- `GET /api/survey/config` - Fetches the active survey layout/configuration.
- `POST /api/survey/start` - Creates or resumes a survey session.
- `PUT /api/survey/update/:response_id` - Updates progress, ratings, and completes a survey.

### Admin APIs
- `POST /api/admin/login` - Authenticates admin users.
- `GET /api/admin/surveys` - Lists all created surveys.
- `POST /api/admin/surveys` - Creates a new survey config.
- `PUT /api/admin/surveys/:id` - Updates an existing survey config.
- `DELETE /api/admin/surveys/:id` - Deletes a survey and its responses.
- `GET /api/admin/responses/:survey_id` - Fetches all response rows for dashboard analytics.
- `POST /api/admin/upload` - Handles dashboard image uploads.
- `GET /api/admin/export` - Compiles and downloads an Excel spreadsheet (`.xlsx`) containing survey responses.
