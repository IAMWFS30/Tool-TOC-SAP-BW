/**
 * Transport Manager — Create ToC → Release → Notify Basis via WA
 */

class TransportManager {
    constructor() {
        this.history = this.loadHistory();
        this.init();
    }

    init() {
        this.loadSavedSettings();
        this.loadTheme();
        this.renderHistory();
        this.bindEvents();
        this.log('info', 'Transport Manager initialized.');
        this.log('info', `Flow: Create ToC → Include Objects → Release → WA Notify`);
        this.log('info', `Source: ${CONFIG.sourceSystem.id} | Target: ${CONFIG.targetSystem.id}`);
    }

    loadTheme() {
        const saved = localStorage.getItem('toc_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        const icon = document.querySelector('#theme-toggle i');
        if (icon) icon.className = saved === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // ---- Form Validation ----
    checkFormReady() {
        const trNumber = document.getElementById('tr-number').value.trim().toUpperCase();
        const desc = document.getElementById('tr-desc').value.trim();
        const isValid = CONFIG.trFormat.pattern.test(trNumber) && desc.length > 0;
        document.getElementById('btn-execute').disabled = !isValid;
    }

    // ---- Validate TR ----
    async validateTR() {
        const trNumber = document.getElementById('tr-number').value.trim().toUpperCase();
        const hint = document.getElementById('tr-hint');

        if (!CONFIG.trFormat.pattern.test(trNumber)) {
            hint.textContent = `Invalid format. Expected: ${CONFIG.trFormat.example}`;
            hint.className = 'form-hint error';
            return;
        }

        hint.textContent = 'Validating...';
        this.log('info', `Validating source TR: ${trNumber}...`);

        try {
            const response = await this.apiCall('/transport/validate', { trNumber });
            if (response.valid) {
                hint.textContent = `✓ Valid — ${response.description || 'Found'}`;
                hint.className = 'form-hint success';
                this.log('success', `Source TR ${trNumber} valid: ${response.description}`);
            } else {
                hint.textContent = `✗ Not found or not released`;
                hint.className = 'form-hint error';
                this.log('error', `TR ${trNumber} not found`);
            }
        } catch (err) {
            hint.textContent = `⚠ Cannot validate (API offline). Proceeding anyway.`;
            hint.className = 'form-hint';
            this.log('warn', `Validation skipped: ${err.message}`);
        }
        this.checkFormReady();
    }

    // ---- Execute Full Flow ----
    async execute() {
        const trNumber = document.getElementById('tr-number').value.trim().toUpperCase();
        const desc = document.getElementById('tr-desc').value.trim();

        if (!trNumber || !desc) {
            this.toast('error', 'Fill in TR number and description');
            return;
        }

        if (CONFIG.ui.confirmBeforeExecute) {
            this.showConfirmModal(trNumber, desc);
            return;
        }

        await this.doExecute(trNumber, desc);
    }

    showConfirmModal(trNumber, desc) {
        document.getElementById('confirm-details').innerHTML = `
            <div class="cd-row"><span class="cd-label">Source TR</span><span class="cd-value">${trNumber}</span></div>
            <div class="cd-row"><span class="cd-label">Description</span><span class="cd-value">${desc}</span></div>
            <div class="cd-row"><span class="cd-label">Target</span><span class="cd-value">${CONFIG.targetSystem.id} (${CONFIG.targetSystem.name})</span></div>
            <div class="cd-row"><span class="cd-label">WA Notify</span><span class="cd-value">Yes — Basis Group</span></div>
        `;
        document.getElementById('confirm-modal').classList.remove('hidden');
    }

    async confirmExecute() {
        document.getElementById('confirm-modal').classList.add('hidden');
        const trNumber = document.getElementById('tr-number').value.trim().toUpperCase();
        const desc = document.getElementById('tr-desc').value.trim();
        await this.doExecute(trNumber, desc);
    }

    cancelExecute() {
        document.getElementById('confirm-modal').classList.add('hidden');
    }

    async doExecute(sourceTR, description) {
        const btn = document.getElementById('btn-execute');
        btn.disabled = true;
        btn.classList.add('loading');
        btn.innerHTML = '<i class="fas fa-spinner"></i> <span>Processing...</span>';

        this.resetSteps();
        this.log('info', '─'.repeat(50));
        this.log('info', `▶ Starting flow for source TR: ${sourceTR}`);

        const startTime = Date.now();
        let newTR = null;

        try {
            // Step 1: Create Transport of Copies
            this.setStep(1, 'active');
            this.log('info', `[1/4] Creating Transport of Copies...`);
            btn.innerHTML = '<i class="fas fa-spinner"></i> <span>Creating ToC...</span>';

            const createResult = await this.apiCall('/toc/create', {
                sourceTR,
                description,
                targetSystem: CONFIG.targetSystem.id
            });

            if (!createResult.success) throw new Error(createResult.message || 'Create ToC failed');
            newTR = createResult.trNumber;
            this.setStep(1, 'done');
            this.log('success', `[1/4] ✓ ToC created: ${newTR}`);

            // Step 2: Include objects from source TR
            this.setStep(2, 'active');
            this.log('info', `[2/4] Including objects from ${sourceTR}...`);
            btn.innerHTML = '<i class="fas fa-spinner"></i> <span>Including objects...</span>';

            const includeResult = await this.apiCall('/toc/include-objects', {
                sourceTR,
                targetTR: newTR
            });

            if (!includeResult.success) throw new Error(includeResult.message || 'Include objects failed');
            this.setStep(2, 'done');
            this.log('success', `[2/4] ✓ Objects included (${includeResult.objectCount || '?'} objects)`);

            // Step 3: Release ToC
            this.setStep(3, 'active');
            this.log('info', `[3/4] Releasing ${newTR}...`);
            btn.innerHTML = '<i class="fas fa-spinner"></i> <span>Releasing...</span>';

            const releaseResult = await this.apiCall('/toc/release', { trNumber: newTR });

            if (!releaseResult.success) throw new Error(releaseResult.message || 'Release failed');
            this.setStep(3, 'done');
            this.log('success', `[3/4] ✓ Released: ${newTR}`);

            // Step 4: Send WA notification
            this.setStep(4, 'active');
            this.log('info', `[4/4] Sending WhatsApp notification to Basis...`);
            btn.innerHTML = '<i class="fas fa-spinner"></i> <span>Sending WA...</span>';

            const waMessage = CONFIG.whatsapp.messageTemplate.replace('{TR}', newTR);
            const waResult = await this.apiCall('/notify/whatsapp', {
                target: CONFIG.whatsapp.target,
                message: waMessage
            });

            if (!waResult.success) {
                this.log('warn', `[4/4] ⚠ WA send issue: ${waResult.message}. TR still released.`);
                this.setStep(4, 'warn');
            } else {
                this.setStep(4, 'done');
                this.log('success', `[4/4] ✓ WA sent to Basis group`);
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.log('success', `─`.repeat(50));
            this.log('success', `✓ Complete! ToC ${newTR} released & Basis notified. (${elapsed}s)`);

            this.addHistory({
                sourceTR,
                newTR,
                description,
                status: 'success',
                timestamp: new Date().toISOString(),
                duration: elapsed
            });

            this.toast('success', `✓ ${newTR} released & Basis notified via WA`);

            if (CONFIG.ui.autoClearOnSuccess) {
                setTimeout(() => this.clearForm(), 3000);
            }

        } catch (err) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.log('error', `✗ Failed: ${err.message} (${elapsed}s)`);
            this.log('error', `─`.repeat(50));

            this.addHistory({
                sourceTR,
                newTR: newTR || '-',
                description,
                status: 'failed',
                error: err.message,
                timestamp: new Date().toISOString(),
                duration: elapsed
            });

            this.toast('error', `✗ ${err.message}`);
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-bolt"></i> <span>Execute: Create → Release → Notify</span>';
            btn.disabled = false;
            this.checkFormReady();
        }
    }

    // ---- Step UI ----
    resetSteps() {
        for (let i = 1; i <= 4; i++) {
            const el = document.querySelector(`#step-${i} .step-icon`);
            el.className = 'step-icon pending';
        }
    }

    setStep(num, state) {
        const el = document.querySelector(`#step-${num} .step-icon`);
        el.className = `step-icon ${state}`;
    }

    // ---- API Call ----
    async apiCall(endpoint, data) {
        if (CONFIG.api.mockMode) return this.mockApiCall(endpoint, data);

        const url = CONFIG.api.baseUrl + endpoint;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(CONFIG.api.timeout)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // ---- Mock API ----
    async mockApiCall(endpoint, data) {
        const delay = (ms) => new Promise(r => setTimeout(r, ms));

        switch (endpoint) {
            case '/transport/validate':
                await delay(600);
                return { valid: true, description: '[MOCK] Test transport' };

            case '/toc/create':
                await delay(1500);
                const mockTR = 'MBDK9' + String(Math.floor(Math.random() * 90000 + 10000));
                return { success: true, trNumber: mockTR, message: 'ToC created' };

            case '/toc/include-objects':
                await delay(1000);
                return { success: true, objectCount: Math.floor(Math.random() * 8 + 1) };

            case '/toc/release':
                await delay(1500);
                return { success: true, message: 'Released' };

            case '/notify/whatsapp':
                await delay(800);
                return { success: true, message: 'WA sent' };

            default:
                throw new Error(`Unknown: ${endpoint}`);
        }
    }

    // ---- Logging ----
    log(level, message) {
        const container = document.getElementById('log-container');
        const empty = container.querySelector('.log-empty');
        if (empty) empty.remove();

        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg ${level}">${message}</span>`;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }

    clearLog() {
        document.getElementById('log-container').innerHTML = `
            <div class="log-empty"><i class="fas fa-terminal"></i><p>Log cleared.</p></div>`;
    }

    // ---- History ----
    loadHistory() {
        try { return JSON.parse(localStorage.getItem('toc_history') || '[]'); } catch { return []; }
    }

    saveHistory() { localStorage.setItem('toc_history', JSON.stringify(this.history)); }

    addHistory(entry) {
        this.history.unshift(entry);
        if (this.history.length > CONFIG.ui.maxHistoryItems) this.history = this.history.slice(0, CONFIG.ui.maxHistoryItems);
        this.saveHistory();
        this.renderHistory();
    }

    renderHistory() {
        const list = document.getElementById('history-list');
        if (!this.history.length) {
            list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:32px;">No history yet.</p>';
            return;
        }
        list.innerHTML = this.history.map(h => {
            const date = new Date(h.timestamp).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
            return `<div class="history-item">
                <div class="h-tr">${h.newTR || '-'}</div>
                <div class="h-type">Source: ${h.sourceTR} — ${h.description || ''}</div>
                <div class="h-time">${date} (${h.duration}s)</div>
                <span class="h-status ${h.status}"><i class="fas ${h.status === 'success' ? 'fa-check' : 'fa-xmark'}"></i> ${h.status === 'success' ? 'Done' : 'Failed'}</span>
                ${h.error ? `<div class="h-type" style="color:var(--accent-red);margin-top:4px;">${h.error}</div>` : ''}
            </div>`;
        }).join('');
    }

    toggleHistory() { document.getElementById('history-panel').classList.toggle('hidden'); }

    // ---- Form ----
    clearForm() {
        document.getElementById('tr-number').value = '';
        document.getElementById('tr-desc').value = '';
        document.getElementById('tr-hint').textContent = `Format: ${CONFIG.trFormat.example} — TR yang object-nya mau di-copy`;
        document.getElementById('tr-hint').className = 'form-hint';
        document.getElementById('btn-execute').disabled = true;
        this.resetSteps();
    }

    // ---- Settings ----
    openSettings() {
        document.getElementById('set-wa-token').value = CONFIG.whatsapp.apiToken;
        document.getElementById('set-wa-target').value = CONFIG.whatsapp.target;
        document.getElementById('set-wa-template').value = CONFIG.whatsapp.messageTemplate;
        document.getElementById('set-api-url').value = CONFIG.api.baseUrl;
        document.getElementById('settings-modal').classList.remove('hidden');
    }

    closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

    saveSettings() {
        CONFIG.whatsapp.apiToken = document.getElementById('set-wa-token').value;
        CONFIG.whatsapp.target = document.getElementById('set-wa-target').value;
        CONFIG.whatsapp.messageTemplate = document.getElementById('set-wa-template').value;
        CONFIG.api.baseUrl = document.getElementById('set-api-url').value;

        localStorage.setItem('toc_settings', JSON.stringify({
            whatsapp: CONFIG.whatsapp,
            api: CONFIG.api
        }));

        this.closeSettings();
        this.toast('success', 'Settings saved');
    }

    loadSavedSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('toc_settings'));
            if (saved) {
                Object.assign(CONFIG.whatsapp, saved.whatsapp || {});
                Object.assign(CONFIG.api, saved.api || {});
            }
        } catch {}
    }

    // ---- Toast ----
    toast(type, message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
        toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
    }

    // ---- Theme Toggle ----
    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const newTheme = current === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('toc_theme', newTheme);

        const icon = document.querySelector('#theme-toggle i');
        icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // ---- Events ----
    bindEvents() {
        const trInput = document.getElementById('tr-number');
        const descInput = document.getElementById('tr-desc');

        trInput.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); this.checkFormReady(); });
        descInput.addEventListener('input', () => this.checkFormReady());
        trInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.validateTR(); });
    }
}

const app = new TransportManager();
