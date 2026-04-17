/**
 * MindfulWake — Main Application Logic
 * Handles alarm CRUD, time checking, alarm triggering, quiz flow, audio, and persistence.
 */

(() => {
    'use strict';

    // ══════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════

    let alarms = [];
    let settings = {
        sound: 'classic',
        allowSnooze: false,
        penaltyEnabled: true,
        customToneName: null,   // filename of uploaded tone
        customToneData: null,   // base64 data URL
    };

    // Create alarm form state
    let formState = {
        hour: 7,
        minute: 0,
        ampm: 'AM',
        label: '',
        questionCount: 3,
        difficulty: 'medium',
        days: [1, 2, 3, 4, 5], // Mon-Fri
    };

    // Active alarm / quiz state
    let activeAlarm = null;
    let quizState = null;
    let alarmCheckInterval = null;
    let clockInterval = null;
    let alarmAudioCtx = null;
    let alarmOscillator = null;
    let alarmGain = null;
    let isRinging = false;
    let snoozeTimeout = null;
    let customToneAudio = null;    // HTMLAudioElement for custom tone
    let notifPermission = 'default'; // 'granted' | 'denied' | 'default'

    // ══════════════════════════════════════════
    //  PERSISTENCE
    // ══════════════════════════════════════════

    const STORAGE_KEY_ALARMS = 'mindfulwake_alarms';
    const STORAGE_KEY_SETTINGS = 'mindfulwake_settings';
    const STORAGE_KEY_CUSTOM_TONE = 'mindfulwake_custom_tone';

    function saveAlarms() {
        try {
            localStorage.setItem(STORAGE_KEY_ALARMS, JSON.stringify(alarms));
        } catch (e) { console.warn('Save alarms error:', e); }
    }

    function loadAlarms() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_ALARMS);
            if (data) alarms = JSON.parse(data);
        } catch (e) { console.warn('Load alarms error:', e); }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
        } catch (e) { console.warn('Save settings error:', e); }
    }

    function loadSettings() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
            if (data) settings = { ...settings, ...JSON.parse(data) };
        } catch (e) { console.warn('Load settings error:', e); }
    }

    function saveCustomTone(name, dataUrl) {
        try {
            localStorage.setItem(STORAGE_KEY_CUSTOM_TONE, JSON.stringify({ name, dataUrl }));
            settings.customToneName = name;
            settings.customToneData = dataUrl;
            saveSettings();
        } catch (e) { console.warn('Save custom tone error:', e); }
    }

    function loadCustomTone() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_CUSTOM_TONE);
            if (data) {
                const { name, dataUrl } = JSON.parse(data);
                settings.customToneName = name;
                settings.customToneData = dataUrl;
            }
        } catch (e) { console.warn('Load custom tone error:', e); }
    }

    function clearCustomTone() {
        try {
            localStorage.removeItem(STORAGE_KEY_CUSTOM_TONE);
            settings.customToneName = null;
            settings.customToneData = null;
            saveSettings();
        } catch (e) { console.warn('Clear custom tone error:', e); }
    }

    // ══════════════════════════════════════════
    //  DOM REFERENCES
    // ══════════════════════════════════════════

    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    // Tabs
    const tabBtns = $$('.tab-btn');
    const tabContents = $$('.tab-content');

    // Alarm list
    const alarmListEl = $('alarm-list');
    const noAlarmsEl = $('no-alarms');

    // Create form
    const hourDisplay = $('hour-display');
    const minuteDisplay = $('minute-display');
    const ampmBtns = $$('.ampm-btn');
    const questionCountSlider = $('question-count');
    const questionCountDisplay = $('question-count-display');
    const diffBtns = $$('.diff-btn');
    const dayBtns = $$('.day-btn');
    const alarmLabelInput = $('alarm-label');
    const saveAlarmBtn = $('save-alarm-btn');

    // Settings
    const soundSelect = $('alarm-sound-select');
    const snoozeToggle = $('snooze-toggle');
    const penaltyToggle = $('penalty-toggle');

    // Overlay
    const alarmOverlay = $('alarm-overlay');
    const ringingPhase = $('ringing-phase');
    const quizPhase = $('quiz-phase');
    const completePhase = $('complete-phase');
    const startQuizBtn = $('start-quiz-btn');
    const snoozeBtn = $('snooze-btn');
    const dismissAlarmBtn = $('dismiss-alarm-btn');
    const nextQuestionBtn = $('next-question-btn');

    // ══════════════════════════════════════════
    //  LIVE CLOCK
    // ══════════════════════════════════════════

    function updateClock() {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        const s = now.getSeconds();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        $('liveClock').textContent = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}`;
    }

    // ══════════════════════════════════════════
    //  TAB NAVIGATION
    // ══════════════════════════════════════════

    function switchTab(tabName) {
        tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
        tabContents.forEach(tc => {
            const isTarget = tc.id === `tab-${tabName}`;
            tc.classList.toggle('active', isTarget);
            if (isTarget) {
                // Reset animation
                tc.style.animation = 'none';
                tc.offsetHeight; // reflow
                tc.style.animation = '';
            }
        });
    }

    // ══════════════════════════════════════════
    //  MOBILE / PWA HELPERS
    // ══════════════════════════════════════════

    // Handle audio context unlocking for mobile
    function unlockAudio() {
        if (!alarmAudioCtx) {
            alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (alarmAudioCtx.state === 'suspended') {
            alarmAudioCtx.resume();
        }
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
        console.log('Audio Context unlocked');
    }
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    // ══════════════════════════════════════════
    //  NOTIFICATIONS
    // ══════════════════════════════════════════

    async function requestNotificationPermission() {
        if (!('Notification' in window)) {
            showToast('Notifications not supported on this browser.', 'error');
            return false;
        }
        try {
            const result = await Notification.requestPermission();
            notifPermission = result;
            updateNotifStatusUI();
            if (result === 'granted') {
                showToast('Notifications enabled! Alarms will ring in background. 🔔', 'success');
                // Schedule any existing alarms
                scheduleAllAlarmNotifications();
                return true;
            } else {
                showToast('Notifications denied. Alarm will only ring when app is open.', 'error');
                return false;
            }
        } catch (e) {
            console.warn('Notification permission error:', e);
            return false;
        }
    }

    function updateNotifStatusUI() {
        const statusEl = $('notif-status');
        const bannerEl = $('notif-banner');
        const reqBtn = $('request-notif-btn');
        const current = ('Notification' in window) ? Notification.permission : 'unsupported';
        notifPermission = current;

        if (!statusEl) return;

        if (current === 'granted') {
            statusEl.innerHTML = '<span class="notif-dot granted"></span> Notifications enabled';
            if (bannerEl) bannerEl.classList.add('hidden');
            if (reqBtn) reqBtn.textContent = 'Re-enable';
        } else if (current === 'denied') {
            statusEl.innerHTML = '<span class="notif-dot denied"></span> Blocked by browser – allow in site settings';
            if (bannerEl) bannerEl.classList.add('hidden');
            if (reqBtn) { reqBtn.textContent = 'Open Settings'; reqBtn.disabled = true; }
        } else if (current === 'unsupported') {
            statusEl.innerHTML = '<span class="notif-dot denied"></span> Not supported on this browser';
            if (reqBtn) reqBtn.disabled = true;
        } else {
            statusEl.innerHTML = '<span class="notif-dot denied"></span> Not enabled';
            if (bannerEl) bannerEl.classList.remove('hidden');
        }
    }

    function sendAlarmNotification(alarm) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const tag = `alarm-${alarm.id}`;
        const n = new Notification('⏰ MindfulWake', {
            body: `${formatAlarmTime(alarm)} — ${alarm.label}\nTap to answer your wake-up challenge!`,
            icon: 'mindfulwake_icon_1776407461951.png',
            badge: 'mindfulwake_icon_1776407461951.png',
            tag,
            requireInteraction: true,
            silent: false,
        });
        n.onclick = () => {
            window.focus();
            n.close();
        };
    }

    // Schedule a Web Notification for a future alarm using setTimeout.
    // Works only while the page is open, but combined with SW it persists.
    const scheduledTimers = new Map(); // alarmId -> timeoutId

    function scheduleAlarmNotification(alarm) {
        if (!alarm.enabled) return;
        // Cancel previous timer for this alarm
        if (scheduledTimers.has(alarm.id)) {
            clearTimeout(scheduledTimers.get(alarm.id));
            scheduledTimers.delete(alarm.id);
        }

        const now = new Date();
        const nextFire = getNextAlarmDate(alarm);
        if (!nextFire) return;

        const delay = nextFire.getTime() - now.getTime();
        if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) return; // Max 1 week

        const tid = setTimeout(() => {
            sendAlarmNotification(alarm);
            scheduledTimers.delete(alarm.id);
            // Reschedule for next occurrence
            setTimeout(() => scheduleAlarmNotification(alarm), 65000);
        }, delay);
        scheduledTimers.set(alarm.id, tid);
    }

    function scheduleAllAlarmNotifications() {
        alarms.forEach(a => scheduleAlarmNotification(a));
    }

    function cancelAlarmNotification(alarmId) {
        if (scheduledTimers.has(alarmId)) {
            clearTimeout(scheduledTimers.get(alarmId));
            scheduledTimers.delete(alarmId);
        }
    }

    function getNextAlarmDate(alarm) {
        const now = new Date();
        let alarmHour24 = alarm.hour;
        if (alarm.ampm === 'PM' && alarm.hour !== 12) alarmHour24 += 12;
        if (alarm.ampm === 'AM' && alarm.hour === 12) alarmHour24 = 0;

        // Try the next 7 days
        for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
            const candidate = new Date(now);
            candidate.setDate(candidate.getDate() + dayOffset);
            candidate.setHours(alarmHour24, alarm.minute, 0, 0);

            if (candidate <= now) continue;
            const dow = candidate.getDay();
            if (alarm.days.length > 0 && !alarm.days.includes(dow)) continue;
            return candidate;
        }
        return null;
    }



    function updateTimeDisplay() {
        hourDisplay.textContent = String(formState.hour).padStart(2, '0');
        minuteDisplay.textContent = String(formState.minute).padStart(2, '0');
    }

    function adjustTime(target, direction) {
        if (target === 'hour') {
            formState.hour = direction === 'up'
                ? (formState.hour % 12) + 1
                : (formState.hour - 2 + 12) % 12 + 1;
        } else {
            formState.minute = direction === 'up'
                ? (formState.minute + 5) % 60
                : (formState.minute - 5 + 60) % 60;
        }
        updateTimeDisplay();
    }

    function updateQuestionCountDisplay() {
        const val = parseInt(questionCountSlider.value);
        formState.questionCount = val;
        questionCountDisplay.textContent = `${val} question${val > 1 ? 's' : ''}`;
    }

    // ══════════════════════════════════════════
    //  ALARM CRUD
    // ══════════════════════════════════════════

    function createAlarm() {
        const alarm = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            hour: formState.hour,
            minute: formState.minute,
            ampm: formState.ampm,
            label: alarmLabelInput.value.trim() || 'Morning Alarm',
            questionCount: formState.questionCount,
            difficulty: formState.difficulty,
            days: [...formState.days],
            enabled: true,
            lastTriggered: null,
        };

        alarms.push(alarm);
        saveAlarms();
        renderAlarms();
        showToast(`Alarm set for ${formatAlarmTime(alarm)}`, 'success');

        // Schedule browser notification
        scheduleAlarmNotification(alarm);

        // Reset form
        alarmLabelInput.value = '';
        switchTab('alarms');
    }

    function toggleAlarm(id) {
        const alarm = alarms.find(a => a.id === id);
        if (alarm) {
            alarm.enabled = !alarm.enabled;
            saveAlarms();
            renderAlarms();
            if (alarm.enabled) {
                scheduleAlarmNotification(alarm);
            } else {
                cancelAlarmNotification(alarm.id);
            }
            showToast(
                alarm.enabled ? `Alarm enabled: ${formatAlarmTime(alarm)}` : 'Alarm disabled',
                alarm.enabled ? 'success' : 'info'
            );
        }
    }

    function deleteAlarm(id) {
        cancelAlarmNotification(id);
        alarms = alarms.filter(a => a.id !== id);
        saveAlarms();
        renderAlarms();
        showToast('Alarm deleted', 'info');
    }

    function formatAlarmTime(alarm) {
        return `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')} ${alarm.ampm}`;
    }

    function getDayNames(days) {
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        if (days.length === 7) return 'Every day';
        if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Weekdays';
        if (days.length === 2 && [0, 6].every(d => days.includes(d))) return 'Weekends';
        return days.sort().map(d => names[d]).join(', ');
    }

    function getDiffLabel(diff) {
        const labels = { easy: 'Gentle', medium: 'Focused', hard: 'Intense' };
        return labels[diff] || diff;
    }

    // ══════════════════════════════════════════
    //  RENDER ALARMS
    // ══════════════════════════════════════════

    function renderAlarms() {
        if (alarms.length === 0) {
            alarmListEl.style.display = 'none';
            noAlarmsEl.style.display = 'block';
            return;
        }

        noAlarmsEl.style.display = 'none';
        alarmListEl.style.display = 'flex';

        alarmListEl.innerHTML = alarms.map(alarm => `
            <div class="alarm-item ${alarm.enabled ? 'enabled' : 'disabled'}" data-id="${alarm.id}">
                <div class="alarm-info">
                    <div class="alarm-time-display">${formatAlarmTime(alarm)}</div>
                    <div class="alarm-meta">
                        <span class="alarm-label-display">${escapeHtml(alarm.label)}</span>
                        <div class="alarm-badges">
                            <span class="alarm-badge">${alarm.questionCount}Q</span>
                            <span class="alarm-badge">${getDiffLabel(alarm.difficulty)}</span>
                        </div>
                    </div>
                    <div class="alarm-days-display">${getDayNames(alarm.days)}</div>
                </div>
                <div class="alarm-controls">
                    <button class="alarm-delete-btn" data-delete="${alarm.id}" title="Delete alarm">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                    </button>
                    <label class="toggle-switch">
                        <input type="checkbox" ${alarm.enabled ? 'checked' : ''} data-toggle="${alarm.id}">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `).join('');

        // Bind events
        alarmListEl.querySelectorAll('[data-toggle]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                toggleAlarm(cb.dataset.toggle);
            });
        });

        alarmListEl.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteAlarm(btn.dataset.delete);
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ══════════════════════════════════════════
    //  ALARM CHECKING
    // ══════════════════════════════════════════

    function checkAlarms() {
        if (isRinging) return; // Already ringing

        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        for (const alarm of alarms) {
            if (!alarm.enabled) continue;

            // Convert alarm time to 24h
            let alarmHour24 = alarm.hour;
            if (alarm.ampm === 'PM' && alarm.hour !== 12) alarmHour24 += 12;
            if (alarm.ampm === 'AM' && alarm.hour === 12) alarmHour24 = 0;

            // Check if time matches
            if (alarmHour24 !== currentHour || alarm.minute !== currentMinute) continue;

            // Check day
            if (alarm.days.length > 0 && !alarm.days.includes(currentDay)) continue;

            // Check if already triggered this minute
            const triggerKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${currentHour}-${currentMinute}`;
            if (alarm.lastTriggered === triggerKey) continue;

            // TRIGGER!
            alarm.lastTriggered = triggerKey;
            saveAlarms();
            triggerAlarm(alarm);
            break;
        }
    }

    // ══════════════════════════════════════════
    //  ALARM TRIGGER & SOUND
    // ══════════════════════════════════════════

    function triggerAlarm(alarm) {
        activeAlarm = alarm;
        isRinging = true;

        // Fire a browser notification (works even if app was backgrounded)
        sendAlarmNotification(alarm);

        // Show overlay
        alarmOverlay.classList.remove('hidden');
        ringingPhase.classList.remove('hidden');
        quizPhase.classList.add('hidden');
        completePhase.classList.add('hidden');

        // Set ringing info
        $('ring-time').textContent = formatAlarmTime(alarm);
        $('ring-label').textContent = alarm.label;

        // Snooze button
        if (settings.allowSnooze) {
            snoozeBtn.classList.remove('hidden');
        } else {
            snoozeBtn.classList.add('hidden');
        }

        // Start alarm sound
        startAlarmSound();
    }

    function startAlarmSound() {
        // If a custom tone is stored, play it via HTMLAudio (looped)
        if (settings.sound === 'custom' && settings.customToneData) {
            try {
                if (customToneAudio) {
                    customToneAudio.pause();
                    customToneAudio.currentTime = 0;
                }
                customToneAudio = new Audio(settings.customToneData);
                customToneAudio.loop = true;
                customToneAudio.volume = 1.0;
                const playPromise = customToneAudio.play();
                if (playPromise) playPromise.catch(e => console.warn('Custom tone play error:', e));
                return;
            } catch (e) {
                console.warn('Custom tone error, falling back to synth:', e);
            }
        }

        // Fallback: Web Audio synth
        try {
            alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            alarmGain = alarmAudioCtx.createGain();
            alarmGain.connect(alarmAudioCtx.destination);
            alarmGain.gain.value = 0.3;
            playAlarmPattern();
        } catch (e) {
            console.warn('Audio not available:', e);
        }
    }

    // Expose a preview function for the test button on custom tones
    function previewCustomTone() {
        if (!settings.customToneData) return;
        const audio = new Audio(settings.customToneData);
        audio.volume = 1.0;
        audio.play().catch(e => console.warn('Preview error:', e));
        return audio;
    }

    function playAlarmPattern() {
        if (!isRinging || !alarmAudioCtx) return;

        const soundPatterns = {
            gentle: [
                { freq: 523.25, dur: 0.3, gap: 0.2 },
                { freq: 659.25, dur: 0.3, gap: 0.2 },
                { freq: 783.99, dur: 0.4, gap: 1.0 },
            ],
            classic: [
                { freq: 880, dur: 0.15, gap: 0.1 },
                { freq: 880, dur: 0.15, gap: 0.1 },
                { freq: 880, dur: 0.15, gap: 0.4 },
                { freq: 880, dur: 0.15, gap: 0.1 },
                { freq: 880, dur: 0.15, gap: 0.1 },
                { freq: 880, dur: 0.15, gap: 0.8 },
            ],
            nature: [
                { freq: 1200, dur: 0.08, gap: 0.06 },
                { freq: 1400, dur: 0.1, gap: 0.08 },
                { freq: 1600, dur: 0.06, gap: 0.3 },
                { freq: 1100, dur: 0.1, gap: 0.15 },
                { freq: 1500, dur: 0.08, gap: 0.8 },
            ],
            urgent: [
                { freq: 1000, dur: 0.1, gap: 0.05 },
                { freq: 1000, dur: 0.1, gap: 0.05 },
                { freq: 1000, dur: 0.1, gap: 0.05 },
                { freq: 1000, dur: 0.1, gap: 0.3 },
            ],
        };

        const pattern = soundPatterns[settings.sound] || soundPatterns.classic;
        let time = alarmAudioCtx.currentTime;

        for (const note of pattern) {
            const osc = alarmAudioCtx.createOscillator();
            const noteGain = alarmAudioCtx.createGain();

            osc.type = settings.sound === 'nature' ? 'sine' : 'square';
            osc.frequency.value = note.freq;

            noteGain.gain.setValueAtTime(0, time);
            noteGain.gain.linearRampToValueAtTime(0.25, time + 0.02);
            noteGain.gain.linearRampToValueAtTime(0, time + note.dur);

            osc.connect(noteGain);
            noteGain.connect(alarmGain);

            osc.start(time);
            osc.stop(time + note.dur + 0.01);

            time += note.dur + note.gap;
        }

        // Repeat
        const totalDuration = pattern.reduce((sum, n) => sum + n.dur + n.gap, 0);
        setTimeout(() => playAlarmPattern(), totalDuration * 1000 + 200);
    }

    function stopAlarmSound() {
        // Stop custom tone
        if (customToneAudio) {
            try {
                customToneAudio.pause();
                customToneAudio.currentTime = 0;
            } catch (e) { /* ignore */ }
            customToneAudio = null;
        }
        // Stop synth
        if (alarmAudioCtx) {
            try {
                alarmAudioCtx.close();
            } catch (e) { /* ignore */ }
            alarmAudioCtx = null;
            alarmGain = null;
        }
    }

    // ══════════════════════════════════════════
    //  SNOOZE
    // ══════════════════════════════════════════

    function snoozeAlarm() {
        stopAlarmSound();
        isRinging = false;
        alarmOverlay.classList.add('hidden');
        showToast('Snoozed for 2 minutes. Get ready!', 'info');

        // Re-trigger in 2 minutes
        snoozeTimeout = setTimeout(() => {
            if (activeAlarm) {
                triggerAlarm(activeAlarm);
            }
        }, 2 * 60 * 1000);

        // Disable snooze for next trigger
        settings.allowSnooze = false;
    }

    // ══════════════════════════════════════════
    //  QUIZ FLOW
    // ══════════════════════════════════════════

    function startQuiz() {
        if (!activeAlarm) return;

        // Stop alarm sound (or reduce volume)
        stopAlarmSound();

        // Generate questions
        const questions = QuestionBank.generate(activeAlarm.difficulty, activeAlarm.questionCount);

        quizState = {
            questions: questions,
            currentIndex: 0,
            correctCount: 0,
            wrongCount: 0,
            totalRequired: activeAlarm.questionCount,
            startTime: Date.now(),
            answered: false,
        };

        // Switch to quiz phase
        ringingPhase.classList.add('hidden');
        quizPhase.classList.remove('hidden');

        showQuestion();
    }

    function showQuestion() {
        if (!quizState) return;

        const q = quizState.questions[quizState.currentIndex];
        if (!q) {
            completeQuiz();
            return;
        }

        quizState.answered = false;

        // Category
        const catInfo = QuestionBank.getCategoryInfo(q.category);
        $('quiz-category').innerHTML = `<span class="cat-icon">${catInfo.icon}</span><span class="cat-name">${catInfo.name}</span>`;

        // Question
        $('quiz-question').textContent = q.question;

        // Progress
        const progress = (quizState.currentIndex / quizState.totalRequired) * 100;
        $('quiz-progress-fill').style.width = progress + '%';
        $('quiz-question-counter').textContent = `Question ${quizState.currentIndex + 1} of ${quizState.questions.length}`;
        $('quiz-score').textContent = `${quizState.correctCount} correct`;

        // Options
        const optLetters = ['A', 'B', 'C', 'D'];
        $('quiz-options').innerHTML = q.options.map((opt, i) => `
            <button class="quiz-option" data-index="${i}" data-correct="${opt.isCorrect}" id="quiz-opt-${i}">
                <span class="option-letter">${optLetters[i]}</span>
                <span class="option-text">${escapeHtml(opt.text)}</span>
            </button>
        `).join('');

        // Bind option clicks
        $$('.quiz-option').forEach(btn => {
            btn.addEventListener('click', () => handleAnswer(btn, q));
        });

        // Hide feedback
        $('quiz-feedback').classList.add('hidden');

        // Animate card
        const card = $('quiz-card');
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = 'fadeSlideIn 0.4s ease-out';
    }

    function handleAnswer(btn, question) {
        if (quizState.answered) return;
        quizState.answered = true;

        const isCorrect = btn.dataset.correct === 'true';

        // Highlight all options
        $$('.quiz-option').forEach(opt => {
            if (opt.dataset.correct === 'true') {
                opt.classList.add('correct');
            } else if (opt === btn && !isCorrect) {
                opt.classList.add('wrong');
            }
            opt.style.pointerEvents = 'none';
        });

        if (isCorrect) {
            quizState.correctCount++;
        } else {
            quizState.wrongCount++;
            // Penalty: add an extra question
            if (settings.penaltyEnabled) {
                const extra = QuestionBank.generate(activeAlarm.difficulty, 1);
                quizState.questions.push(extra[0]);
            }
        }

        // Show feedback
        const feedbackEl = $('quiz-feedback');
        feedbackEl.classList.remove('hidden');
        $('feedback-icon').textContent = isCorrect ? '✅' : '❌';
        $('feedback-text').innerHTML = isCorrect
            ? `<strong>Correct!</strong> ${escapeHtml(question.explanation || '')}`
            : `<strong>Not quite.</strong> ${escapeHtml(question.explanation || '')}${settings.penaltyEnabled ? '<br><em style="color:var(--accent-amber)">+1 penalty question added!</em>' : ''}`;

        // Update score display
        $('quiz-score').textContent = `${quizState.correctCount} correct`;

        // Check if this is the last question
        if (quizState.currentIndex >= quizState.questions.length - 1) {
            nextQuestionBtn.textContent = 'See Results →';
        } else {
            nextQuestionBtn.textContent = 'Next Question →';
        }
    }

    function nextQuestion() {
        if (!quizState) return;

        quizState.currentIndex++;

        if (quizState.currentIndex >= quizState.questions.length) {
            completeQuiz();
        } else {
            showQuestion();
        }
    }

    function completeQuiz() {
        const elapsed = Date.now() - quizState.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

        // Show complete phase
        quizPhase.classList.add('hidden');
        completePhase.classList.remove('hidden');

        const total = quizState.correctCount + quizState.wrongCount;
        $('complete-subtitle').textContent = `You answered ${quizState.correctCount}/${total} correctly. ${quizState.correctCount === total ? 'Your mind is razor-sharp!' : 'Keep pushing yourself!'}`;
        $('stat-correct').textContent = quizState.correctCount;
        $('stat-wrong').textContent = quizState.wrongCount;
        $('stat-time').textContent = timeStr;

        // Progress bar complete
        $('quiz-progress-fill').style.width = '100%';

        // Morning quote
        const quote = QuestionBank.getQuote();
        $('morning-message').innerHTML = `<p>"${escapeHtml(quote.text)}"</p><span>— ${escapeHtml(quote.author)}</span>`;

        // Reset complete phase animation
        completePhase.style.animation = 'none';
        completePhase.offsetHeight;
        completePhase.style.animation = 'phaseIn 0.5s ease-out';
    }

    function dismissAlarm() {
        stopAlarmSound();
        isRinging = false;
        activeAlarm = null;
        quizState = null;

        alarmOverlay.classList.add('hidden');

        // Re-enable snooze for next time
        settings.allowSnooze = loadedSnooze();

        if (snoozeTimeout) {
            clearTimeout(snoozeTimeout);
            snoozeTimeout = null;
        }

        showToast('Have an amazing day! ☀️', 'success');
    }

    function loadedSnooze() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
            if (data) return JSON.parse(data).allowSnooze || false;
        } catch (e) { /* ignore */ }
        return false;
    }

    // ══════════════════════════════════════════
    //  TOAST NOTIFICATIONS
    // ══════════════════════════════════════════

    function showToast(message, type = 'info') {
        const container = $('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        toast.innerHTML = `<span>${icons[type] || '📢'}</span><span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ══════════════════════════════════════════
    //  SETTINGS SYNC
    // ══════════════════════════════════════════

    function syncSettingsUI() {
        soundSelect.value = settings.sound || 'classic';
        snoozeToggle.checked = settings.allowSnooze;
        penaltyToggle.checked = settings.penaltyEnabled;

        // Sync custom tone display
        updateCustomToneUI();

        // Sync notification status
        updateNotifStatusUI();
    }

    function updateCustomToneUI() {
        const toneNameEl = $('custom-tone-name');
        const clearBtn = $('clear-tone-btn');
        const testCustomBtn = $('test-custom-tone-btn');
        const customOption = $('sound-option-custom');

        if (settings.customToneName) {
            if (toneNameEl) toneNameEl.textContent = settings.customToneName;
            if (clearBtn) clearBtn.classList.remove('hidden');
            if (testCustomBtn) testCustomBtn.classList.remove('hidden');
            if (customOption) customOption.disabled = false;
        } else {
            if (toneNameEl) toneNameEl.textContent = 'No file chosen';
            if (clearBtn) clearBtn.classList.add('hidden');
            if (testCustomBtn) testCustomBtn.classList.add('hidden');
            if (customOption) customOption.disabled = true;
            // If sound was set to custom but no file, revert
            if (settings.sound === 'custom') {
                settings.sound = 'classic';
                soundSelect.value = 'classic';
                saveSettings();
            }
        }
    }

    // ══════════════════════════════════════════
    //  EVENT BINDINGS
    // ══════════════════════════════════════════

    function bindEvents() {
        // Tab navigation
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Go to create tab from empty state
        $('goto-create-btn').addEventListener('click', () => switchTab('create'));

        // Time picker
        $('hour-up').addEventListener('click', () => adjustTime('hour', 'up'));
        $('hour-down').addEventListener('click', () => adjustTime('hour', 'down'));
        $('minute-up').addEventListener('click', () => adjustTime('minute', 'up'));
        $('minute-down').addEventListener('click', () => adjustTime('minute', 'down'));

        // AM/PM toggle
        ampmBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                ampmBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                formState.ampm = btn.dataset.ampm;
            });
        });

        // Question count slider
        questionCountSlider.addEventListener('input', updateQuestionCountDisplay);

        // Difficulty buttons
        diffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                diffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                formState.difficulty = btn.dataset.diff;
            });
        });

        // Day buttons
        dayBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const day = parseInt(btn.dataset.day);
                btn.classList.toggle('active');
                if (btn.classList.contains('active')) {
                    if (!formState.days.includes(day)) formState.days.push(day);
                } else {
                    formState.days = formState.days.filter(d => d !== day);
                }
            });
        });

        // Save alarm
        saveAlarmBtn.addEventListener('click', createAlarm);

        // Settings
        soundSelect.addEventListener('change', () => {
            settings.sound = soundSelect.value;
            saveSettings();
        });

        snoozeToggle.addEventListener('change', () => {
            settings.allowSnooze = snoozeToggle.checked;
            saveSettings();
        });

        penaltyToggle.addEventListener('change', () => {
            settings.penaltyEnabled = penaltyToggle.checked;
            saveSettings();
        });

        // Test sound button
        $('test-sound-btn').addEventListener('click', () => {
            const btn = $('test-sound-btn');
            if (isRinging) return; // Don't interrupt real alarm

            if (btn.classList.contains('playing')) {
                // Stop testing
                isRinging = false;
                stopAlarmSound();
                btn.classList.remove('playing');
                btn.textContent = 'Test';
            } else {
                // Start testing
                isRinging = true;
                startAlarmSound();
                btn.classList.add('playing');
                btn.textContent = 'Stop';

                // Auto stop after 5 seconds
                setTimeout(() => {
                    if (btn.classList.contains('playing')) {
                        isRinging = false;
                        stopAlarmSound();
                        btn.classList.remove('playing');
                        btn.textContent = 'Test';
                    }
                }, 5000);
            }
        });

        // Alarm overlay
        startQuizBtn.addEventListener('click', startQuiz);
        snoozeBtn.addEventListener('click', snoozeAlarm);
        nextQuestionBtn.addEventListener('click', nextQuestion);
        dismissAlarmBtn.addEventListener('click', dismissAlarm);

        // Notification permission buttons
        const reqNotifBtn = $('request-notif-btn');
        if (reqNotifBtn) {
            reqNotifBtn.addEventListener('click', requestNotificationPermission);
        }
        const enableNotifBtn = $('enable-notif-btn');
        if (enableNotifBtn) {
            enableNotifBtn.addEventListener('click', requestNotificationPermission);
        }

        // Custom tone upload
        const toneFileInput = $('tone-file-input');
        const toneDropZone = $('tone-drop-zone');

        if (toneFileInput) {
            toneFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) handleToneFile(file);
                toneFileInput.value = '';
            });
        }

        if (toneDropZone) {
            toneDropZone.addEventListener('click', () => toneFileInput && toneFileInput.click());
            toneDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                toneDropZone.classList.add('drag-over');
            });
            toneDropZone.addEventListener('dragleave', () => toneDropZone.classList.remove('drag-over'));
            toneDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                toneDropZone.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) handleToneFile(file);
            });
        }

        const clearToneBtn = $('clear-tone-btn');
        if (clearToneBtn) {
            clearToneBtn.addEventListener('click', () => {
                clearCustomTone();
                updateCustomToneUI();
                showToast('Custom tone removed.', 'info');
            });
        }

        // Test custom tone button
        const testCustomToneBtn = $('test-custom-tone-btn');
        let testCustomAudio = null;
        if (testCustomToneBtn) {
            testCustomToneBtn.addEventListener('click', () => {
                if (testCustomAudio && !testCustomAudio.paused) {
                    testCustomAudio.pause();
                    testCustomAudio.currentTime = 0;
                    testCustomAudio = null;
                    testCustomToneBtn.textContent = '▶ Preview';
                } else {
                    testCustomAudio = previewCustomTone();
                    if (testCustomAudio) {
                        testCustomToneBtn.textContent = '■ Stop';
                        testCustomAudio.addEventListener('ended', () => {
                            testCustomToneBtn.textContent = '▶ Preview';
                            testCustomAudio = null;
                        });
                        setTimeout(() => {
                            if (testCustomAudio) {
                                testCustomAudio.pause();
                                testCustomAudio.currentTime = 0;
                                testCustomAudio = null;
                                testCustomToneBtn.textContent = '▶ Preview';
                            }
                        }, 10000);
                    }
                }
            });
        }

        // Keyboard shortcut: Enter for next question
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && quizState && quizState.answered) {
                nextQuestion();
            }
        });
    }

    // ══════════════════════════════════════════
    //  CUSTOM TONE FILE HANDLER
    // ══════════════════════════════════════════

    function handleToneFile(file) {
        const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac',
            'audio/x-m4a', 'audio/mp4', 'audio/webm', 'audio/flac'];
        if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|aac|m4a|flac|webm)$/i)) {
            showToast('Please upload an audio file (MP3, WAV, OGG, AAC, M4A, FLAC).', 'error');
            return;
        }
        if (file.size > 20 * 1024 * 1024) { // 20MB limit
            showToast('File too large. Max size is 20MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            saveCustomTone(file.name, dataUrl);
            // Auto-select custom sound
            settings.sound = 'custom';
            soundSelect.value = 'custom';
            saveSettings();
            updateCustomToneUI();
            showToast(`Alarm tone set: ${file.name} 🎵`, 'success');
        };
        reader.onerror = () => showToast('Failed to read audio file.', 'error');
        reader.readAsDataURL(file);
    }



    // ══════════════════════════════════════════
    //  INITIALIZATION
    // ══════════════════════════════════════════

    function init() {
        // Load persisted data
        loadAlarms();
        loadSettings();
        loadCustomTone();

        // Setup UI
        updateTimeDisplay();
        updateQuestionCountDisplay();
        syncSettingsUI();
        renderAlarms();
        bindEvents();

        // Start clocks
        updateClock();
        clockInterval = setInterval(updateClock, 1000);

        // Start alarm checking (every 1 second for precision)
        alarmCheckInterval = setInterval(checkAlarms, 1000);
        checkAlarms();

        // Check notification permission state
        updateNotifStatusUI();

        // Schedule notifications for existing alarms if permission already granted
        if ('Notification' in window && Notification.permission === 'granted') {
            scheduleAllAlarmNotifications();
        }

        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('MindfulWake: ServiceWorker registered'))
                    .catch(err => console.error('MindfulWake: ServiceWorker failed', err));
            });
        }

        console.log('🧠 MindfulWake initialized. Alarms active:', alarms.filter(a => a.enabled).length);
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();