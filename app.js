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
        bedtimeTarget: '22:30',
        bedtimeOffset: 1,
        timerEnabled: false,
        autoAdjust: true,
        gradualVolume: false,
        agenda: ''
    };

    let stats = {
        streak: 0,
        lastCompletedDate: null,
        totalCorrect: 0,
        totalAnswered: 0,
        fastestTime: null,
        history: [], // Array of { date: string, accuracy: number, time: number }
        weeklyPerformance: [0, 0, 0, 0, 0, 0, 0] // MTWTFSS
    };

    // Timer state
    let questionTimerInterval = null;
    let currentQuestionTime = 15;

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
    const STORAGE_KEY_STATS = 'mindfulwake_stats';

    function saveStats() {
        try {
            localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
        } catch (e) { console.warn('Save stats error:', e); }
    }

    function loadStats() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_STATS);
            if (data) stats = { ...stats, ...JSON.parse(data) };
        } catch (e) { console.warn('Load stats error:', e); }
    }


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

    // New element references
    const bedtimeTargetInput = $('bedtime-target');
    const bedtimeOffsetInput = $('bedtime-offset');
    const timerToggle = $('timer-toggle');
    const autoAdjustToggle = $('auto-adjust-toggle');
    const gradualToggle = $('gradual-toggle');
    const agendaInput = $('agenda-input');
    const journalInput = $('journal-input');
    const refreshWeatherBtn = $('refresh-weather-btn');

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

        if (tabName === 'weather') fetchWeather();
        if (tabName === 'stats') updateStatsUI();
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
        // iOS Safari requires permission request from user gesture
        try {
            let result;
            // Some older browsers return the result via callback only
            if (typeof Notification.requestPermission === 'function') {
                result = await Notification.requestPermission();
            } else {
                result = await new Promise((resolve) => Notification.requestPermission(resolve));
            }
            notifPermission = result;
            updateNotifStatusUI();
            if (result === 'granted') {
                showToast('Notifications enabled! Alarms will notify you. 🔔', 'success');
                scheduleAllAlarmNotifications();
                return true;
            } else if (result === 'denied') {
                showToast('Notifications blocked. Enable in your browser/OS settings.', 'error');
                return false;
            } else {
                showToast('Notification permission dismissed.', 'info');
                return false;
            }
        } catch (e) {
            console.warn('Notification permission error:', e);
            showToast('Could not request notification permission.', 'error');
            return false;
        }
    }

    function updateNotifStatusUI() {
        const statusEl = $('notif-status');
        const bannerEl = $('notif-banner');
        const reqBtn = $('request-notif-btn');
        const current = ('Notification' in window) ? Notification.permission : 'unsupported';
        notifPermission = current;

        // Decoupled Banner logic
        if (bannerEl) {
            if (current === 'granted' || current === 'denied' || current === 'unsupported') {
                bannerEl.style.display = 'none';
            } else {
                bannerEl.style.display = 'flex';
            }
        }

        // Settings status logic
        if (statusEl) {
            if (current === 'granted') {
                statusEl.innerHTML = '<span class="notif-dot granted"></span> Notifications enabled';
                if (reqBtn) reqBtn.textContent = 'Re-enable';
            } else if (current === 'denied') {
                statusEl.innerHTML = '<span class="notif-dot denied"></span> Blocked by browser';
                if (reqBtn) { reqBtn.textContent = 'Open Settings'; reqBtn.disabled = true; }
            } else if (current === 'unsupported') {
                statusEl.innerHTML = '<span class="notif-dot denied"></span> Not supported';
                if (reqBtn) reqBtn.disabled = true;
            } else {
                statusEl.innerHTML = '<span class="notif-dot default"></span> Action required';
            }
        }
    }

    function sendAlarmNotification(alarm) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const tag = `mw-alarm-${alarm.id}`;
        const label = alarm.label || 'Morning Alarm';
        const timeStr = formatAlarmTime(alarm);
        const n = new Notification('⏰ MindfulWake', {
            body: `${timeStr} — ${label}\nTap to start your wake-up challenge! 🧠`,
            icon: 'mindfulwake_icon_1776407461951.png',
            badge: 'mindfulwake_icon_1776407461951.png',
            tag,
            renotify: true,
            requireInteraction: true,
            silent: false,
            // vibrate is supported on Android Chrome but ignored on iOS/desktop
            vibrate: [400, 150, 400, 150, 600],
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
        if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) return;

        // In-page timer (works when app is open/visible)
        const tid = setTimeout(() => {
            sendAlarmNotification(alarm);
            scheduledTimers.delete(alarm.id);
            setTimeout(() => scheduleAlarmNotification(alarm), 65000);
        }, delay);
        scheduledTimers.set(alarm.id, tid);

        // Also ask the Service Worker to schedule it for background reliability
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SCHEDULE_ALARM',
                alarm: {
                    id: alarm.id,
                    label: alarm.label || 'Morning Alarm',
                    timeStr: formatAlarmTime(alarm),
                    nextFireMs: nextFire.getTime(),
                },
            });
        }
    }

    function scheduleAllAlarmNotifications() {
        alarms.forEach(a => scheduleAlarmNotification(a));
    }

    function cancelAlarmNotification(alarmId) {
        if (scheduledTimers.has(alarmId)) {
            clearTimeout(scheduledTimers.get(alarmId));
            scheduledTimers.delete(alarmId);
        }
        // Tell the Service Worker to cancel too
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CANCEL_ALARM',
                alarm: { id: alarmId },
            });
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

        // Bedtime Reminder Check
        if (settings.bedtimeTarget && typeof settings.bedtimeOffset === 'number') {
            const bedtimeKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-bedtime`;
            if (settings.lastBedtimePing !== bedtimeKey) {
                const [bh, bm] = settings.bedtimeTarget.split(':').map(Number);
                const targetDate = new Date();
                targetDate.setHours(bh, bm, 0, 0);

                const pingDate = new Date(targetDate.getTime() - (settings.bedtimeOffset * 60 * 60 * 1000));
                
                // If it's time to ping and we haven't yet
                if (now.getHours() === pingDate.getHours() && now.getMinutes() === pingDate.getMinutes()) {
                    settings.lastBedtimePing = bedtimeKey;
                    saveSettings();
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('🌙 Time to wind down', {
                            body: `Your target sleep time is in ${settings.bedtimeOffset} hour(s).`,
                            icon: 'mindfulwake_icon_1776407461951.png'
                        });
                    }
                }
            }
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
            
            if (settings.gradualVolume) {
                alarmGain.gain.setValueAtTime(0.01, alarmAudioCtx.currentTime);
                alarmGain.gain.linearRampToValueAtTime(0.4, alarmAudioCtx.currentTime + 30); // 30s ramp
            } else {
                alarmGain.gain.value = 0.3;
            }
            
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

        // Smart Difficulty Auto-Adjust
        let diff = activeAlarm.difficulty;
        if (settings.autoAdjust && stats.totalAnswered > 10) {
            const acc = stats.totalCorrect / stats.totalAnswered;
            if (acc >= 0.85 && diff !== 'hard') {
                diff = diff === 'easy' ? 'medium' : 'hard';
                showToast('Smart Adjust: Difficulty increased based on high accuracy!', 'info');
            } else if (acc <= 0.4 && diff !== 'easy') {
                diff = diff === 'hard' ? 'medium' : 'easy';
                showToast('Smart Adjust: Difficulty reduced to ease you in.', 'info');
            }
        }

        // Generate questions
        const questions = QuestionBank.generate(diff, activeAlarm.questionCount);

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

        // Timer
        const timerDisplay = $('quiz-timer-display');
        const timerVal = $('quiz-timer-val');
        if (questionTimerInterval) clearInterval(questionTimerInterval);

        if (settings.timerEnabled) {
            timerDisplay.classList.remove('hidden');
            currentQuestionTime = 15;
            timerVal.textContent = currentQuestionTime;
            questionTimerInterval = setInterval(() => {
                if (quizState.answered) {
                    clearInterval(questionTimerInterval);
                    return;
                }
                currentQuestionTime--;
                timerVal.textContent = currentQuestionTime;
                if (currentQuestionTime <= 0) {
                    clearInterval(questionTimerInterval);
                    // Force a wrong answer by finding the first incorrect button
                    const wrongBtn = Array.from($$('.quiz-option')).find(b => b.dataset.correct === 'false');
                    if (wrongBtn) handleAnswer(wrongBtn, q);
                }
            }, 1000);
        } else {
            timerDisplay.classList.add('hidden');
        }

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

        // Update history (last 5)
        const historyEntry = {
            date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            accuracy: Math.round((quizState.correctCount / (quizState.correctCount + quizState.wrongCount)) * 100),
            time: elapsed
        };
        stats.history = [historyEntry, ...stats.history || []].slice(0, 5);

        // Update weekly performance
        const dayIndex = (new Date().getDay() + 6) % 7; // Map 0-6 (Sun-Sat) to 0-6 (Mon-Sun)
        stats.weeklyPerformance[dayIndex] = (stats.weeklyPerformance[dayIndex] || 0) + 1;

        saveStats();
        updateStatsUI();

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

        if (bedtimeTargetInput) bedtimeTargetInput.value = settings.bedtimeTarget || '22:30';
        if (bedtimeOffsetInput) bedtimeOffsetInput.value = settings.bedtimeOffset || 1;
        if (timerToggle) timerToggle.checked = settings.timerEnabled;
        if (autoAdjustToggle) autoAdjustToggle.checked = settings.autoAdjust;
        if (gradualToggle) gradualToggle.checked = settings.gradualVolume;
        if (agendaInput) agendaInput.value = settings.agenda || '';

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

        // Settings binders
        soundSelect.addEventListener('change', () => { 
            if (soundSelect.value === 'custom') {
                const input = $('tone-file-input');
                if (input) input.click();
            } else {
                settings.sound = soundSelect.value; 
                saveSettings(); 
            }
        });
        snoozeToggle.addEventListener('change', () => { settings.allowSnooze = snoozeToggle.checked; saveSettings(); });
        penaltyToggle.addEventListener('change', () => { settings.penaltyEnabled = penaltyToggle.checked; saveSettings(); });
        if (timerToggle) timerToggle.addEventListener('change', () => { settings.timerEnabled = timerToggle.checked; saveSettings(); });
        if (autoAdjustToggle) autoAdjustToggle.addEventListener('change', () => { settings.autoAdjust = autoAdjustToggle.checked; saveSettings(); });
        if (gradualToggle) gradualToggle.addEventListener('change', () => { settings.gradualVolume = gradualToggle.checked; saveSettings(); });
        if (bedtimeTargetInput) bedtimeTargetInput.addEventListener('change', () => { settings.bedtimeTarget = bedtimeTargetInput.value; saveSettings(); });
        if (bedtimeOffsetInput) bedtimeOffsetInput.addEventListener('input', () => { settings.bedtimeOffset = Number(bedtimeOffsetInput.value); saveSettings(); });
        if (agendaInput) agendaInput.addEventListener('input', () => { settings.agenda = agendaInput.value; saveSettings(); });

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
    //  WEATHER & STATS ALGORITHMS
    // ══════════════════════════════════════════

    function updateStatsUI() {
        if (!stats) return;
        const streakVal = $('streak-value');
        const accVal = $('accuracy-value');
        const timeVal = $('fastest-value');
        const historyList = $('history-list');
        const performanceChart = $('performance-chart');
        
        if (streakVal) streakVal.textContent = stats.streak || 0;
        
        if (accVal) {
            if (stats.totalAnswered > 0) {
                accVal.textContent = Math.round((stats.totalCorrect / stats.totalAnswered) * 100) + '%';
            } else {
                accVal.textContent = '0%';
            }
        }
        
        if (timeVal) {
            if (stats.fastestTime) {
                const minutes = Math.floor(stats.fastestTime / 60000);
                const seconds = Math.floor((stats.fastestTime % 60000) / 1000);
                timeVal.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
            } else {
                timeVal.textContent = '--:--';
            }
        }

        // Render History
        if (historyList) {
            if (stats.history && stats.history.length > 0) {
                historyList.innerHTML = stats.history.map(h => `
                    <div class="history-item">
                        <div class="history-main">
                            <span class="history-date">${h.date}</span>
                            <span class="history-meta">Mindful Session</span>
                        </div>
                        <div class="history-stat">
                            <span class="history-acc">${h.accuracy}%</span>
                            <span class="history-time">${Math.floor(h.time/1000)}s</span>
                        </div>
                    </div>
                `).join('');
            } else {
                historyList.innerHTML = '<div class="empty-history">No recent activity yet.</div>';
            }
        }

        // Render Weekly Performance Chart
        if (performanceChart) {
            if (stats.weeklyPerformance && stats.weeklyPerformance.some(v => v > 0)) {
                const max = Math.max(...stats.weeklyPerformance, 1);
                performanceChart.innerHTML = stats.weeklyPerformance.map((v, i) => {
                    const height = (v / max) * 100;
                    return `
                        <div class="chart-bar-wrapper">
                            <div class="chart-bar" style="height: ${height}%" data-value="${v} sessions"></div>
                        </div>
                    `;
                }).join('');
            } else {
                performanceChart.innerHTML = '<div class="chart-placeholder">Completing more alarms to see trends</div>';
            }
        }
    }

    async function fetchWeather(lat = null, lon = null, cityName = null) {
        const errorEl = $('weather-error');
        const locEl = $('weather-location');
        const dateEl = $('weather-date');
        
        if (errorEl) errorEl.classList.add('hidden');
        if (locEl) locEl.textContent = cityName || 'Locating...';
        if (dateEl) {
            const today = new Date();
            dateEl.textContent = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        }

        // If coordinates provided (from manual search), skip geolocation
        if (lat !== null && lon !== null) {
            await getWeatherData(lat, lon, cityName);
            return;
        }
        
        if (!navigator.geolocation) {
            showWeatherError('Geolocation not supported.');
            return;
        }

        // Use a timeout for geolocation
        navigator.geolocation.getCurrentPosition(async (pos) => {
            if (locEl) locEl.textContent = 'Fetching data...';
            const curLat = pos.coords.latitude;
            const curLon = pos.coords.longitude;
            await getWeatherData(curLat, curLon);
        }, (err) => {
            // If it fails, don't just show "Unknown", offer manual input
            let msg = 'Location access denied.';
            if (window.location.protocol === 'file:') {
                msg = 'Geolocation blocked on local files. Use manual search below.';
            } else if (err.code === err.TIMEOUT) {
                msg = 'Location request timed out.';
            }
            showWeatherError(msg);
            if (locEl) locEl.textContent = 'Location Required';
        }, { timeout: 10000, maximumAge: 60000 });
    }

    async function getWeatherData(lat, lon, cityName = null) {
        const locEl = $('weather-location');
        const errorEl = $('weather-error');
        
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index,surface_pressure,visibility&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            
            renderWeatherEnhanced(data);
            if (errorEl) errorEl.classList.add('hidden'); // Success! Hide error
            
            if (cityName) {
                if (locEl) locEl.textContent = cityName;
            } else {
                // Try reverse geocoding
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
                    const geoData = await geoRes.json();
                    if (locEl) locEl.textContent = geoData.address.city || geoData.address.town || geoData.address.village || 'Current Location';
                } catch(e) {
                    if (locEl) locEl.textContent = 'My Location';
                }
            }
        } catch (err) {
            showWeatherError('Failed to load weather data.');
        }
    }

    async function searchCity() {
        const input = $('manual-city-input');
        const cityName = input.value.trim();
        if (!cityName) return;

        const locEl = $('weather-location');
        if (locEl) locEl.textContent = `Searching for ${cityName}...`;

        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`);
            const data = await res.json();
            
            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                fetchWeather(result.latitude, result.longitude, result.name);
                input.value = '';
            } else {
                showWeatherError(`Could not find "${cityName}". Try another city.`);
            }
        } catch (e) {
            showWeatherError('Search failed. Check your connection.');
        }
    }

    function showWeatherError(msg) {
        const errorEl = $('weather-error');
        const msgEl = $('weather-error-msg');
        if (errorEl) {
            if (msgEl) msgEl.textContent = msg;
            errorEl.classList.remove('hidden');
        }
    }

    function renderWeatherEnhanced(data) {
        const current = data.current;
        const daily = data.daily;
        const hourly = data.hourly;

        const tempEl = $('weather-temp');
        const descEl = $('weather-desc');
        const highEl = $('w-high');
        const lowEl = $('w-low');
        const feelsEl = $('w-feels-like');
        const humEl = $('w-humidity');
        const windEl = $('w-wind');
        const uvEl = $('w-uv');
        const visEl = $('w-vis');
        const pressEl = $('w-pressure');
        const hourlyEl = $('hourly-forecast');
        const visualEl = $('weather-visual');

        if (tempEl) tempEl.textContent = Math.round(current.temperature_2m);
        if (highEl) highEl.textContent = `H: ${Math.round(daily.temperature_2m_max[0])}°`;
        if (lowEl) lowEl.textContent = `L: ${Math.round(daily.temperature_2m_min[0])}°`;
        if (feelsEl) feelsEl.textContent = Math.round(current.apparent_temperature) + '°';
        if (humEl) humEl.textContent = current.relative_humidity_2m + '%';
        if (windEl) windEl.textContent = Math.round(current.wind_speed_10m) + ' km/h';
        if (uvEl) uvEl.textContent = current.uv_index.toFixed(1);
        if (visEl) visEl.textContent = (current.visibility / 1000).toFixed(1) + ' km';
        if (pressEl) pressEl.textContent = Math.round(current.surface_pressure) + ' hPa';

        // WMO codes mapping
        const codes = {
            0: { label: 'Clear sky', icon: '☀️' },
            1: { label: 'Mainly clear', icon: '🌤️' },
            2: { label: 'Partly cloudy', icon: '⛅' },
            3: { label: 'Overcast', icon: '☁️' },
            45: { label: 'Fog', icon: '🌫️' },
            48: { label: 'Foggy', icon: '🌫️' },
            51: { label: 'Light drizzle', icon: '🌧️' },
            61: { label: 'Slight rain', icon: '🌧️' },
            63: { label: 'Moderate rain', icon: '🌧️' },
            65: { label: 'Heavy rain', icon: '⛈️' },
            71: { label: 'Slight snow', icon: '🌨️' },
            95: { label: 'Thunderstorm', icon: '⛈️' }
        };

        const weatherInfo = codes[current.weather_code] || { label: 'Cloudy', icon: '☁️' };
        if (descEl) descEl.textContent = weatherInfo.label;
        if (visualEl) {
            visualEl.innerHTML = `<span style="font-size: 80px;">${weatherInfo.icon}</span>`;
            // Add subtle animation pulse
            visualEl.animate([
                { transform: 'scale(1)', opacity: 0.8 },
                { transform: 'scale(1.05)', opacity: 1 },
                { transform: 'scale(1)', opacity: 0.8 }
            ], { duration: 4000, iterations: Infinity });
        }

        // Render Hourly Forecast (next 12 hours)
        if (hourlyEl) {
            let hourlyHtml = '';
            const nowHour = new Date().getHours();
            for (let i = nowHour; i < nowHour + 12; i++) {
                const hourIdx = i % 24;
                const timeStr = i === nowHour ? 'Now' : (hourIdx === 0 ? '12 AM' : (hourIdx > 12 ? (hourIdx-12) + ' PM' : hourIdx + ' AM'));
                const hCode = hourly.weather_code[i] || 0;
                const hIcon = (codes[hCode] || {icon: '☁️'}).icon;
                const hTemp = Math.round(hourly.temperature_2m[i]) + '°';

                hourlyHtml += `
                    <div class="hourly-item">
                        <span class="h-time">${timeStr}</span>
                        <span class="h-icon">${hIcon}</span>
                        <span class="h-temp">${hTemp}</span>
                    </div>
                `;
            }
            hourlyEl.innerHTML = hourlyHtml;
        }
    }

    // ══════════════════════════════════════════
    //  INITIALIZATION
    // ══════════════════════════════════════════

    function init() {
        // Load persisted data
        loadAlarms();
        loadSettings();
        loadStats();
        loadCustomTone();

        // Setup UI
        updateTimeDisplay();
        updateQuestionCountDisplay();
        syncSettingsUI();
        renderAlarms();
        bindEvents();
        
        const refreshWeatherBtn = $('refresh-weather');
        if (refreshWeatherBtn) refreshWeatherBtn.addEventListener('click', () => fetchWeather());

        const weatherRetryBtn = $('weather-retry-btn');
        if (weatherRetryBtn) weatherRetryBtn.addEventListener('click', () => fetchWeather());

        const searchCityBtn = $('search-city-btn');
        if (searchCityBtn) searchCityBtn.addEventListener('click', searchCity);
        
        const manualCityInput = $('manual-city-input');
        if (manualCityInput) {
            manualCityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchCity();
            });
        }

        // Try to fetch weather initially
        fetchWeather();

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

        // Register Service Worker for PWA + background notifications
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('MindfulWake: ServiceWorker registered', reg.scope);
                    // Re-schedule alarms once SW is active
                    if (Notification.permission === 'granted') {
                        // Wait for controller to be available
                        if (navigator.serviceWorker.controller) {
                            scheduleAllAlarmNotifications();
                        } else {
                            navigator.serviceWorker.addEventListener('controllerchange', () => {
                                scheduleAllAlarmNotifications();
                            });
                        }
                    }
                })
                .catch(err => console.error('MindfulWake: ServiceWorker failed', err));

            // Listen for messages from the Service Worker
            navigator.serviceWorker.addEventListener('message', (event) => {
                const { type, alarmId } = event.data || {};
                if (type === 'ALARM_TRIGGERED') {
                    // SW notification tapped — trigger alarm UI if not already active
                    if (!isRinging) {
                        const alarm = alarms.find(a => a.id === alarmId);
                        if (alarm) triggerAlarm(alarm);
                    }
                } else if (type === 'SNOOZE_ALARM') {
                    if (isRinging) snoozeAlarm();
                }
            });

            // Handle URL action params (from notification clicks when app was closed)
            const params = new URLSearchParams(window.location.search);
            const action = params.get('action');
            const id = params.get('id');
            if (action === 'wake' && id) {
                const alarm = alarms.find(a => a.id === id);
                if (alarm) setTimeout(() => triggerAlarm(alarm), 600);
            } else if (action === 'snooze' && id) {
                // Just show a toast — can't really snooze if app wasn't open
                setTimeout(() => showToast('Alarm snoozed from notification. 😴', 'info'), 600);
            }
            // Clean URL
            if (action) window.history.replaceState({}, '', window.location.pathname);
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