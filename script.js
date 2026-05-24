class PomodoroTimer {
    constructor() {
        this.settings = this.loadSettings();
        this.history = this.loadHistory();
        
        this.currentMode = 'work';
        this.timeLeft = this.settings.workDuration * 60;
        this.totalTime = this.settings.workDuration * 60;
        this.sessionCount = 1;
        this.isRunning = false;
        this.timerInterval = null;
        
        this.initDOM();
        this.updateModeUI();
        this.updateDisplay();
        this.renderHistory();
        this.updateTodayCount();
    }

    initDOM() {
        this.minutesEl = document.getElementById('minutes');
        this.secondsEl = document.getElementById('seconds');
        this.modeLabelEl = document.getElementById('mode-label');
        this.modeBadgeEl = document.getElementById('mode-badge');
        this.progressRingEl = document.getElementById('progress-ring');
        this.progressBarFillEl = document.getElementById('progress-bar-fill');
        this.sessionCountEl = document.getElementById('session-count');
        this.todayCountEl = document.getElementById('today-count');
        this.historyListEl = document.getElementById('history-list');
        
        this.startBtn = document.getElementById('start-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.saveSettingsBtn = document.getElementById('save-settings');
        
        this.workDurationInput = document.getElementById('work-duration');
        this.breakDurationInput = document.getElementById('break-duration');
        
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

        this.workDurationInput.value = this.settings.workDuration;
        this.breakDurationInput.value = this.settings.breakDuration;
        
        this.audioContext = null;
    }

    loadSettings() {
        const defaultSettings = {
            workDuration: 25,
            breakDuration: 5
        };
        
        try {
            const saved = localStorage.getItem('pomodoro-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch {
            return defaultSettings;
        }
    }

    saveSettings() {
        this.settings = {
            workDuration: parseInt(this.workDurationInput.value) || 25,
            breakDuration: parseInt(this.breakDurationInput.value) || 5
        };
        
        localStorage.setItem('pomodoro-settings', JSON.stringify(this.settings));
        
        if (!this.isRunning) {
            this.reset();
        }
        
        alert('设置已保存');
    }

    onStateChange(callback) {
        if (!this._stateListeners) this._stateListeners = [];
        this._stateListeners.push(callback);
        return () => {
            this._stateListeners = this._stateListeners.filter(fn => fn !== callback);
        };
    }

    _notifyStateChange() {
        if (!this._stateListeners) return;
        const state = {
            isRunning: this.isRunning,
            currentMode: this.currentMode,
            timeLeft: this.timeLeft,
            totalTime: this.totalTime,
            sessionCount: this.sessionCount
        };
        this._stateListeners.forEach(fn => fn(state));
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('pomodoro-history');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    saveHistory(type) {
        const record = {
            id: Date.now(),
            type: type,
            timestamp: new Date().toISOString(),
            duration: type === 'work' ? this.settings.workDuration : this.settings.breakDuration
        };
        
        this.history.unshift(record);
        
        if (this.history.length > 100) {
            this.history = this.history.slice(0, 100);
        }
        
        localStorage.setItem('pomodoro-history', JSON.stringify(this.history));
        this.renderHistory();
        this.updateTodayCount();
    }

    updateTodayCount() {
        const today = new Date().toDateString();
        const todayRecords = this.history.filter(record => 
            new Date(record.timestamp).toDateString() === today && record.type === 'work'
        );
        this.todayCountEl.textContent = `今日完成: ${todayRecords.length}`;
    }

    renderHistory() {
        if (this.history.length === 0) {
            this.historyListEl.innerHTML = '<p class="empty-history">暂无记录</p>';
            return;
        }
        
        const grouped = this.groupByDate(this.history);
        let html = '';
        
        for (const [date, records] of grouped) {
            html += `<div class="history-date">${this.formatDate(date)}</div>`;
            records.forEach(record => {
                const time = this.formatTime(record.timestamp);
                const typeText = record.type === 'work' ? '工作完成' : '休息完成';
                html += `
                    <div class="history-item">
                        <div class="type">
                            <span class="${record.type}"></span>
                            <span>${typeText}</span>
                        </div>
                        <span>${time}</span>
                    </div>
                `;
            });
        }
        
        this.historyListEl.innerHTML = html;
    }

    groupByDate(records) {
        const groups = new Map();
        records.forEach(record => {
            const date = new Date(record.timestamp).toDateString();
            if (!groups.has(date)) {
                groups.set(date, []);
            }
            groups.get(date).push(record);
        });
        return groups;
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return '今天';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return '昨天';
        } else {
            return `${date.getMonth() + 1}月${date.getDate()}日`;
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.startBtn.style.display = 'none';
        this.pauseBtn.style.display = 'flex';
        
        this.timerInterval = setInterval(() => {
            this.timeLeft--;

            if (this.timeLeft <= 0) {
                this.completeSession();
                return;
            }

            this.updateDisplay();
            this._notifyStateChange();
        }, 1000);
    }

    pause() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        this.startBtn.style.display = 'flex';
        this.pauseBtn.style.display = 'none';
        
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this._notifyStateChange();
    }

    reset() {
        this.pause();
        
        this.currentMode = 'work';
        this.timeLeft = this.settings.workDuration * 60;
        this.totalTime = this.settings.workDuration * 60;
        this.sessionCount = 1;
        
        this.updateDisplay();
        this.updateModeUI();
        this._notifyStateChange();
    }

    completeSession() {
        this.pause();
        
        this.playSound(this.currentMode);

        this.saveHistory(this.currentMode);
        
        if (this.currentMode === 'work') {
            this.switchToBreak();
        } else {
            this.switchToWork();
        }
    }

    switchToBreak() {
        this.currentMode = 'break';
        this.timeLeft = this.settings.breakDuration * 60;
        this.totalTime = this.settings.breakDuration * 60;

        this.updateModeUI();
        this.updateDisplay();
        this._notifyStateChange();
    }

    switchToWork() {
        this.currentMode = 'work';
        this.sessionCount++;
        this.timeLeft = this.settings.workDuration * 60;
        this.totalTime = this.settings.workDuration * 60;

        this.updateModeUI();
        this.updateDisplay();
        this._notifyStateChange();
    }

    updateModeUI() {
        const isWork = this.currentMode === 'work';
        
        this.modeLabelEl.textContent = isWork ? '工作时间' : '休息时间';
        this.modeBadgeEl.className = `mode-badge ${this.currentMode}`;
        this.progressRingEl.setAttribute('class', `progress-ring-progress ${this.currentMode}`);
        this.progressBarFillEl.className = `progress-bar-fill ${this.currentMode}`;
        
        document.body.className = `${this.currentMode}-mode`;
        
        this.sessionCountEl.textContent = `第 ${this.sessionCount} 个番茄钟`;
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        
        this.minutesEl.textContent = this.padZero(minutes);
        this.secondsEl.textContent = this.padZero(seconds);
        
        this.updateProgress();
    }

    padZero(num) {
        return num.toString().padStart(2, '0');
    }

    updateProgress() {
        const progress = (this.totalTime - this.timeLeft) / this.totalTime;
        const circumference = 2 * Math.PI * 45;
        const offset = circumference * (1 - progress);
        
        this.progressRingEl.style.strokeDasharray = `${circumference} ${circumference}`;
        this.progressRingEl.style.strokeDashoffset = `${offset}`;
        
        this.progressBarFillEl.style.width = `${progress * 100}%`;
    }

    playSound(type) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        if (type === 'work') {
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(1200, this.audioContext.currentTime + 0.2);
        } else {
            oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime);
            oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.15);
            oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.3);
        }
        
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }
}

class PipOverlay {
    constructor(timer) {
        this.timer = timer;
        this.pipWindow = null;
        this._pipUnsubscribe = null;
    }

    async open() {
        if (!('documentPictureInPicture' in window)) {
            alert('此功能需要 Chrome 116 或更新版本。\n请在 Chrome 地址栏输入 chrome://settings/help 检查更新。');
            return;
        }

        if (this.pipWindow) {
            this.pipWindow.close();
            this._cleanup();
            return;
        }

        const mode = this.timer.currentMode;
        const isWork = mode === 'work';
        const bg = isWork
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #22c55e, #16a34a)';

        try {
            this.pipWindow = await documentPictureInPicture.requestWindow({
                width: 160,
                height: 140
            });

            const pw = this.pipWindow;
            const minutes = String(Math.floor(this.timer.timeLeft / 60)).padStart(2, '0');
            const seconds = String(this.timer.timeLeft % 60).padStart(2, '0');

            pw.document.body.style.cssText = `margin:0;padding:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${bg};overflow:hidden;`;

            pw.document.body.innerHTML = `
                <div id="pip-ball" style="
                    width:100%;height:100%;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;
                    cursor:pointer;user-select:none;
                ">
                    <span id="pip-time" style="
                        color:#fff;font-weight:700;font-size:36px;
                        text-shadow:0 2px 8px rgba(0,0,0,0.2);font-family:'Inter',sans-serif;
                        font-variant-numeric:tabular-nums;line-height:1;
                    ">${minutes}:${seconds}</span>
                    <span id="pip-mode-label" style="margin-top:6px;font-size:12px;
                        color:rgba(255,255,255,0.7);font-family:'Inter',sans-serif;">
                        ${isWork ? '工作时间' : '休息时间'}
                    </span>
                </div>
            `;

            pw.document.getElementById('pip-ball').addEventListener('click', () => {
                if (this.timer.isRunning) this.timer.pause();
                else this.timer.start();
            });

            this._pipUnsubscribe = this.timer.onStateChange((state) => {
                this._update(state);
            });

            pw.addEventListener('pagehide', () => {
                this._cleanup();
            });

        } catch (err) {
            console.error('[悬浮窗] 弹出失败:', err);
        }
    }

    _update(state) {
        if (!this.pipWindow) return;
        try {
            const timeEl = this.pipWindow.document.getElementById('pip-time');
            if (!timeEl) return;

            const minutes = String(Math.floor(state.timeLeft / 60)).padStart(2, '0');
            const seconds = String(state.timeLeft % 60).padStart(2, '0');
            timeEl.textContent = minutes + ':' + seconds;

            const isWork = state.currentMode === 'work';
            const bg = isWork
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #22c55e, #16a34a)';
            this.pipWindow.document.body.style.background = bg;

            const labelEl = this.pipWindow.document.getElementById('pip-mode-label');
            if (labelEl) labelEl.textContent = isWork ? '工作时间' : '休息时间';
        } catch {
            this._cleanup();
        }
    }

    _cleanup() {
        if (this._pipUnsubscribe) {
            this._pipUnsubscribe();
            this._pipUnsubscribe = null;
        }
        if (this.pipWindow) {
            try { this.pipWindow.close(); } catch {}
            this.pipWindow = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const timer = new PomodoroTimer();
    window.__pomodoroTimer = timer;

    const pip = new PipOverlay(timer);
    const pipBtn = document.getElementById('pip-btn');
    if (pipBtn) {
        pipBtn.addEventListener('click', () => pip.open());
    }
});