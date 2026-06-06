const AdminApp = (() => {
    const BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') ? 'http://localhost:3000' : '';

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
                    localStorage.setItem('admin_permissions', data.permissions || 'full');
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
        
        const permissions = localStorage.getItem('admin_permissions') || 'full';
        if (permissions === 'partial') {
            const sidebar = document.getElementById('admin-sidebar');
            if (sidebar) sidebar.classList.add('d-none');
            const mainContent = document.getElementById('admin-main-content');
            if (mainContent) {
                mainContent.classList.remove('col-md-9');
                mainContent.classList.add('col-md-12');
            }
            await openDashboard();
        } else {
            await loadSurveysList();
            // Also keep JSON editor functionality for advanced tab
            await loadConfigIntoEditor();
        }
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
                            <button class="btn btn-sm btn-outline-success me-1" onclick="AdminApp.exportSurveyData('${s.id}')" title="הורד נתונים"><i class="bi bi-file-earmark-excel"></i> אקסל</button>
                            <button class="btn btn-sm btn-outline-info me-1" onclick="AdminApp.openDashboard('${s.id}')" title="דשבורד תוצאות"><i class="bi bi-graph-up"></i> תוצאות</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="AdminApp.deleteSurvey('${s.id}')" title="מחק שאלון"><i class="bi bi-trash"></i> מחק</button>
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

    let surveyToDelete = null;

    const deleteSurvey = (id) => {
        surveyToDelete = id;
        const modal = new bootstrap.Modal(document.getElementById('deleteSurveyModal'));
        modal.show();
        
        document.getElementById('confirm-delete-btn').onclick = async () => {
            modal.hide();
            try {
                const res = await fetch(`${BASE_URL}/api/admin/surveys/${surveyToDelete}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
                });
                if (res.ok) {
                    await loadSurveysList();
                    // if currently open in dashboard, clear dashboard
                    const select = document.getElementById('results-survey-select');
                    if (select && select.value === surveyToDelete) {
                        document.getElementById('results-content').classList.add('d-none');
                        document.getElementById('results-empty').classList.remove('d-none');
                    }
                } else {
                    alert('שגיאה במחיקת השאלון');
                }
            } catch (err) {
                console.error(err);
                alert('שגיאת תקשורת');
            }
        };
    };

    // VISUAL EDITOR LOGIC
    let currentEditingConfig = null;
    let quillEditor = null;

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
        
        if (!quillEditor) {
            quillEditor = new Quill('#ve-intro-body-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['clean']
                    ]
                }
            });
        }
        quillEditor.root.innerHTML = config.intro?.body || '';
        
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
        
        const introText = quillEditor ? quillEditor.getText().trim() : '';
        if (!introText) {
            alert('אנא הזן טקסט פתיחה.');
            return;
        }

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
        currentEditingConfig.intro.body = quillEditor ? quillEditor.root.innerHTML : '';
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
        const permissions = localStorage.getItem('admin_permissions') || 'full';
        if (permissions === 'partial' && tabId !== 'results') {
            return; // block navigation for partial permissions
        }
        document.getElementById('section-surveys').classList.add('d-none');
        document.getElementById('section-visual').classList.add('d-none');
        document.getElementById('section-data').classList.add('d-none');
        document.getElementById('section-config').classList.add('d-none');
        document.getElementById('section-results').classList.add('d-none');
        
        document.getElementById('tab-surveys').classList.remove('active');
        document.getElementById('tab-visual').classList.remove('active');
        document.getElementById('tab-data').classList.remove('active');
        document.getElementById('tab-config').classList.remove('active');
        document.getElementById('tab-results').classList.remove('active');

        document.getElementById(`section-${tabId}`).classList.remove('d-none');
        document.getElementById(`tab-${tabId}`).classList.add('active');
    };

    // --- RESULTS DASHBOARD LOGIC ---
    let dashboardCharts = {
        sectors: null,
        sizes: null,
        members: null,
        comparison: null
    };
    let currentDashboardData = { responses: [], config: null };

    const openDashboard = async (surveyId = null) => {
        switchTab('results');
        
        // Populate survey select
        try {
            const res = await fetch(`${BASE_URL}/api/admin/surveys`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            if (res.ok) {
                const surveys = await res.json();
                const select = document.getElementById('results-survey-select');
                select.innerHTML = '<option value="">בחר שאלון...</option>';
                surveys.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = s.name;
                    select.appendChild(opt);
                });
                
                if (surveyId) {
                    select.value = surveyId;
                    loadSurveyResults(surveyId);
                } else if (surveys.length > 0) {
                    select.value = surveys[0].id;
                    loadSurveyResults(surveys[0].id);
                }
            }
        } catch (e) {
            console.error('Failed to load surveys for dashboard', e);
        }
    };

    const loadSurveyResults = async (surveyId) => {
        if (!surveyId) {
            document.getElementById('results-content').classList.add('d-none');
            document.getElementById('results-empty').classList.remove('d-none');
            return;
        }

        try {
            // Fetch responses
            const resResponses = await fetch(`${BASE_URL}/api/admin/responses/${surveyId}`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            const responses = await resResponses.json();

            // Fetch survey config for topic names
            const resConfig = await fetch(`${BASE_URL}/api/admin/surveys/${surveyId}`, {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
            });
            const config = await resConfig.json();

            currentDashboardData.responses = responses;
            currentDashboardData.config = config;

            if (responses.length === 0) {
                document.getElementById('results-content').classList.add('d-none');
                document.getElementById('results-empty').classList.remove('d-none');
                return;
            }

            document.getElementById('results-empty').classList.add('d-none');
            document.getElementById('results-content').classList.remove('d-none');

            renderDashboard();

        } catch (err) {
            console.error('Failed to load dashboard data', err);
            alert('שגיאה בטעינת נתוני הדשבורד');
        }
    };

    const calculateStats = (values) => {
        if (!values || values.length === 0) return { n: 0, mean: 0, median: 0, std: 0 };
        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(n / 2);
        const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        const std = Math.sqrt(variance);
        
        return { n, mean: Math.round(mean), median: Math.round(median), std: std.toFixed(1) };
    };

    const renderDashboard = () => {
        const { responses, config } = currentDashboardData;
        const activeTopics = config.topics || [];

        // 1. Total Respondents
        document.getElementById('res-total-n').textContent = responses.length;

        // 2. Business Names
        const namesContainer = document.getElementById('res-business-names');
        namesContainer.innerHTML = '';
        const names = responses.map(r => r.business_name).filter(n => n);
        names.forEach(n => {
            const div = document.createElement('div');
            div.className = 'border-bottom py-2 px-1';
            div.textContent = n;
            namesContainer.appendChild(div);
        });

        // 3. Sectors Pie
        const sectorsCount = {};
        responses.forEach(r => {
            const sec = r.business_sector || 'לא ידוע';
            sectorsCount[sec] = (sectorsCount[sec] || 0) + 1;
        });
        renderPieChart('chart-sectors', dashboardCharts.sectors, sectorsCount, 'sectors');

        // 4. Sizes Pie
        const sizesCount = {};
        responses.forEach(r => {
            const size = r.employee_count || 'לא ידוע';
            sizesCount[size] = (sizesCount[size] || 0) + 1;
        });
        
        const parseSize = (s) => parseInt(s.split('-')[0]) || 0;
        const sortedSizesCount = {};
        Object.keys(sizesCount).sort((a,b) => {
            if (a === 'לא ידוע') return 1;
            if (b === 'לא ידוע') return -1;
            return parseSize(a) - parseSize(b);
        }).forEach(k => sortedSizesCount[k] = sizesCount[k]);

        renderPieChart('chart-sizes', dashboardCharts.sizes, sortedSizesCount, 'sizes');

        // 4.5 Chamber Membership Pie
        const membersCount = { 'חבר לשכה': 0, 'לא חבר': 0 };
        responses.forEach(r => {
            const isMember = r.is_chamber_member;
            if (isMember === 1 || isMember === true || String(isMember) === '1') {
                membersCount['חבר לשכה']++;
            } else {
                membersCount['לא חבר']++;
            }
        });
        renderPieChart('chart-members', dashboardCharts.members, membersCount, 'members');

        // Prepare Ratings Data
        const topicRatings = {};
        activeTopics.forEach(t => topicRatings[t.id] = { title: t.title, values: [] });
        
        responses.forEach(r => {
            let ratings = {};
            try { ratings = JSON.parse(r.topic_ratings_json || '{}'); } catch(e){}
            Object.keys(ratings).forEach(topicId => {
                if (topicRatings[topicId]) {
                    topicRatings[topicId].values.push(ratings[topicId]);
                }
            });
        });

        // 5. Services Table
        const tbody = document.getElementById('res-services-table');
        tbody.innerHTML = '';
        activeTopics.forEach(t => {
            const stats = calculateStats(topicRatings[t.id].values);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-start fw-bold">${t.title}</td>
                <td>${stats.n}</td>
                <td>${stats.mean}%</td>
                <td>${stats.median}</td>
                <td>${stats.std}</td>
            `;
            tbody.appendChild(tr);
        });

        // 7. Final Comments
        const commentsContainer = document.getElementById('res-final-comments');
        commentsContainer.innerHTML = '';
        const comments = responses.map(r => r.final_comment).filter(c => c && c.trim() !== '');
        if (comments.length === 0) {
            commentsContainer.innerHTML = '<div class="text-muted text-center py-3">אין הערות פתוחות</div>';
        } else {
            comments.forEach(c => {
                const div = document.createElement('div');
                div.className = 'border-bottom py-2 px-1';
                div.textContent = c;
                commentsContainer.appendChild(div);
            });
        }

        // Setup Filters for Comparison Chart
        setupFilters(sectorsCount, sizesCount, activeTopics);
        updateComparisonChart();
    };

    const pieLabelsPlugin = {
        id: 'pieLabels',
        afterDatasetsDraw(chart, args, options) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);

            chart.getDatasetMeta(0).data.forEach((datapoint, index) => {
                const val = data.datasets[0].data[index];
                if (val === 0) return;
                const pct = Math.round((val / total) * 100) + '%';
                const center = datapoint.tooltipPosition();
                ctx.fillText(pct, center.x, center.y);
            });
            ctx.restore();
        }
    };

    const barLabelsAndErrorsPlugin = {
        id: 'barLabelsAndErrors',
        afterDatasetsDraw(chart, args, options) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const stdDevs = dataset.stdDevs;
                chart.getDatasetMeta(datasetIndex).data.forEach((datapoint, index) => {
                    const val = dataset.data[index];
                    const std = stdDevs ? stdDevs[index] : 0;
                    const x = datapoint.x;
                    const y = datapoint.y;
                    
                    // Draw text
                    ctx.fillStyle = '#333';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText(val + '%', x, y - 5);
                    
                    // Draw error bar
                    if (std > 0) {
                        const yScale = chart.scales.y;
                        const upperY = yScale.getPixelForValue(val + parseFloat(std));
                        const lowerY = yScale.getPixelForValue(Math.max(0, val - parseFloat(std)));
                        
                        ctx.beginPath();
                        ctx.strokeStyle = '#e74a3b';
                        ctx.lineWidth = 1.5;
                        ctx.moveTo(x, lowerY);
                        ctx.lineTo(x, upperY);
                        ctx.moveTo(x - 3, upperY);
                        ctx.lineTo(x + 3, upperY);
                        ctx.moveTo(x - 3, lowerY);
                        ctx.lineTo(x + 3, lowerY);
                        ctx.stroke();
                    }
                });
            });
            ctx.restore();
        }
    };

    const renderPieChart = (canvasId, chartRef, dataObj, refKey) => {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const labels = Object.keys(dataObj);
        const data = Object.values(dataObj);
        
        const total = data.reduce((a,b)=>a+b,0);

        if (dashboardCharts[refKey]) dashboardCharts[refKey].destroy();

        dashboardCharts[refKey] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b',
                        '#858796', '#5a5c69', '#2c9faf', '#e46ab3', '#fd7e14'
                    ]
                }]
            },
            plugins: [pieLabelsPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let val = context.parsed;
                                let pct = Math.round((val / total) * 100);
                                return `${context.label}: ${val} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    };

    const setupFilters = (sectorsCount, sizesCount, activeTopics) => {
        const sectorList = document.getElementById('filter-sector-list');
        sectorList.innerHTML = '';
        Object.keys(sectorsCount).forEach(sec => {
            sectorList.innerHTML += `
                <li><label class="dropdown-item">
                    <input type="checkbox" class="form-check-input filter-sector-chk me-2" value="${sec}"> ${sec}
                </label></li>
            `;
        });

        const sizeList = document.getElementById('filter-size-list');
        sizeList.innerHTML = '';
        Object.keys(sizesCount).forEach(size => {
            sizeList.innerHTML += `
                <li><label class="dropdown-item">
                    <input type="checkbox" class="form-check-input filter-size-chk me-2" value="${size}"> ${size}
                </label></li>
            `;
        });

        const memberList = document.getElementById('filter-member-list');
        if (memberList) {
            memberList.innerHTML = `
                <li><label class="dropdown-item">
                    <input type="checkbox" class="form-check-input filter-member-chk me-2" value="1"> חבר לשכה
                </label></li>
                <li><label class="dropdown-item">
                    <input type="checkbox" class="form-check-input filter-member-chk me-2" value="0"> לא חבר
                </label></li>
            `;
        }

        const servicesList = document.getElementById('filter-services-list');
        servicesList.innerHTML = '';
        activeTopics.forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `
                <label class="dropdown-item">
                    <input type="checkbox" class="form-check-input filter-service-chk me-2" value="${t.id}" checked>
                    ${t.title}
                </label>
            `;
            servicesList.appendChild(li);
        });

        // Add event listeners to checkboxes
        document.querySelectorAll('.filter-sector-chk, .filter-size-chk, .filter-member-chk, .filter-service-chk').forEach(chk => {
            chk.addEventListener('change', updateComparisonChart);
        });
    };

    const resetComparisonFilters = () => {
        document.querySelectorAll('.filter-sector-chk, .filter-size-chk, .filter-member-chk').forEach(chk => chk.checked = false);
        document.querySelectorAll('.filter-service-chk').forEach(chk => chk.checked = true);
        updateComparisonChart();
    };

    const exportCurrentDashboardSurvey = () => {
        const select = document.getElementById('results-survey-select');
        if (select && select.value) {
            exportSurveyData(select.value);
        } else {
            alert('אנא בחר שאלון תחילה');
        }
    };

    const updateComparisonChart = () => {
        const { responses, config } = currentDashboardData;
        if (!responses || responses.length === 0) return;

        const selSectors = Array.from(document.querySelectorAll('.filter-sector-chk:checked')).map(chk => chk.value);
        const selSizes = Array.from(document.querySelectorAll('.filter-size-chk:checked')).map(chk => chk.value);
        const selMembers = Array.from(document.querySelectorAll('.filter-member-chk:checked')).map(chk => chk.value);
        const selServices = Array.from(document.querySelectorAll('.filter-service-chk:checked')).map(chk => chk.value);

        const activeTopics = (config.topics || []).filter(t => selServices.includes(t.id));
        const labels = activeTopics.map(t => t.title);

        const datasets = [];
        const defaultColors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796', '#5a5c69', '#2c9faf', '#e46ab3', '#fd7e14'];

        if (selSectors.length === 0 && selSizes.length === 0 && selMembers.length === 0) {
            // Default 1 series, all filtered responses
            const means = [];
            const stdDevs = [];
            activeTopics.forEach(t => {
                let values = [];
                responses.forEach(r => {
                    let ratings = {};
                    try { ratings = JSON.parse(r.topic_ratings_json || '{}'); } catch(e){}
                    if (ratings[t.id] !== undefined) values.push(ratings[t.id]);
                });
                const stats = calculateStats(values);
                means.push(stats.mean);
                stdDevs.push(stats.std);
            });
            datasets.push({
                label: 'ממוצע כללי',
                data: means,
                stdDevs: stdDevs,
                backgroundColor: defaultColors.slice(0, means.length), // unique color per bar
                borderRadius: 4
            });
        } else {
            // Group by selected filters
            const sectorsToIterate = selSectors.length > 0 ? selSectors : ['all'];
            const sizesToIterate = selSizes.length > 0 ? selSizes : ['all'];
            const membersToIterate = selMembers.length > 0 ? selMembers : ['all'];

            let colorIdx = 0;

            sectorsToIterate.forEach(sec => {
                sizesToIterate.forEach(size => {
                    membersToIterate.forEach(member => {
                        const filteredResponses = responses.filter(r => {
                            if (sec !== 'all' && (r.business_sector || 'לא ידוע') !== sec) return false;
                            if (size !== 'all' && (r.employee_count || 'לא ידוע') !== size) return false;
                            
                            if (member !== 'all') {
                                const isMember = r.is_chamber_member;
                                const isMemberNormalized = (isMember === 1 || isMember === true || String(isMember) === '1') ? '1' : '0';
                                if (isMemberNormalized !== member) return false;
                            }
                            return true;
                        });

                        const means = [];
                        const stdDevs = [];

                        activeTopics.forEach(t => {
                            let values = [];
                            filteredResponses.forEach(r => {
                                let ratings = {};
                                try { ratings = JSON.parse(r.topic_ratings_json || '{}'); } catch(e){}
                                if (ratings[t.id] !== undefined) values.push(ratings[t.id]);
                            });
                            const stats = calculateStats(values);
                            means.push(stats.mean);
                            stdDevs.push(stats.std);
                        });

                        let seriesLabel = [];
                        if (sec !== 'all') seriesLabel.push(sec);
                        if (size !== 'all') seriesLabel.push(size);
                        if (member !== 'all') {
                            seriesLabel.push(member === '1' ? 'חבר לשכה' : 'לא חבר');
                        }
                        
                        datasets.push({
                            label: seriesLabel.join(' - '),
                            data: means,
                            stdDevs: stdDevs,
                            backgroundColor: defaultColors[colorIdx % defaultColors.length], // uniform color for the series
                            borderRadius: 4
                        });
                        colorIdx++;
                    });
                });
            });
        }

        const ctx = document.getElementById('chart-comparison').getContext('2d');
        if (dashboardCharts.comparison) dashboardCharts.comparison.destroy();

        dashboardCharts.comparison = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            plugins: [barLabelsAndErrorsPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: { display: datasets.length > 1 }, // Show legend only if multiple series
                    tooltip: {
                        callbacks: {
                            afterLabel: function(context) {
                                const std = context.dataset.stdDevs[context.dataIndex];
                                return `סטיית תקן: ±${std}`;
                            }
                        }
                    }
                }
            }
        });
    };

    const logout = () => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_permissions');
        window.location.href = 'admin.html';
    };

    return {
        initLogin,
        initDashboard,
        saveConfig,
        exportData,
        switchTab,
        openDashboard,
        loadSurveyResults,
        updateComparisonChart,
        resetComparisonFilters,
        exportCurrentDashboardSurvey,
        logout,
        updateVideoUrl,
        loadSurveysList,
        createNewSurvey,
        copySurveyLink,
        exportSurveyData,
        deleteSurvey,
        editSurvey,
        previewVisualMedia,
        cancelVisualEdit,
        saveVisualEdit,
        addTopic,
        removeTopic
    };
})();
