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

    const getMediaElement = (url) => {
        if (!url) return '';
        
        // YouTube URL parsing
        const ytReg = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const ytMatch = url.match(ytReg);
        if (ytMatch && ytMatch[1]) {
            const videoId = ytMatch[1];
            return `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 12px; width: 100%; height: 100%;"></iframe>`;
        }
        
        // Vimeo URL parsing
        const vimeoReg = /(?:vimeo\.com\/(?:channels\/[^\/]+\/|groups\/[^\/]+\/album\/\d+\/video\/|video\/|)|player\.vimeo\.com\/video\/)(\d+)/i;
        const vimeoMatch = url.match(vimeoReg);
        if (vimeoMatch && vimeoMatch[1]) {
            const videoId = vimeoMatch[1];
            return `<iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="border-radius: 12px; width: 100%; height: 100%;"></iframe>`;
        }
        
        // Direct video format
        if (/\.(mp4|webm|ogg|mov)$/i.test(url)) {
            return `<video src="${url}" controls style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"></video>`;
        }
        
        // Image format
        return `<img src="${url}" alt="Intro Visual" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;" onerror="this.style.display='none';">`;
    };

    const showVideoPreview = (url) => {
        const previewContainer = document.getElementById('video-preview-container');
        const wrapper = document.getElementById('video-preview-iframe-wrapper');
        if (!previewContainer || !wrapper) return;
        
        if (!url) {
            previewContainer.classList.add('d-none');
            return;
        }
        
        const mediaHtml = getMediaElement(url);
        if (mediaHtml) {
            wrapper.innerHTML = mediaHtml;
            previewContainer.classList.remove('d-none');
        } else {
            previewContainer.classList.add('d-none');
        }
    };

    const updateVideoUrl = () => {
        const url = document.getElementById('video-url-input').value.trim();
        if (!url) {
            alert('אנא הזן כתובת URL תקינה');
            return;
        }
        
        const jsonEditor = document.getElementById('json-editor');
        try {
            const config = JSON.parse(jsonEditor.value);
            if (!config.intro) config.intro = {};
            config.intro.introVideoUrl = url;
            jsonEditor.value = JSON.stringify(config, null, 2);
            showVideoPreview(url);
            alert('כתובת הסרטון עודכנה בהצלחה בעורך ה-JSON! אל תשכח ללחוץ על "שמור שינויים"');
        } catch (e) {
            alert('לא ניתן לעדכן את ה-URL: שגיאה בתחביר ה-JSON בעורך.');
        }
    };

    const initDashboard = async () => {
        if (!checkAuth()) return;
        
        await loadConfigIntoEditor();
    };

    const loadConfigIntoEditor = async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/admin/config`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (res.ok) {
                const config = await res.json();
                document.getElementById('json-editor').value = JSON.stringify(config, null, 2);
                
                // Pre-populate video URL if exists
                if (config.intro && config.intro.introVideoUrl) {
                    const videoInput = document.getElementById('video-url-input');
                    if (videoInput) {
                        videoInput.value = config.intro.introVideoUrl;
                        showVideoPreview(config.intro.introVideoUrl);
                    }
                }
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
        logout,
        updateVideoUrl
    };
})();
