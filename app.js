/**
 * Transport Manager — Pure Frontend
 * Direct call to SAP ICF service (no backend needed)
 */

class TransportManager {
    constructor() {
        this.connected = false;
        this.history = this.loadHistory();
        this.init();
    }

    init() {
        this.loadSavedSettings();
        this.loadTheme();
        this.renderHistory();
        this.bindEvents();
        this.updateConnectionUI();

        if (CONFIG.sap.user && CONFIG.sap.host) {
            this.log('info', `SAP: ${CONFIG.sap.host}:${CONFIG.sap.port} (Client ${CONFIG.sap.client})`);
            this.log('info', `User: ${CONFIG.sap.user} | Target: ${CONFIG.targetSystem}`);
        } else {
            this.log('info', 'SAP not configured. Open Settings (⚙) to connect.');
        }
    }

    // ---- SAP Direct Call ----
    getSapUrl() {
        return `${CONFIG.sap.protocol}://${CONFIG.sap.host}:${CONFIG.sap.port}${CONFIG.sap.servicePath}?sap-client=${CONFIG.sap.client}`;
    }

    getAuthHeader() {
        return 'Basic ' + btoa(`${CONFIG.sap.user}:${CONFIG.sap.pass}`);
    }

    async sapCall(body) {
        const response = await fetch(this.getSapUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.getAuthHeader()
            },
            body: JSON.stringify(body)
        });

        if (!response.ok && response.status === 401) {
            throw new Error('Authentication failed. Check username/password.');
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Invalid response: ${text.substring(0, 200)}`);
        }
    }

    // ---- Test Connection (from Settings) ----

    updateConnectionUI() {
        const dot = document.querySelector('#conn-status .dot');
        const text = document.getElementById('conn-text');
        if (CONFIG.sap.user && CONFIG.sap.host) {
            dot.className = 'dot online';
            text.textContent = `${CONFIG.sap.host}:${CONFIG.sap.port}`;
        } else {
            dot.className = 'dot offline';
            text.textContent = 'Not connected';
        }
    }

    // ---- Form ----
    checkFormReady() {
        const tr = document.getElementById('tr-number').value.trim().toUpperCase();
        const desc = document.getElementById('tr-desc').value.trim();
        const valid = CONFIG.trFormat.pattern.test(tr) && desc.length > 0 && CONFIG.sap.user;
        document.getElementById('btn-execute').disabled = !valid;
    }

    // ---- Execute Full Flow ----
    async execute() {
        const trNumber = document.getElementById('tr-number').value.trim().toUpperCase();
        const desc = document.getElementById('tr-desc').value.trim();

        if (!trNumber || !desc) { this.toast('error', 'Fill TR number and description'); return; }

        if (CONFIG.ui.confirmBeforeExecute) {
            document.getElementById('confirm-details').innerHTML = `
                <div class="cd-row"><span class="cd-label">Source TR</span><span class="cd-value">${trNumber}</span></div>
                <div class="cd-row"><span class="cd-label">Description</span><span class="cd-value">${desc}</span></div>
                <div class="cd-row"><span class="cd-label">Target</span><span class="cd-value">${CONFIG.targetSystem}</span></div>
                <div class="cd-row"><span class="cd-label">User</span><span class="cd-value">${CONFIG.sap.user}</span></div>`;
            document.getElementById('confirm-modal').classList.remove('hidden');
            return;
        }
        await this.doExecute(trNumber, desc);
    }

    confirmExecute() {
        document.getElementById('confirm-modal').classList.add('hidden');
        const tr = document.getElementById('tr-number').value.trim().toUpperCase();
        const desc = document.getElementById('tr-desc').value.trim();
        this.doExecute(tr, desc);
    }

    cancelExecute() { document.getElementById('confirm-modal').classList.add('hidden'); }

    async doExecute(sourceTR, description) {
        const btn = document.getElementById('btn-execute');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Processing...</span>';
        this.resetSteps();

        this.log('info', '─'.repeat(50));
        this.log('info', `▶ Source: ${sourceTR} | Target: ${CONFIG.targetSystem}`);

        const startTime = Date.now();

        try {
            // Call SAP Z-program with FULL action (does all 3 steps internally)
            this.setStep(1, 'active');
            this.log('info', '[1/4] Creating ToC + Including objects + Releasing...');

            const result = await this.sapCall({
                action: 'FULL',
                sourceTR: sourceTR,
                description: description,
                targetSystem: CONFIG.targetSystem
            });

            if (result.success) {
                this.setStep(1, 'done');
                this.setStep(2, 'done');
                this.setStep(3, 'done');
                this.log('success', `[3/4] ✓ ${result.message}`);
                this.log('success', `     New TR: ${result.trNumber}`);

                // Step 4: WA notification
                this.setStep(4, 'active');
                if (CONFIG.whatsapp.enabled) {
                    this.log('info', '[4/4] Copying WA message to clipboard...');
                    const waMsg = CONFIG.whatsapp.messageTemplate.replace('{TR}', result.trNumber);
                    try {
                        await this.sendWhatsApp(waMsg);
                        this.setStep(4, 'done');
                        this.log('success', '[4/4] ✓ Message copied to clipboard');
                    } catch (waErr) {
                        this.setStep(4, 'warn');
                        this.log('warn', `[4/4] ⚠ Copy failed: ${waErr.message}`);
                    }
                } else {
                    this.setStep(4, 'warn');
                    this.log('info', '[4/4] WA notification disabled. Skipped.');
                }

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                this.log('success', '─'.repeat(50));
                this.log('success', `✓ Done! TR ${result.trNumber} released. (${elapsed}s)`);

                this.addHistory({ sourceTR, newTR: result.trNumber, description, status: 'success', timestamp: new Date().toISOString(), duration: elapsed });
                this.toast('success', `✓ ${result.trNumber} released!`);

                if (CONFIG.ui.autoClearOnSuccess) setTimeout(() => this.clearForm(), 3000);
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (err) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.log('error', `✗ ${err.message} (${elapsed}s)`);
            this.addHistory({ sourceTR, newTR: '-', description, status: 'failed', error: err.message, timestamp: new Date().toISOString(), duration: elapsed });
            this.toast('error', `✗ ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-bolt"></i> <span>Execute: Create → Release → Notify</span>';
            this.checkFormReady();
        }
    }

    // ---- Test Copy to Clipboard ----
    async testCopyClipboard() {
        const testMsg = CONFIG.whatsapp.messageTemplate.replace('{TR}', 'MBDK905999');
        const result = document.getElementById('clipboard-result');

        try {
            await navigator.clipboard.writeText(testMsg);
            result.textContent = '✓ Copied! Coba Ctrl+V di notepad/WA buat verify. Pesan: "' + testMsg.substring(0, 50) + '..."';
            result.style.color = 'var(--accent-green)';
            this.toast('success', '📋 Test: Message copied to clipboard!');
        } catch (err) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = testMsg;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            result.textContent = '✓ Copied (fallback)! Coba Ctrl+V buat verify.';
            result.style.color = 'var(--accent-green)';
            this.toast('success', '📋 Test: Message copied!');
        }
    }

    // ---- WhatsApp — Copy to Clipboard ----
    async sendWhatsApp(message) {
        try {
            await navigator.clipboard.writeText(message);
            this.toast('success', '📋 Message copied! Paste ke WA group Basis.');
            return { success: true };
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = message;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.toast('success', '📋 Message copied! Paste ke WA group Basis.');
            return { success: true };
        }
    }

    // ---- Steps UI ----
    resetSteps() { for (let i = 1; i <= 4; i++) document.querySelector(`#step-${i} .step-icon`).className = 'step-icon pending'; }
    setStep(n, state) { document.querySelector(`#step-${n} .step-icon`).className = `step-icon ${state}`; }

    // ---- Server Preset Selection ----
    onServerSelectSettings() {
        const sel = document.getElementById('set-server-select').value;
        if (sel && CONFIG.servers[sel]) {
            const s = CONFIG.servers[sel];
            CONFIG.sap.host = s.host;
            CONFIG.sap.port = s.port;
            CONFIG.sap.client = s.client;
            CONFIG.targetSystem = s.target;
            CONFIG.whatsapp.messageTemplate = s.waTemplate;
            document.getElementById('set-wa-template').value = s.waTemplate;
        }
    }

    async testConnectionFromSettings() {
        CONFIG.sap.user = document.getElementById('set-user').value;
        CONFIG.sap.pass = document.getElementById('set-pass').value;

        if (!CONFIG.sap.host || !CONFIG.sap.user || !CONFIG.sap.pass) {
            this.toast('error', 'Select server and fill username/password');
            return;
        }

        this.log('info', `Testing connection to ${CONFIG.sap.host}:${CONFIG.sap.port}...`);

        try {
            const result = await this.sapCall({ action: 'TEST' });
            // If we get a JSON response, auth is valid
            this.connected = true;
            this.saveConnection();
            this.updateConnectionUI();
            this.log('success', `✓ Connected as ${CONFIG.sap.user}`);
            this.toast('success', 'Connected & saved!');
        } catch (err) {
            if (err.message.includes('Authentication failed') || err.message.includes('401')) {
                this.connected = false;
                this.log('error', `✗ Wrong username or password`);
                this.toast('error', 'Wrong username or password');
            } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                this.connected = false;
                this.log('error', `✗ Cannot reach ${CONFIG.sap.host}:${CONFIG.sap.port}`);
                this.toast('error', 'Cannot reach SAP server');
            } else {
                this.connected = false;
                this.log('error', `✗ ${err.message}`);
                this.toast('error', err.message);
            }
        }
    }

    // ---- Password Visibility Toggle ----
    togglePasswordVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        const icon = btn.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    // ---- Theme ----
    toggleTheme() {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('toc_theme', newTheme);
        document.querySelector('#theme-toggle i').className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    loadTheme() {
        const saved = localStorage.getItem('toc_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        const icon = document.querySelector('#theme-toggle i');
        if (icon) icon.className = saved === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // ---- Logging ----
    log(level, msg) {
        const c = document.getElementById('log-container');
        const empty = c.querySelector('.log-empty'); if (empty) empty.remove();
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const el = document.createElement('div');
        el.className = 'log-entry';
        el.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg ${level}">${msg}</span>`;
        c.appendChild(el);
        c.scrollTop = c.scrollHeight;
    }
    clearLog() { document.getElementById('log-container').innerHTML = '<div class="log-empty"><i class="fas fa-terminal"></i><p>Log cleared.</p></div>'; }

    // ---- History ----
    loadHistory() { try { return JSON.parse(localStorage.getItem('toc_history') || '[]'); } catch { return []; } }
    saveHistory() { localStorage.setItem('toc_history', JSON.stringify(this.history)); }
    addHistory(e) { this.history.unshift(e); if (this.history.length > CONFIG.ui.maxHistoryItems) this.history = this.history.slice(0, CONFIG.ui.maxHistoryItems); this.saveHistory(); this.renderHistory(); }
    renderHistory() {
        const list = document.getElementById('history-list');
        if (!this.history.length) { list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:32px;">No history.</p>'; return; }
        list.innerHTML = this.history.map(h => {
            const d = new Date(h.timestamp).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
            return `<div class="history-item"><div class="h-tr">${h.newTR||'-'}</div><div class="h-type">Source: ${h.sourceTR} — ${h.description||''}</div><div class="h-time">${d} (${h.duration}s)</div><span class="h-status ${h.status}"><i class="fas ${h.status==='success'?'fa-check':'fa-xmark'}"></i> ${h.status==='success'?'Done':'Failed'}</span>${h.error?`<div class="h-type" style="color:var(--accent-red);margin-top:4px;">${h.error}</div>`:''}</div>`;
        }).join('');
    }
    toggleHistory() { document.getElementById('history-panel').classList.toggle('hidden'); }

    // ---- Form ----
    clearForm() {
        document.getElementById('tr-number').value = '';
        document.getElementById('tr-desc').value = '';
        document.getElementById('btn-execute').disabled = true;
        this.resetSteps();
    }

    // ---- Settings ----
    openSettings() {
        document.getElementById('set-user').value = CONFIG.sap.user;
        document.getElementById('set-pass').value = CONFIG.sap.pass;
        document.getElementById('set-wa-enabled').checked = CONFIG.whatsapp.enabled;
        document.getElementById('set-wa-template').value = CONFIG.whatsapp.messageTemplate;
        document.getElementById('settings-modal').classList.remove('hidden');
    }
    closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
    saveSettings() {
        CONFIG.sap.user = document.getElementById('set-user').value;
        CONFIG.sap.pass = document.getElementById('set-pass').value;
        CONFIG.whatsapp.enabled = document.getElementById('set-wa-enabled').checked;
        CONFIG.whatsapp.messageTemplate = document.getElementById('set-wa-template').value;
        this.saveConnection();
        this.updateConnectionUI();
        this.closeSettings();
        this.toast('success', 'Settings saved');
        this.checkFormReady();
    }

    saveConnection() {
        localStorage.setItem('toc_sap', JSON.stringify({ sap: CONFIG.sap, targetSystem: CONFIG.targetSystem, whatsapp: CONFIG.whatsapp }));
    }

    loadSavedSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('toc_sap'));
            if (saved) {
                Object.assign(CONFIG.sap, saved.sap || {});
                CONFIG.targetSystem = saved.targetSystem || CONFIG.targetSystem;
                Object.assign(CONFIG.whatsapp, saved.whatsapp || {});
            }
        } catch {}
    }

    // ---- Toast ----
    toast(type, msg) {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
        t.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
        c.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
    }

    // ---- Events ----
    bindEvents() {
        document.getElementById('tr-number').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); this.checkFormReady(); });
        document.getElementById('tr-desc').addEventListener('input', () => this.checkFormReady());
    }
}

const app = new TransportManager();
