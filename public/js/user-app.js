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
    let autoAdvanceTimer = null;
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

        // Carousel Navigation Click Events
        const btnPrev = document.getElementById('carousel-btn-prev');
        const btnNext = document.getElementById('carousel-btn-next');
        if (btnPrev && btnNext) {
            btnPrev.addEventListener('click', () => {
                if (currentTopicIndex > 0) {
                    currentTopicIndex--;
                    updateCarousel();
                    updateNavButtons();
                }
            });
            btnNext.addEventListener('click', () => {
                if (currentTopicIndex < activeTopics.length - 1) {
                    currentTopicIndex++;
                    updateCarousel();
                    updateNavButtons();
                }
            });
        }

        document.getElementById('btn-edit-survey').addEventListener('click', () => {
            currentTopicIndex = 0;
            surveyState.status = 'edited_after_completion';
            document.getElementById('completion-container').style.display = 'none';
            renderTopics();
        });

        // Window resize to handle responsive views
        window.addEventListener('resize', () => {
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(updateCarousel, 150);
        });
    };

    const getHslColor = (percent) => {
        // Red to Green
        const hue = (percent / 100) * 120;
        return `hsl(${hue}, 80%, 90%)`; // Light background
    };

    const createTopicCardHtml = (topic, index) => {
        const val = surveyState.topic_ratings[topic.id];
        const hasValue = val !== undefined;
        const displayVal = hasValue ? val : 50;
        const bgStyle = hasValue ? `background-color: ${getHslColor(displayVal)};` : '';

        // Last card gets a finish submit button
        const isLastCard = index === activeTopics.length - 1;
        const buttonText = isLastCard ? 'הגש סקר <i class="bi bi-check-lg ms-1"></i>' : 'המשך <i class="bi bi-chevron-left"></i>';
        const buttonClass = isLastCard ? 'btn-success btn-finish-survey' : 'btn-next';

        return `
            <div class="topic-card-wrapper" id="wrapper-${topic.id}">
                <div class="card shadow mx-auto p-4 rounded-4 topic-card-bg inactive-card" id="card-${topic.id}" style="${bgStyle}">
                    
                    <div class="text-center mb-3">
                        ${topic.imageUrl ? `<img src="${topic.imageUrl}" alt="תמונת נושא" class="img-fluid rounded-3 mb-3" style="max-height: 180px; object-fit: cover;">` : ''}
                        <h3 class="fw-bold mb-2 text-dark">${topic.title}</h3>
                        <p class="text-muted mb-3" style="min-height: 48px; font-size: 0.95rem;">${topic.description}</p>
                    </div>

                    <div class="slider-container d-flex justify-content-center align-items-stretch mx-auto my-2 position-relative" style="height: 220px; width: 100px;">
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

                    <div class="text-center mt-4">
                        <span class="d-inline-block disabled-wrapper" tabindex="0" data-bs-toggle="tooltip" title="חובה לדרג נושא כדי להתקדם">
                            <button class="btn btn-primary btn-lg rounded-pill px-5 shadow-sm ${buttonClass} ${!hasValue ? 'disabled' : ''}" style="${!hasValue ? 'pointer-events: none;' : ''}">
                                ${buttonText}
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        `;
    };

    const updateCarousel = () => {
        const track = document.getElementById('survey-container');
        if (!track) return;
        
        const isRtl = document.documentElement.dir === 'rtl' || document.body.dir === 'rtl';
        const activeCard = track.querySelector('.topic-card-wrapper');
        const cardWidth = activeCard ? activeCard.offsetWidth : 550;
        const gap = 24; // matches gap in CSS
        
        // Compute horizontal offset
        // In RTL, positive translateX shifts elements to the right, showing next items on left.
        const directionMultiplier = isRtl ? 1 : -1;
        const translateAmount = currentTopicIndex * (cardWidth + gap) * directionMultiplier;
        
        track.style.transform = `translateX(${translateAmount}px)`;
        
        // Update active vs inactive card states
        const wrappers = track.querySelectorAll('.topic-card-wrapper');
        wrappers.forEach((wrapper, idx) => {
            const cardInner = wrapper.querySelector('.topic-card-bg');
            if (!cardInner) return;
            
            if (idx === currentTopicIndex) {
                cardInner.classList.add('active-card');
                cardInner.classList.remove('inactive-card');
                cardInner.querySelectorAll('input, button').forEach(el => el.removeAttribute('disabled'));
            } else {
                cardInner.classList.remove('active-card');
                cardInner.classList.add('inactive-card');
                cardInner.querySelectorAll('input, button').forEach(el => {
                    // Disable inactive card controls to prevent issues
                    if (!el.classList.contains('btn-prev')) {
                        el.setAttribute('disabled', 'true');
                    }
                });
            }
        });
        
        // Update Progress Bar
        const progressPercent = Math.round(((currentTopicIndex) / activeTopics.length) * 100);
        const progressBar = document.getElementById('survey-progress');
        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
            progressBar.setAttribute('aria-valuenow', progressPercent);
        }
    };

    const updateNavButtons = () => {
        const btnPrev = document.getElementById('carousel-btn-prev');
        const btnNext = document.getElementById('carousel-btn-next');
        if (!btnPrev || !btnNext) return;
        
        // Prev arrow behavior
        if (currentTopicIndex === 0) {
            btnPrev.classList.add('disabled');
            btnPrev.disabled = true;
        } else {
            btnPrev.classList.remove('disabled');
            btnPrev.disabled = false;
        }
        
        // Next arrow behavior
        const currentTopic = activeTopics[currentTopicIndex];
        const hasRatedCurrent = surveyState.topic_ratings[currentTopic?.id] !== undefined;
        const isLast = currentTopicIndex === activeTopics.length - 1;
        
        if (isLast || !hasRatedCurrent) {
            btnNext.classList.add('disabled');
            btnNext.disabled = true;
        } else {
            btnNext.classList.remove('disabled');
            btnNext.disabled = false;
        }
    };

    const renderTopics = () => {
        const container = document.getElementById('survey-container');
        const outerContainer = document.getElementById('carousel-outer-container');
        
        if (outerContainer) outerContainer.style.display = 'block';
        document.getElementById('desktop-submit-container').classList.add('d-none');
        
        container.innerHTML = '';
        container.style.display = 'flex';
        container.className = 'carousel-track';

        if (currentTopicIndex >= activeTopics.length) {
            showCompletion();
            return;
        }

        // Render cards
        let html = '';
        activeTopics.forEach((topic, index) => {
            html += createTopicCardHtml(topic, index);
        });
        container.innerHTML = html;
        container.classList.add('fade-in');

        // Apply carousel positioning and button states
        updateCarousel();
        updateNavButtons();

        // Attach Swipe Gesture Events
        activeTopics.forEach(topic => {
            const cardEl = document.getElementById(`card-${topic.id}`);
            if (cardEl) {
                cardEl.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
                cardEl.addEventListener('touchend', e => {
                    touchEndX = e.changedTouches[0].screenX;
                    handleSwipe();
                });
            }
        });

        // Re-initialize tooltips
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

        attachDynamicListeners();
    };

    const handleSwipe = () => {
        const swipeThreshold = 50;
        if (touchEndX < touchStartX - swipeThreshold) {
            // Swiped left (Next)
            const currentTopic = activeTopics[currentTopicIndex];
            const hasRatedCurrent = surveyState.topic_ratings[currentTopic?.id] !== undefined;
            if (hasRatedCurrent && currentTopicIndex < activeTopics.length - 1) {
                currentTopicIndex++;
                updateCarousel();
                updateNavButtons();
            }
        } else if (touchEndX > touchStartX + swipeThreshold) {
            // Swiped right (Prev)
            if (currentTopicIndex > 0) {
                currentTopicIndex--;
                updateCarousel();
                updateNavButtons();
            }
        }
    };

    const attachDynamicListeners = () => {
        const sliders = document.querySelectorAll('.topic-slider');
        sliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                const topicId = e.target.getAttribute('data-topic-id');
                const val = e.target.value;
                const display = document.getElementById(`display-${topicId}`);
                const card = document.getElementById(`card-${topicId}`);
                
                e.target.classList.remove('empty-state');
                display.textContent = val;
                
                const percent = val; 
                display.style.top = `${100 - percent}%`;
                
                card.style.backgroundColor = getHslColor(val);

                // Enable button inside active card
                const nextBtn = card.querySelector('.btn-next');
                if (nextBtn) {
                    nextBtn.classList.remove('disabled');
                    nextBtn.style.pointerEvents = 'auto';
                }
                const finishBtn = card.querySelector('.btn-finish-survey');
                if (finishBtn) {
                    finishBtn.classList.remove('disabled');
                    finishBtn.style.pointerEvents = 'auto';
                }
            });

            slider.addEventListener('change', async (e) => {
                const topicId = e.target.getAttribute('data-topic-id');
                const idx = parseInt(e.target.getAttribute('data-index'));
                surveyState.topic_ratings[topicId] = parseInt(e.target.value, 10);
                
                if (idx > surveyState.last_answered_topic_index) {
                    surveyState.last_answered_topic_index = idx;
                }

                await saveProgress();
                localStorage.setItem('surveyState', JSON.stringify(surveyState));

                updateNavButtons();

                // Auto advance for both desktop and mobile
                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                autoAdvanceTimer = setTimeout(() => {
                    handleNextTopic();
                }, config.rating.autoAdvanceDelayMs || 1000);
            });
        });

        // Prev buttons click inside cards
        const prevBtns = document.querySelectorAll('.btn-prev');
        prevBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (currentTopicIndex > 0) {
                    currentTopicIndex--;
                    updateCarousel();
                    updateNavButtons();
                }
            });
        });

        // Next buttons click inside cards
        const nextBtns = document.querySelectorAll('.btn-next');
        nextBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                handleNextTopic();
            });
        });

        // Finish buttons click inside card
        const finishBtns = document.querySelectorAll('.btn-finish-survey');
        finishBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                surveyState.status = surveyState.status === 'edited_after_completion' ? 'edited_after_completion' : 'completed';
                await saveProgress();
                localStorage.setItem('surveyState', JSON.stringify(surveyState));
                showCompletion();
            });
        });
    };

    const handleNextTopic = async () => {
        if (currentTopicIndex >= activeTopics.length - 1) {
            // Already on last card, do NOT auto-advance to submit, let them click "הגש סקר"
            return;
        }
        currentTopicIndex++;
        checkToasts();
        updateCarousel();
        updateNavButtons();
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
        const outerContainer = document.getElementById('carousel-outer-container');
        if (outerContainer) outerContainer.style.display = 'none';
        
        document.getElementById('survey-container').style.display = 'none';
        document.getElementById('desktop-submit-container').classList.add('d-none');
        
        const comp = document.getElementById('completion-container');
        comp.style.display = 'block';
        comp.classList.add('fade-in');
        
        document.getElementById('completion-title').textContent = config.completion.title;
        document.getElementById('completion-message').textContent = config.completion.message;
        
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
