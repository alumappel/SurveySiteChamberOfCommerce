const UserApp = (() => {
    const BASE_URL = 'http://localhost:3000'; // ערוך לכתובת השרת האמיתי בסביבת פרודקשן
    let config = null;
    let surveyState = {
        respondent_id: '',
        response_id: '',
        survey_id: '',
        topic_ratings: {}, // will store ratings
        last_answered_topic_index: -1,
        status: 'in_progress',
        final_comment: ''
    };

    let activeTopics = [];
    let currentTopicIndex = 0;
    let idleTimer = null;
    let touchStartX = 0;
    let touchEndX = 0;

    // Helper: Generate a unique ID for the cookie
    const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    };

    const setCookie = (name, value, days) => {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    };

    const loadConfig = async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/survey/config`);
            config = await res.json();
            activeTopics = config.topics.filter(t => t.isActive);
            surveyState.survey_id = config.surveyId;
        } catch (e) {
            console.error('Failed to load config', e);
            document.body.innerHTML = '<h1 class="text-center mt-5">שגיאה בטעינת הסקר</h1>';
        }
    };

    const resetIdleTimer = () => {
        if (!config || !config.idle) return;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            const modalEl = document.getElementById('idleModal');
            if (modalEl) {
                document.getElementById('idle-message').textContent = config.idle.message || "לא סיימת את השאלון, ממשיכים?";
                new bootstrap.Modal(modalEl).show();
            }
        }, config.idle.timeoutSeconds * 1000);
    };

    const initIndex = async () => {
        await loadConfig();
        if (!config) return;

        document.getElementById('intro-title').textContent = config.intro.title;
        // The text has newlines, use innerText or split by \n
        document.getElementById('intro-body').innerHTML = config.intro.body.replace(/\n/g, '<br/>');

        const formFields = document.getElementById('form-fields');
        config.openingForm.fields.forEach(field => {
            const div = document.createElement('div');
            div.className = 'mb-3 text-end';
            
            const label = document.createElement('label');
            label.className = 'form-label fw-bold';
            label.textContent = field.label;
            if (field.required) label.textContent += ' *';
            
            div.appendChild(label);

            if (field.type === 'select') {
                const select = document.createElement('select');
                select.className = 'form-select';
                select.name = field.name;
                select.required = field.required;
                
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'בחר...';
                select.appendChild(defaultOption);

                field.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    select.appendChild(option);
                });
                div.appendChild(select);
            } else {
                const input = document.createElement('input');
                input.type = field.type;
                input.className = 'form-control';
                input.name = field.name;
                input.required = field.required;
                div.appendChild(input);
            }
            formFields.appendChild(div);
        });

        // Cookie Consent
        let cookiesAccepted = getCookie('cookies_accepted');
        if (!cookiesAccepted) {
            const banner = document.getElementById('cookie-banner');
            banner.classList.remove('d-none');
            document.getElementById('btn-accept-cookies').addEventListener('click', () => {
                setCookie('cookies_accepted', 'true', 365);
                banner.classList.add('d-none');
            });
        }

        // Check if returning user
        let respondentId = getCookie('respondent_id');
        if (!respondentId) {
            respondentId = generateId();
            setCookie('respondent_id', respondentId, 30);
        }
        surveyState.respondent_id = respondentId;

        document.getElementById('opening-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            if (!form.checkValidity()) {
                e.stopPropagation();
                form.classList.add('was-validated');
                return;
            }

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            data.respondent_id = surveyState.respondent_id;
            data.survey_id = surveyState.survey_id;

            try {
                const res = await fetch(`${BASE_URL}/api/survey/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                surveyState.response_id = result.response_id;
                
                // Save to local storage to pass to survey page
                localStorage.setItem('surveyState', JSON.stringify(surveyState));
                window.location.href = 'survey.html';
            } catch (err) {
                console.error(err);
                alert('שגיאה בתקשורת עם השרת');
            }
        });
    };

    const initSurvey = async () => {
        await loadConfig();
        if (!config) return;

        const storedState = localStorage.getItem('surveyState');
        if (!storedState) {
            window.location.href = 'index.html';
            return;
        }
        
        surveyState = JSON.parse(storedState);

        // Tooltip init
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

        // Idle timer setup
        document.addEventListener('mousemove', resetIdleTimer);
        document.addEventListener('keydown', resetIdleTimer);
        document.addEventListener('touchstart', resetIdleTimer);
        resetIdleTimer();

        if (surveyState.status === 'completed' || surveyState.status === 'edited_after_completion') {
            showCompletion();
            return;
        }

        // Return from abandonment logic
        if (surveyState.last_answered_topic_index >= 0 && surveyState.status === 'in_progress') {
            const modalEl = document.getElementById('welcomeBackModal');
            const welcomeModal = new bootstrap.Modal(modalEl);
            
            document.getElementById('btn-continue-survey').addEventListener('click', () => {
                currentTopicIndex = surveyState.last_answered_topic_index + 1;
                if (currentTopicIndex >= activeTopics.length) {
                    showCompletion();
                } else {
                    renderTopics();
                }
                welcomeModal.hide();
            });

            document.getElementById('btn-restart-survey').addEventListener('click', () => {
                currentTopicIndex = 0;
                surveyState.topic_ratings = {};
                surveyState.last_answered_topic_index = -1;
                renderTopics();
                welcomeModal.hide();
            });

            welcomeModal.show();
        } else {
            renderTopics();
        }

        // Final comment setup
        document.getElementById('btn-submit-comment').addEventListener('click', async () => {
            const comment = document.getElementById('final-comment').value;
            surveyState.final_comment = comment;
            const btn = document.getElementById('btn-submit-comment');
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> שולח...';
            btn.disabled = true;
            
            await saveProgress();
            
            document.getElementById('final-comment-section').innerHTML = '<p class="text-success fw-bold">תגובתך נשמרה בהצלחה. תודה!</p>';
        });

        document.getElementById('btn-edit-survey').addEventListener('click', () => {
            currentTopicIndex = 0;
            surveyState.status = 'edited_after_completion';
            document.getElementById('completion-container').style.display = 'none';
            renderTopics();
        });

        // Window resize to handle responsive views
        window.addEventListener('resize', () => {
            // Re-render topics if resizing crosses the breakpoint
            // A simple debounce could be used, but for MVP it's fine.
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(renderTopics, 300);
        });
    };

    const getHslColor = (percent) => {
        // Red to Green
        const hue = (percent / 100) * 120;
        return `hsl(${hue}, 80%, 90%)`; // Light background
    };

    const createTopicCardHtml = (topic, index, isDesktop) => {
        const val = surveyState.topic_ratings[topic.id];
        const hasValue = val !== undefined;
        const displayVal = hasValue ? val : 50;
        const bgStyle = hasValue ? `background-color: ${getHslColor(displayVal)};` : '';

        return `
            <div class="${isDesktop ? 'col-md-4 topic-card-wrapper' : 'w-100'}">
                <div class="card shadow-lg mx-auto p-4 rounded-4 topic-card-bg" id="card-${topic.id}" style="${isDesktop ? 'height: 100%;' : 'max-width: 600px;'} ${bgStyle}">
                    ${!isDesktop ? `
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <span class="badge bg-primary fs-6 rounded-pill px-3 py-2">שאלה ${index + 1} מתוך ${activeTopics.length}</span>
                        <button class="btn btn-outline-secondary btn-sm btn-prev" ${index === 0 ? 'style="visibility:hidden;"' : ''}><i class="bi bi-chevron-right"></i> הקודם</button>
                    </div>` : ''}
                    
                    <div class="text-center mb-4">
                        ${topic.imageUrl ? `<img src="${topic.imageUrl}" alt="תמונת נושא" class="img-fluid rounded-3 mb-3" style="max-height: 200px; object-fit: cover;">` : ''}
                        <h2 class="fw-bold mb-2">${topic.title}</h2>
                        <p class="text-muted mb-4">${topic.description}</p>
                    </div>

                    <div class="slider-container d-flex justify-content-center align-items-stretch mx-auto my-5 position-relative" style="height: 300px; width: 100px;">
                        <div class="slider-labels d-flex flex-column justify-content-between text-muted small me-3" aria-hidden="true">
                            <span class="fw-bold text-success">${config.rating.topLabel}</span>
                            <span class="fw-bold text-danger">${config.rating.bottomLabel}</span>
                        </div>
                        <input type="range" class="form-range custom-vertical-slider topic-slider ${!hasValue ? 'empty-state' : ''}" 
                            data-topic-id="${topic.id}" data-index="${index}"
                            min="${config.rating.min}" max="${config.rating.max}" value="${displayVal}" step="1">
                        <div class="position-absolute translate-middle badge bg-primary fs-5 slider-value-display" id="display-${topic.id}" style="top: ${hasValue ? 100 - displayVal : 50}%; left: -40px;">
                            ${hasValue ? displayVal : ''}
                        </div>
                    </div>

                    ${!isDesktop ? `
                    <div class="text-center mt-5">
                        <span class="d-inline-block disabled-wrapper" tabindex="0" data-bs-toggle="tooltip" title="חובה לדרג נושא כדי להתקדם">
                            <button class="btn btn-primary btn-lg rounded-pill px-5 shadow-sm btn-next ${!hasValue ? 'disabled' : ''}" style="${!hasValue ? 'pointer-events: none;' : ''}">המשך <i class="bi bi-chevron-left"></i></button>
                        </span>
                    </div>` : ''}
                </div>
            </div>
        `;
    };

    const renderTopics = () => {
        const container = document.getElementById('survey-container');
        const isDesktop = window.innerWidth >= 768;
        
        container.innerHTML = '';
        container.style.display = 'flex';
        container.className = isDesktop ? 'row desktop-grid justify-content-center mx-auto' : 'container py-2';

        if (isDesktop) {
            // Render all topics in grid
            let html = '';
            activeTopics.forEach((topic, index) => {
                html += createTopicCardHtml(topic, index, true);
            });
            container.innerHTML = html;
            
            document.getElementById('desktop-submit-container').classList.remove('d-none');
            validateDesktopSubmit();
        } else {
            // Render single topic
            document.getElementById('desktop-submit-container').classList.add('d-none');
            if (currentTopicIndex >= activeTopics.length) {
                showCompletion();
                return;
            }
            const topic = activeTopics[currentTopicIndex];
            container.innerHTML = createTopicCardHtml(topic, currentTopicIndex, false);
            container.classList.add('fade-in');

            // Attach touch swipe events
            const cardEl = document.getElementById(`card-${topic.id}`);
            cardEl.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
            cardEl.addEventListener('touchend', e => {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            });
        }

        // Re-initialize tooltips for new dynamic elements
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

        attachDynamicListeners(isDesktop);
    };

    const handleSwipe = () => {
        const swipeThreshold = 50;
        if (touchEndX < touchStartX - swipeThreshold) {
            // Swiped left
            // Do nothing, next is handled by slider or button
        } else if (touchEndX > touchStartX + swipeThreshold) {
            // Swiped right -> Previous
            if (currentTopicIndex > 0) {
                currentTopicIndex--;
                renderTopics();
            }
        }
    };

    const validateDesktopSubmit = () => {
        const isAllRated = activeTopics.every(t => surveyState.topic_ratings[t.id] !== undefined);
        const submitBtn = document.getElementById('btn-desktop-submit');
        if (isAllRated) {
            submitBtn.classList.remove('disabled');
            submitBtn.style.pointerEvents = 'auto';
        } else {
            submitBtn.classList.add('disabled');
            submitBtn.style.pointerEvents = 'none';
        }
    };

    const attachDynamicListeners = (isDesktop) => {
        const sliders = document.querySelectorAll('.topic-slider');
        sliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const topicId = e.target.getAttribute('data-topic-id');
                const val = e.target.value;
                const display = document.getElementById(`display-${topicId}`);
                const card = document.getElementById(`card-${topicId}`);
                
                // Remove empty state
                e.target.classList.remove('empty-state');
                display.textContent = val;
                
                const percent = val; // since min is 0 and max is 100
                display.style.top = `${100 - percent}%`;
                
                // Update bg color
                card.style.backgroundColor = getHslColor(val);

                // Enable next/submit button
                if (!isDesktop) {
                    const nextBtn = card.querySelector('.btn-next');
                    if (nextBtn) {
                        nextBtn.classList.remove('disabled');
                        nextBtn.style.pointerEvents = 'auto';
                    }
                }
            });

            slider.addEventListener('change', async (e) => {
                // Fired when interaction ends
                const topicId = e.target.getAttribute('data-topic-id');
                const idx = parseInt(e.target.getAttribute('data-index'));
                surveyState.topic_ratings[topicId] = parseInt(e.target.value, 10);
                
                if (idx > surveyState.last_answered_topic_index) {
                    surveyState.last_answered_topic_index = idx;
                }

                await saveProgress();
                localStorage.setItem('surveyState', JSON.stringify(surveyState));

                if (isDesktop) {
                    validateDesktopSubmit();
                } else {
                    // Auto advance for mobile
                    setTimeout(() => {
                        handleNextMobile();
                    }, config.rating.autoAdvanceDelayMs || 700);
                }
            });
        });

        if (!isDesktop) {
            const nextBtns = document.querySelectorAll('.btn-next');
            nextBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    handleNextMobile();
                });
            });

            const prevBtns = document.querySelectorAll('.btn-prev');
            prevBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (currentTopicIndex > 0) {
                        currentTopicIndex--;
                        renderTopics();
                    }
                });
            });
        } else {
            // Desktop submit
            const desktopSubmit = document.getElementById('btn-desktop-submit');
            // Remove old listeners to avoid duplicates
            const newBtn = desktopSubmit.cloneNode(true);
            desktopSubmit.parentNode.replaceChild(newBtn, desktopSubmit);
            
            newBtn.addEventListener('click', async () => {
                surveyState.status = surveyState.status === 'edited_after_completion' ? 'edited_after_completion' : 'completed';
                await saveProgress();
                localStorage.setItem('surveyState', JSON.stringify(surveyState));
                showCompletion();
            });
        }
    };

    const handleNextMobile = async () => {
        currentTopicIndex++;
        
        if (currentTopicIndex >= activeTopics.length) {
            surveyState.status = surveyState.status === 'edited_after_completion' ? 'edited_after_completion' : 'completed';
            await saveProgress();
            localStorage.setItem('surveyState', JSON.stringify(surveyState));
            showCompletion();
        } else {
            checkToasts();
            renderTopics();
        }
    };

    const saveProgress = async () => {
        try {
            await fetch(`${BASE_URL}/api/survey/update/${surveyState.response_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic_ratings_json: JSON.stringify(surveyState.topic_ratings),
                    last_answered_topic_index: surveyState.last_answered_topic_index,
                    last_answered_topic_id: activeTopics[surveyState.last_answered_topic_index]?.id,
                    status: surveyState.status,
                    final_comment: surveyState.final_comment
                })
            });
        } catch (e) {
            console.error('Failed to save progress', e);
        }
    };

    const showCompletion = () => {
        document.getElementById('survey-container').style.display = 'none';
        document.getElementById('desktop-submit-container').classList.add('d-none');
        const comp = document.getElementById('completion-container');
        comp.style.display = 'block';
        comp.classList.add('fade-in');
        
        document.getElementById('completion-title').textContent = config.completion.title;
        document.getElementById('completion-message').textContent = config.completion.message;
        
        // Hide comment section if already completed and not editing
        if (surveyState.final_comment) {
            document.getElementById('final-comment-section').innerHTML = '<p class="text-success fw-bold">תגובתך נשמרה.</p>';
        }
    };

    const checkToasts = () => {
        const half = Math.floor(activeTopics.length / 2);
        if (currentTopicIndex === half && config.toasts.halfway) {
            showToast(config.toasts.halfway.message);
        } else if (activeTopics.length >= 9 && activeTopics.length - currentTopicIndex === 3 && config.toasts.lastThree) {
            showToast(config.toasts.lastThree.message);
        }
    };

    const showToast = (msg) => {
        const toastBody = document.getElementById('toast-message');
        if (!toastBody) return;
        toastBody.textContent = msg;
        const toastEl = document.getElementById('survey-toast');
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    };

    return {
        initIndex,
        initSurvey
    };
})();
