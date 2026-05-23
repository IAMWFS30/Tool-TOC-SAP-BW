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
            document.getElementById('connection-card').classList.add('hidden');
        } else {
            this.log('info', 'Configure SAP connection to get started.');
            document.getElementById('transport-card').classList.add('hidden');
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

    // ---- Test Connection ----
    async testConnection() {
        const host = document.getElementById('sap-host').value.trim();
        const port = document.getElementById('sap-port').value.trim();
        const client = document.getElementById('sap-client').value.trim();
        const user = document.getElementById('sap-user').value.trim();
        const pass = document.getElementById('sap-pass').value.trim();
        const target = document.getElementById('sap-target').value.trim() || 'MBQ';

        if (!host || !port || !user || !pass) {
            this.toast('error', 'Fill in all connection fields');
            return;
        }

        CONFIG.sap.host = host;
        CONFIG.sap.port = port;
        CONFIG.sap.client = client || '100';
        CONFIG.sap.user = user;
        CONFIG.sap.pass = pass;
        CONFIG.targetSystem = target;

        this.log('info', `Testing connection to ${host}:${port}...`);

        try {
            // Simple test: call service with no action (should return error but proves connectivity)
            const result = await this.sapCall({ action: 'TEST' });
            // Any response means connected
            this.connected = true;
            this.saveConnection();
            this.updateConnectionUI();
            document.getElementById('connection-card').classList.add('hidden');
            document.getElementById('transport-card').classList.remove('hidden');
            this.log('success', `✓ Connected to ${host}:${port} as ${user}`);
            this.toast('success', 'Connected & saved!');
        } catch (err) {
            if (err.message.includes('Authentication failed')) {
                this.log('error', `✗ Auth failed: wrong username/password`);
                this.toast('error', 'Authentication failed');
            } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                this.log('error', `✗ Cannot reach ${host}:${port}. Check network/VPN.`);
                this.toast('error', 'Cannot reach SAP server');
            } else {
                // Got a response (even error) = server is reachable
                this.connected = true;
                this.saveConnection();
                this.updateConnectionUI();
                document.getElementById('connection-card').classList.add('hidden');
                document.getElementById('transport-card').classList.remove('hidden');
                this.log('success', `✓ Connected to ${host}:${port} as ${user}`);
                this.toast('success', 'Connected & saved!');
            }
        }
    }

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
                if (CONFIG.whatsapp.enabled && CONFIG.whatsapp.apiToken) {
                    this.log('info', '[4/4] Sending WhatsApp...');
                    const waMsg = CONFIG.whatsapp.messageTemplate.replace('{TR}', result.trNumber);
                    try {
                        await this.sendWhatsApp(waMsg);
                        this.setStep(4, 'done');
                        this.log('success', '[4/4] ✓ WA sent to Basis');
                    } catch (waErr) {
                        this.setStep(4, 'warn');
                        this.log('warn', `[4/4] ⚠ WA failed: ${waErr.message}`);
                    }
                } else {
                    this.setStep(4, 'warn');
                    this.log('info', '[4/4] WA not configured. Skipped.');
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

    // ---- WhatsApp via Fonnte ----
    async sendWhatsApp(message) {
        const response = await fetch(CONFIG.whatsapp.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': CONFIG.whatsapp.apiToken,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                target: CONFIG.whatsapp.target,
                message: message,
                countryCode: '62'
            })
        });
        const data = await response.json();
        if (!data.status) throw new Error(data.reason || 'WA send failed');
        return data;
    }

    // ---- Steps UI ----
    resetSteps() { for (let i = 1; i <= 4; i++) document.querySelector(`#step-${i} .step-icon`).className = 'step-icon pending'; }
    setStep(n, state) { document.querySelector(`#step-${n} .step-icon`).className = `step-icon ${state}`; }

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
        document.getElementById('set-host').value = CONFIG.sap.host;
        document.getElementById('set-port').value = CONFIG.sap.port;
        document.getElementById('set-client').value = CONFIG.sap.client;
        document.getElementById('set-user').value = CONFIG.sap.user;
        document.getElementById('set-pass').value = CONFIG.sap.pass;
        document.getElementById('set-target').value = CONFIG.targetSystem;
        document.getElementById('set-wa-enabled').checked = CONFIG.whatsapp.enabled;
        document.getElementById('set-wa-token').value = CONFIG.whatsapp.apiToken;
        document.getElementById('set-wa-target').value = CONFIG.whatsapp.target;
        document.getElementById('set-wa-template').value = CONFIG.whatsapp.messageTemplate;
        document.getElementById('settings-modal').classList.remove('hidden');
    }
    closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
    saveSettings() {
        CONFIG.sap.host = document.getElementById('set-host').value;
        CONFIG.sap.port = document.getElementById('set-port').value;
        CONFIG.sap.client = document.getElementById('set-client').value;
        CONFIG.sap.user = document.getElementById('set-user').value;
        CONFIG.sap.pass = document.getElementById('set-pass').value;
        CONFIG.targetSystem = document.getElementById('set-target').value;
        CONFIG.whatsapp.enabled = document.getElementById('set-wa-enabled').checked;
        CONFIG.whatsapp.apiToken = document.getElementById('set-wa-token').value;
        CONFIG.whatsapp.target = document.getElementById('set-wa-target').value;
        CONFIG.whatsapp.messageTemplate = document.getElementById('set-wa-template').value;
        this.saveConnection();
        this.updateConnectionUI();
        this.closeSettings();
        this.toast('success', 'Settings saved');
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

        // Pre-fill connection form from config
        if (CONFIG.sap.host) document.getElementById('sap-host').value = CONFIG.sap.host;
        if (CONFIG.sap.port) document.getElementById('sap-port').value = CONFIG.sap.port;
        if (CONFIG.sap.client) document.getElementById('sap-client').value = CONFIG.sap.client;
        if (CONFIG.sap.user) document.getElementById('sap-user').value = CONFIG.sap.user;
        if (CONFIG.sap.pass) document.getElementById('sap-pass').value = CONFIG.sap.pass;
        if (CONFIG.targetSystem) document.getElementById('sap-target').value = CONFIG.targetSystem;
    }
}

const app = new TransportManager();
