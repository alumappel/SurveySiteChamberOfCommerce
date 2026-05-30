const AdminApp = (() => {
    const BASE_URL = 'http://localhost:3000'; // ערוך לכתובת השרת האמיתי בסביבת פרודקשן

    const checkAuth = () => {
        if (!localStorage.getItem('admin_token')) {
            window.location.href = 'admin.html';
            return false;
        }
        return true;
    };

    const initLogin = () => {
        const form = document.getElementById('admin-login-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const res = await fetch(`${BASE_URL}/api/admin/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('admin_token', data.token);
                    window.location.href = 'admin-dashboard.html';
                } else {
                    document.getElementById('login-error').classList.remove('d-none');
                }
            } catch (err) {
                console.error(err);
                alert('שגיאת תקשורת');
            }
        });
    };

    const initDashboard = async () => {
        if (!checkAuth()) return;
        
        await loadConfigIntoEditor();

        // Setup image upload
        const uploadForm = document.getElementById('image-upload-form');
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('image-file');
            const file = fileInput.files[0];
            if (!file) return;

            // Check file size (2MB max)
            if (file.size > 2 * 1024 * 1024) {
                alert('הקובץ חורג מ-2MB');
                return;
            }

            const formData = new FormData();
            formData.append('image', file);

            try {
                const res = await fetch(`${BASE_URL}/api/admin/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') },
                    body: formData
                });
                
                if (res.ok) {
                    const data = await res.json();
                    const resultDiv = document.getElementById('upload-result');
                    resultDiv.classList.remove('d-none');
                    resultDiv.innerHTML = `תמונה הועלתה בהצלחה. העתק את הקישור הבא והדבק ב-JSON: <br> <strong>${data.url}</strong>`;
                } else {
                    alert('שגיאה בהעלאת התמונה');
                }
            } catch (err) {
                console.error(err);
                alert('שגיאת תקשורת');
            }
        });
    };

    const loadConfigIntoEditor = async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/admin/config`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (res.ok) {
                const config = await res.json();
                document.getElementById('json-editor').value = JSON.stringify(config, null, 2);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const saveConfig = async () => {
        const editorValue = document.getElementById('json-editor').value;
        let configObj;
        try {
            configObj = JSON.parse(editorValue);
        } catch (e) {
            alert('שגיאה בתחביר ה-JSON. אנא תקן ונסה שוב.');
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/api/admin/config`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                },
                body: JSON.stringify(configObj)
            });

            if (res.ok) {
                alert('הגדרות נשמרו בהצלחה!');
            } else {
                alert('שגיאה בשמירת ההגדרות');
            }
        } catch (err) {
            console.error(err);
            alert('שגיאת תקשורת');
        }
    };

    const exportData = async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/admin/export`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (!res.ok) throw new Error('Export failed');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'survey_responses.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('שגיאה בייצוא הנתונים');
        }
    };

    const switchTab = (tabId) => {
        document.getElementById('section-data').classList.add('d-none');
        document.getElementById('section-config').classList.add('d-none');
        document.getElementById('tab-data').classList.remove('active');
        document.getElementById('tab-config').classList.remove('active');

        document.getElementById(`section-${tabId}`).classList.remove('d-none');
        document.getElementById(`tab-${tabId}`).classList.add('active');
    };

    const logout = () => {
        localStorage.removeItem('admin_token');
        window.location.href = 'admin.html';
    };

    return {
        initLogin,
        initDashboard,
        saveConfig,
        exportData,
        switchTab,
        logout
    };
})();
