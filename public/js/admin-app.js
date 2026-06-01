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
        
        await loadSurveysList();
        // Also keep JSON editor functionality for advanced tab
        await loadConfigIntoEditor();
    };

    const loadSurveysList = async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/admin/surveys`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (res.ok) {
                const surveys = await res.json();
                const tbody = document.getElementById('surveys-table-body');
                tbody.innerHTML = '';
                
                if (surveys.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" class="text-center">לא נמצאו שאלונים. צור אחד חדש.</td></tr>`;
                    return;
                }

                surveys.forEach(s => {
                    const statusBadge = s.is_active ? '<span class="badge bg-success">פעיל</span>' : '<span class="badge bg-secondary">לא פעיל</span>';
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="fw-bold">${s.name}</td>
                        <td>${new Date(s.created_at).toLocaleString('he-IL')}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="AdminApp.editSurvey('${s.id}')" title="ערוך"><i class="bi bi-pencil"></i> ערוך</button>
                            <button class="btn btn-sm btn-outline-secondary me-1" onclick="AdminApp.copySurveyLink('${s.id}')" title="העתק קישור"><i class="bi bi-link-45deg"></i> קישור</button>
                            <button class="btn btn-sm btn-outline-success" onclick="AdminApp.exportSurveyData('${s.id}')" title="הורד נתונים"><i class="bi bi-file-earmark-excel"></i> אקסל</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (err) {
            console.error('Failed to load surveys', err);
        }
    };

    const createNewSurvey = async () => {
        try {
            // Default config template
            const defaultConfig = {
                surveyId: 'survey-' + Date.now(),
                surveyName: "שאלון חדש",
                isActive: true,
                rtl: true,
                language: "he",
                intro: { title: "ברוכים הבאים לסקר", body: "אנא ענו על מספר שאלות קצרות.", introVideoUrl: "" },
                openingForm: {
                    fields: [
                        { name: "business_name", label: "שם העסק", type: "text", required: true }
                    ]
                },
                rating: { type: "vertical_slider", min: 0, max: 100, topLabel: "100%", bottomLabel: "0%", autoAdvanceDelayMs: 1000 },
                toasts: { halfway: { message: "מעולה, עברת חצי!" }, lastThree: { message: "עוד 3 נושאים לסיום" } },
                topics: [
                    { id: "topic1", title: "נושא לדוגמה 1", description: "תיאור נושא 1", isActive: true },
                    { id: "topic2", title: "נושא לדוגמה 2", description: "תיאור נושא 2", isActive: true }
                ],
                completion: { title: "תודה רבה!", message: "התשובות התקבלו בהצלחה." },
                idle: { timeoutSeconds: 120, message: "האם תרצה להמשיך?" }
            };

            const res = await fetch(`${BASE_URL}/api/admin/surveys`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token') 
                },
                body: JSON.stringify({ name: defaultConfig.surveyName, config: defaultConfig })
            });
            if (res.ok) {
                await loadSurveysList();
                alert('שאלון חדש נוצר בהצלחה!');
            }
        } catch (err) {
            console.error('Failed to create survey', err);
            alert('שגיאה ביצירת שאלון');
        }
    };

    const copySurveyLink = (id) => {
        // Assuming survey runs on root URL
        const link = window.location.origin + '/?survey=' + id;
        navigator.clipboard.writeText(link).then(() => {
            alert('הקישור הועתק בהצלחה: ' + link);
        });
    };

    const exportSurveyData = async (id) => {
        try {
            const res = await fetch(`${BASE_URL}/api/admin/export?survey_id=${id}`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (!res.ok) throw new Error('Export failed');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `survey_responses_${id}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('שגיאה בייצוא הנתונים לשאלון זה');
        }
    };

    // VISUAL EDITOR LOGIC
    let currentEditingConfig = null;

    const editSurvey = async (id) => {
        try {
            const res = await fetch(`${BASE_URL}/api/admin/surveys/${id}`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (res.ok) {
                currentEditingConfig = await res.json();
                populateVisualEditor(id, currentEditingConfig);
                switchTab('visual');
            }
        } catch (err) {
            console.error('Failed to fetch survey config', err);
            alert('שגיאה בטעינת נתוני השאלון');
        }
    };

    const populateVisualEditor = (id, config) => {
        document.getElementById('ve-survey-id').value = id;
        document.getElementById('ve-survey-name').value = config.surveyName || '';
        document.getElementById('ve-intro-title').value = config.intro?.title || '';
        document.getElementById('ve-intro-body').value = config.intro?.body || '';
        document.getElementById('ve-video-url').value = config.intro?.introVideoUrl || '';
        previewVisualMedia();

        document.getElementById('ve-completion-title').value = config.completion?.title || '';
        document.getElementById('ve-completion-message').value = config.completion?.message || '';

        renderTopicsEditor(config.topics || []);
    };

    const renderTopicsEditor = (topics) => {
        const container = document.getElementById('ve-topics-container');
        container.innerHTML = '';
        topics.forEach((t, index) => {
            const div = document.createElement('div');
            div.className = 'topic-edit-item card p-3 mb-3 border-secondary';
            div.innerHTML = `
                <div class="d-flex justify-content-between mb-2">
                    <h6 class="mb-0">נושא ${index + 1}</h6>
                    <button type="button" class="btn btn-sm btn-danger" onclick="AdminApp.removeTopic(${index})">הסר נושא</button>
                </div>
                <div class="mb-2">
                    <label class="form-label form-label-sm">כותרת הנושא</label>
                    <input type="text" class="form-control form-control-sm topic-title-input" value="${t.title || ''}" required>
                </div>
                <div class="mb-2">
                    <label class="form-label form-label-sm">תיאור הנושא</label>
                    <textarea class="form-control form-control-sm topic-desc-input" rows="2" required>${t.description || ''}</textarea>
                </div>
                <div class="form-check form-switch mt-2">
                    <input class="form-check-input topic-active-input" type="checkbox" role="switch" ${t.isActive !== false ? 'checked' : ''}>
                    <label class="form-check-label">פעיל ויוצג למשתמש</label>
                </div>
            `;
            container.appendChild(div);
        });
    };

    const addTopic = () => {
        if (!currentEditingConfig.topics) currentEditingConfig.topics = [];
        currentEditingConfig.topics.push({ id: "topic_" + Date.now(), title: "", description: "", isActive: true });
        renderTopicsEditor(currentEditingConfig.topics);
    };

    const removeTopic = (index) => {
        if (confirm('האם אתה בטוח שברצונך להסיר נושא זה?')) {
            currentEditingConfig.topics.splice(index, 1);
            renderTopicsEditor(currentEditingConfig.topics);
        }
    };

    const previewVisualMedia = () => {
        const url = document.getElementById('ve-video-url').value.trim();
        const container = document.getElementById('ve-media-preview-container');
        const wrapper = document.getElementById('ve-media-preview-wrapper');
        if (!url) {
            container.classList.add('d-none');
            return;
        }
        
        const html = getMediaElement(url);
        if (html) {
            wrapper.innerHTML = html;
            container.classList.remove('d-none');
        } else {
            container.classList.add('d-none');
        }
    };

    const cancelVisualEdit = () => {
        currentEditingConfig = null;
        switchTab('surveys');
    };

    const saveVisualEdit = async () => {
        const form = document.getElementById('visual-editor-form');
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            alert('אנא מלא את כל השדות החובה בטופס (מודגשים באדום).');
            return;
        }

        const id = document.getElementById('ve-survey-id').value;
        const surveyName = document.getElementById('ve-survey-name').value.trim();

        // Update currentEditingConfig object
        currentEditingConfig.surveyName = surveyName;
        if (!currentEditingConfig.intro) currentEditingConfig.intro = {};
        currentEditingConfig.intro.title = document.getElementById('ve-intro-title').value.trim();
        currentEditingConfig.intro.body = document.getElementById('ve-intro-body').value.trim();
        currentEditingConfig.intro.introVideoUrl = document.getElementById('ve-video-url').value.trim();

        if (!currentEditingConfig.completion) currentEditingConfig.completion = {};
        currentEditingConfig.completion.title = document.getElementById('ve-completion-title').value.trim();
        currentEditingConfig.completion.message = document.getElementById('ve-completion-message').value.trim();

        // Topics
        const topicItems = document.querySelectorAll('#ve-topics-container .topic-edit-item');
        currentEditingConfig.topics.forEach((t, index) => {
            if (topicItems[index]) {
                t.title = topicItems[index].querySelector('.topic-title-input').value.trim();
                t.description = topicItems[index].querySelector('.topic-desc-input').value.trim();
                t.isActive = topicItems[index].querySelector('.topic-active-input').checked;
            }
        });

        try {
            const res = await fetch(`${BASE_URL}/api/admin/surveys/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                },
                body: JSON.stringify({ name: surveyName, config: currentEditingConfig, is_active: true })
            });

            if (res.ok) {
                alert('השינויים נשמרו בהצלחה!');
                await loadSurveysList();
                switchTab('surveys');
            } else {
                alert('שגיאה בשמירת השאלון');
            }
        } catch (err) {
            console.error(err);
            alert('שגיאת תקשורת במערכת');
        }
    };

    const loadConfigIntoEditor = async () => {
        // Loads default or recent survey into JSON editor just in case
        try {
            const res = await fetch(`${BASE_URL}/api/survey/config`);
            if (res.ok) {
                const config = await res.json();
                document.getElementById('json-editor').value = JSON.stringify(config, null, 2);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const saveConfig = async () => {
        alert('כדי לשמור עריכת JSON באופן ישיר, יש להשתמש בטופס העורך הוויזואלי במקום. שמירה מפה מושבתת כרגע בגרסה זו.');
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
        document.getElementById('section-surveys').classList.add('d-none');
        document.getElementById('section-visual').classList.add('d-none');
        document.getElementById('section-data').classList.add('d-none');
        document.getElementById('section-config').classList.add('d-none');
        
        document.getElementById('tab-surveys').classList.remove('active');
        document.getElementById('tab-visual').classList.remove('active');
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
        updateVideoUrl,
        loadSurveysList,
        createNewSurvey,
        copySurveyLink,
        exportSurveyData,
        editSurvey,
        previewVisualMedia,
        cancelVisualEdit,
        saveVisualEdit,
        addTopic,
        removeTopic
    };
})();
