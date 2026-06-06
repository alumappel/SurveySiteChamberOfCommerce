const UserApp = (() => {
    const BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') ? 'http://localhost:3000' : '';

    const FETCH_OPTIONS = {
        credentials: 'include',
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    };


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

    // const loadConfig = async () => {
    //     try {
    //         // const res = await fetch(`${BASE_URL}/api/survey/config`);
    //         const res = await fetch(`${BASE_URL}/api/survey/config`, FETCH_OPTIONS);
    //         config = await res.json();
    //         activeTopics = config.topics.filter(t => t.isActive);
    //         surveyState.survey_id = config.surveyId;
    //     } catch (e) {
    //         console.error('Failed to load config', e);
    //         document.body.innerHTML = '<h1 class="text-center mt-5">שגיאה בטעינת הסקר</h1>';
    //     }
    // };

    const loadConfig = async () => {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const surveyParam = urlParams.get('survey');
            const apiUrl = surveyParam ? `${BASE_URL}/api/survey/config?id=${surveyParam}` : `${BASE_URL}/api/survey/config`;

            const res = await fetch(apiUrl, {
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    'ngrok-skip-browser-warning': '1'
                }
            });

            const text = await res.text();

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}: ${text.slice(0, 300)}`);
            }

            config = JSON.parse(text);
            activeTopics = config.topics.filter(t => t.isActive);
            surveyState.survey_id = config.surveyId;
        } catch (e) {
            console.error('Failed to load config', e);
            document.body.innerHTML = `
            <div style="direction: rtl; padding: 20px; font-family: Arial;">
                <h1>שגיאה בטעינת הסקר</h1>
                <p><strong>BASE_URL:</strong></p>
                <pre>${BASE_URL}</pre>
                <p><strong>שגיאה:</strong></p>
                <pre style="white-space: pre-wrap;">${e.message}</pre>
            </div>
        `;
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

    const getMediaElement = (url) => {
        if (!url) return '';

        // YouTube URL parsing
        const ytReg = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const ytMatch = url.match(ytReg);
        if (ytMatch && ytMatch[1]) {
            const videoId = ytMatch[1];
            return `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: 20px; width: 100%; height: 100%;"></iframe>`;
        }

        // Vimeo URL parsing
        const vimeoReg = /(?:vimeo\.com\/(?:channels\/[^\/]+\/|groups\/[^\/]+\/album\/\d+\/video\/|video\/|)|player\.vimeo\.com\/video\/)(\d+)/i;
        const vimeoMatch = url.match(vimeoReg);
        if (vimeoMatch && vimeoMatch[1]) {
            const videoId = vimeoMatch[1];
            return `<iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="border-radius: 20px; width: 100%; height: 100%;"></iframe>`;
        }

        // Direct video format
        if (/\.(mp4|webm|ogg|mov)$/i.test(url)) {
            return `<video src="${url}" controls style="width: 100%; height: 100%; object-fit: cover; border-radius: 20px;"></video>`;
        }

        // Image format
        return `<img src="${url}" alt="Intro Visual" style="width: 100%; height: 100%; object-fit: cover; border-radius: 20px;" onerror="this.style.display='none';">`;
    };

    const initIndex = async () => {
        // 1. Check localStorage first (fast client-side redirect)
        const storedState = localStorage.getItem('surveyState');
        if (storedState) {
            try {
                const state = JSON.parse(storedState);
                if (state.response_id && (state.status === 'in_progress' || state.status === 'completed' || state.status === 'edited_after_completion')) {
                    window.location.href = 'survey.html';
                    return;
                }
            } catch (e) {
                console.error("Failed to parse stored surveyState", e);
            }
        }

        // 2. Check DB via cookie (recovers session if localStorage was cleared)
        let respondentId = getCookie('respondent_id');
        if (respondentId) {
            try {
                const res = await fetch(`${BASE_URL}/api/survey/check-response/${respondentId}`, {
                    headers: { 'ngrok-skip-browser-warning': '1' }
                });
                if (res.ok) {
                    const result = await res.json();
                    if (result.found && result.data) {
                        const serverData = result.data;
                        const reconstructedState = {
                            respondent_id: respondentId,
                            response_id: serverData.response_id,
                            survey_id: serverData.survey_id,
                            topic_ratings: JSON.parse(serverData.topic_ratings_json || '{}'),
                            last_answered_topic_index: serverData.last_answered_topic_index !== null ? serverData.last_answered_topic_index : -1,
                            status: serverData.status,
                            final_comment: serverData.final_comment || ''
                        };
                        localStorage.setItem('surveyState', JSON.stringify(reconstructedState));
                        window.location.href = 'survey.html';
                        return;
                    }
                }
            } catch (err) {
                console.error("Failed to check existing response", err);
            }
        }

        await loadConfig();
        if (!config) return;

        document.getElementById('intro-title').textContent = config.intro.title;
        // The text has newlines, use innerText or split by \n
        document.getElementById('intro-body').innerHTML = config.intro.body.replace(/\n/g, '<br/>');

        if (config.intro && config.intro.introVideoUrl) {
            const container = document.querySelector('.media-placeholder-container');
            if (container) {
                const mediaHtml = getMediaElement(config.intro.introVideoUrl);
                if (mediaHtml) {
                    container.innerHTML = mediaHtml;
                    container.style.padding = '0';
                    container.style.background = 'none';
                }
            }
        }

        const formFields = document.getElementById('form-fields');
        config.openingForm.fields.forEach(field => {
            const div = document.createElement('div');
            div.className = 'mb-3 text-start';

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
                const submitBtn = form.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> טוען...';
                submitBtn.disabled = true;

                const res = await fetch(`${BASE_URL}/api/survey/start`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'ngrok-skip-browser-warning': 'true'
                    },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                surveyState.response_id = result.response_id;

                // Save to local storage to pass to survey page
                localStorage.setItem('surveyState', JSON.stringify(surveyState));

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                const instructionModalEl = document.getElementById('instructionModal');
                if (instructionModalEl) {
                    const instructionModal = new bootstrap.Modal(instructionModalEl);
                    instructionModal.show();

                    document.getElementById('btn-understood-go').addEventListener('click', () => {
                        window.location.href = 'survey.html';
                    }, { once: true });
                } else {
                    window.location.href = 'survey.html';
                }
            } catch (err) {
                console.error(err);
                alert('שגיאה בתקשורת עם השרת');
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'בואו נתחיל! <i class="bi bi-arrow-left ms-2"></i>';
                }
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
                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                if (currentTopicIndex > 0) {
                    currentTopicIndex--;
                    updateCarousel();
                    updateNavButtons();
                }
            });
            btnNext.addEventListener('click', () => {
                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                handleNextTopic();
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

    const getPastelColor = (percent) => {
        const solidRgbStr = getSolidHslColor(percent);
        const match = solidRgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            // Mix 15% of the original color with 85% white
            const mix = (c) => Math.round(c * 0.15 + 255 * 0.85);
            return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
        }
        return 'transparent';
    };

    const hexToRgb = (hex) => {
        let r = 0, g = 0, b = 0;
        if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        return [r, g, b];
    };

    const interpolateColor = (color1, color2, factor) => {
        const c1 = hexToRgb(color1);
        const c2 = hexToRgb(color2);
        const result = c1.map((c, i) => Math.round(c + factor * (c2[i] - c)));
        return `rgb(${result[0]}, ${result[1]}, ${result[2]})`;
    };

    const getSolidHslColor = (percent) => {
        const red = '#CC1725';
        const orange = '#DE7B00';
        const green = '#2C7125';

        if (percent < 50) {
            return interpolateColor(red, orange, percent / 50);
        } else {
            return interpolateColor(orange, green, (percent - 50) / 50);
        }
    };

    const createTopicCardHtml = (topic, index) => {
        const val = surveyState.topic_ratings[topic.id];
        const hasValue = val !== undefined;

        const isLastCard = index === activeTopics.length - 1;
        const isEditing = surveyState.status === 'edited_after_completion';

        let buttonHtml = '';
        if (isLastCard && isEditing) {
            buttonHtml = `
                <div class="text-center mt-3 z-3 position-absolute bottom-0 start-50 translate-middle-x mb-4" style="pointer-events: auto; width: 100%;">
                    <span class="d-inline-block disabled-wrapper" tabindex="0">
                        <button class="btn btn-success btn-lg rounded-pill px-5 shadow-sm btn-finish-survey ${!hasValue ? 'disabled' : ''}" style="${!hasValue ? 'pointer-events: none;' : ''}">
                            הגשת הסקר <i class="bi bi-check-lg ms-1"></i>
                        </button>
                    </span>
                </div>
            `;
        }

        let ticksHtml = '<div class="card-ticks position-absolute h-100 top-0 d-flex flex-column justify-content-between py-4" style="left: 0; pointer-events: none; z-index: 1;">';
        for (let i = 0; i <= 20; i++) {
            ticksHtml += `<div class="tick-mark ${i % 5 === 0 ? 'major' : ''}"></div>`;
        }
        ticksHtml += '</div>';

        return `
            <div class="topic-card-wrapper" id="wrapper-${topic.id}">
                <div class="card shadow mx-auto p-0 rounded-4 topic-card-bg inactive-card position-relative d-flex flex-row" id="card-${topic.id}" data-topic-id="${topic.id}" data-index="${index}">
                    
                    <!-- Sidebar Area (Right) -->
                    <div class="sidebar-rating position-relative d-flex flex-shrink-0" style="width: 100px; border-left: 1px solid #dee2e6; z-index: 2; overflow: hidden;">
                        <div class="fill-level-indicator sidebar-fill" id="fill-sidebar-${topic.id}" style="height: ${hasValue ? val : 0}%; background-color: ${hasValue ? getSolidHslColor(val) : 'transparent'};"></div>
                        
                        <div class="rating-labels-right position-absolute h-100 d-flex flex-column justify-content-between py-4" style="right: 8px; top: 0; pointer-events: none; width: 85px;">
                            <span class="fw-bold rating-label-small ${hasValue && val >= 67 ? 'active-label' : ''}" id="label-top-${topic.id}">מאוד רלוונטי!</span>
                            <span class="fw-bold rating-label-small ${hasValue && val >= 34 && val < 67 ? 'active-label' : ''}" id="label-mid-${topic.id}">מעניין אותי</span>
                            <span class="fw-bold rating-label-small ${hasValue && val < 34 ? 'active-label' : ''}" id="label-bot-${topic.id}">לא רלוונטי עבורי</span>
                        </div>

                        ${ticksHtml}
                    </div>

                    <!-- Main Content Area (Left) -->
                    <div class="main-card-area position-relative flex-grow-1 d-flex flex-column">
                        <div class="fill-level-indicator main-fill" id="fill-main-${topic.id}" style="height: ${hasValue ? val : 0}%; background-color: ${hasValue ? getPastelColor(val) : 'transparent'};"></div>
                        
                        <div class="inactivity-hint" id="hint-${topic.id}">
                            <i class="bi bi-chevron-up"></i>
                            <div style="height: 4px;"></div>
                            <i class="bi bi-chevron-down"></i>
                        </div>

                        <div class="content-overlay position-relative flex-grow-1 d-flex flex-column justify-content-center align-items-center px-4 text-center" style="pointer-events: none; z-index: 2;">
                            ${topic.imageUrl ? `<img src="${topic.imageUrl}" alt="תמונת נושא" class="img-fluid rounded-3 mb-4 shadow-sm" draggable="false" style="max-height: 200px; object-fit: cover;">` : ''}
                            <h2 class="fw-bold mb-3 text-dark" style="font-size: 2.2rem; text-shadow: 0 0 10px rgba(255,255,255,0.8);">${topic.title}</h2>
                            <p class="text-dark fs-5 mb-0" style="text-shadow: 0 0 10px rgba(255,255,255,0.8);">${topic.description}</p>
                        </div>
                    </div>
                    
                    ${buttonHtml}
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
            const topicId = cardInner.getAttribute('data-topic-id');

            if (idx === currentTopicIndex) {
                cardInner.classList.add('active-card');
                cardInner.classList.remove('inactive-card');
                cardInner.querySelectorAll('button').forEach(el => el.removeAttribute('disabled'));

                if (cardInner._hintTimer) clearTimeout(cardInner._hintTimer);
                if (surveyState.topic_ratings[topicId] === undefined) {
                    cardInner._hintTimer = setTimeout(() => {
                        const hint = document.getElementById(`hint-${topicId}`);
                        if (hint) hint.classList.add('show');
                    }, 3000);
                }
            } else {
                cardInner.classList.remove('active-card');
                cardInner.classList.add('inactive-card');

                const hint = document.getElementById(`hint-${topicId}`);
                if (hint) hint.classList.remove('show');
                if (cardInner._hintTimer) clearTimeout(cardInner._hintTimer);

                cardInner.querySelectorAll('button').forEach(el => {
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

        // Re-initialize tooltips
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

        attachDynamicListeners();
    };

    const attachDynamicListeners = () => {
        const cards = document.querySelectorAll('.topic-card-bg');
        cards.forEach(card => {
            let isDragging = false;
            const topicId = card.getAttribute('data-topic-id');
            const idx = parseInt(card.getAttribute('data-index'));

            const updateRatingFromEvent = (e) => {
                if (card.classList.contains('inactive-card')) return;

                const hint = document.getElementById(`hint-${topicId}`);
                if (hint) hint.classList.remove('show');
                if (card._hintTimer) clearTimeout(card._hintTimer);

                const rect = card.getBoundingClientRect();
                let clientY = e.clientY;
                if (e.touches && e.touches.length > 0) {
                    clientY = e.touches[0].clientY;
                }

                let yPos = clientY - rect.top;
                yPos = Math.max(0, Math.min(rect.height, yPos));

                let percent = 100 - (yPos / rect.height * 100);
                percent = Math.round(percent);

                const fillSidebar = document.getElementById(`fill-sidebar-${topicId}`);
                if (fillSidebar) {
                    fillSidebar.style.height = `${percent}%`;
                    fillSidebar.style.backgroundColor = getSolidHslColor(percent);
                }

                const fillMain = document.getElementById(`fill-main-${topicId}`);
                if (fillMain) {
                    fillMain.style.height = `${percent}%`;
                    fillMain.style.backgroundColor = getPastelColor(percent);
                }

                const labelTop = document.getElementById(`label-top-${topicId}`);
                const labelMid = document.getElementById(`label-mid-${topicId}`);
                const labelBot = document.getElementById(`label-bot-${topicId}`);

                if (labelTop && labelMid && labelBot) {
                    labelTop.classList.remove('active-label', 'covered-label');
                    labelMid.classList.remove('active-label', 'covered-label');
                    labelBot.classList.remove('active-label', 'covered-label');

                    if (percent >= 67) {
                        labelTop.classList.add('active-label');
                        labelMid.classList.add('covered-label');
                        labelBot.classList.add('covered-label');
                    }
                    else if (percent >= 34) {
                        labelMid.classList.add('active-label');
                        labelBot.classList.add('covered-label');
                    }
                    else {
                        labelBot.classList.add('active-label');
                    }
                }

                surveyState.topic_ratings[topicId] = percent;

                const finishBtn = card.querySelector('.btn-finish-survey');
                if (finishBtn) {
                    finishBtn.classList.remove('disabled');
                    finishBtn.style.pointerEvents = 'auto';
                }
            };

            const commitRating = async () => {
                if (card.classList.contains('inactive-card')) return;
                if (surveyState.topic_ratings[topicId] === undefined) return;

                if (idx > surveyState.last_answered_topic_index) {
                    surveyState.last_answered_topic_index = idx;
                }

                await saveProgress();
                localStorage.setItem('surveyState', JSON.stringify(surveyState));
                updateNavButtons();

                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                autoAdvanceTimer = setTimeout(() => {
                    handleNextTopic();
                }, config.rating.autoAdvanceDelayMs || 1000);
            };

            card.addEventListener('mousedown', (e) => {
                if (card.classList.contains('inactive-card')) return;
                if (e.target.closest('.btn-finish-survey')) return;

                isDragging = true;
                updateRatingFromEvent(e);
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                updateRatingFromEvent(e);
            });

            window.addEventListener('mouseup', (e) => {
                if (!isDragging) return;
                isDragging = false;
                commitRating();
            });

            card.addEventListener('touchstart', (e) => {
                if (card.classList.contains('inactive-card')) return;
                if (e.target.closest('.btn-finish-survey')) return;

                isDragging = true;
                updateRatingFromEvent(e);
            }, { passive: true });

            card.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                updateRatingFromEvent(e);
            }, { passive: true });

            card.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                commitRating();
            });

            card.addEventListener('touchcancel', (e) => {
                if (!isDragging) return;
                isDragging = false;
                commitRating();
            });
        });

        // Prev buttons click inside cards
        const prevBtns = document.querySelectorAll('.btn-prev');
        prevBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                if (currentTopicIndex > 0) {
                    currentTopicIndex--;
                    updateCarousel();
                    updateNavButtons();
                }
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
            if (surveyState.status !== 'edited_after_completion') {
                surveyState.status = 'completed';
                await saveProgress();
                localStorage.setItem('surveyState', JSON.stringify(surveyState));
                showCompletion();
            }
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
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
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
