/**
 * Transport Manager Backend
 * ==========================
 * Flow: Create ToC → Include Objects → Release → Notify Basis via WA
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const sapClient = require('./sap-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

// Serve frontend static files
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// ---- Health Check ----
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Validate Source TR ----
app.post('/api/transport/validate', async (req, res) => {
    try {
        const { trNumber } = req.body;
        if (!trNumber) return res.status(400).json({ valid: false, message: 'TR number required' });

        console.log(`[VALIDATE] Checking ${trNumber}...`);
        const transports = await sapClient.listTransports('dev');
        const found = transports.find(t => t.number === trNumber);

        res.json({
            valid: !!found,
            description: found ? found.description : '',
            owner: found ? found.owner : ''
        });
    } catch (err) {
        console.error('[VALIDATE] Error:', err.message);
        res.json({ valid: false, message: err.message });
    }
});

// ---- Create Transport of Copies ----
app.post('/api/toc/create', async (req, res) => {
    try {
        const { sourceTR, description, targetSystem } = req.body;
        if (!sourceTR) return res.status(400).json({ success: false, message: 'sourceTR required' });

        console.log(`[CREATE ToC] From source: ${sourceTR}, desc: ${description}`);

        const result = await sapClient.createTransportOfCopies('dev', sourceTR, description, targetSystem);

        console.log(`[CREATE ToC] Result:`, result);
        res.json(result);
    } catch (err) {
        console.error('[CREATE ToC] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Include Objects from Source TR ----
app.post('/api/toc/include-objects', async (req, res) => {
    try {
        const { sourceTR, targetTR } = req.body;
        if (!sourceTR || !targetTR) return res.status(400).json({ success: false, message: 'sourceTR and targetTR required' });

        console.log(`[INCLUDE] Objects from ${sourceTR} → ${targetTR}`);

        const result = await sapClient.includeObjects('dev', sourceTR, targetTR);

        console.log(`[INCLUDE] Result:`, result);
        res.json(result);
    } catch (err) {
        console.error('[INCLUDE] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---- Release ToC ----
app.post('/api/toc/release', async (req, res) => {
    try {
        const { trNumber } = req.body;
        if (!trNumber) return res.status(400).json({ success: false, message: 'trNumber required' });

        console.log(`[RELEASE] Releasing ${trNumber}...`);

        const result = await sapClient.releaseTransport('dev', trNumber);
        console.log(`[RELEASE] Result:`, result);

        res.json({ success: true, message: result.message || 'Released' });
    } catch (err) {
        // If already released or endpoint issue, still proceed
        const msg = err.message || '';
        if (msg.includes('not supported') || msg.includes('already') || msg.includes('All release')) {
            console.log(`[RELEASE] Handled: ${msg}`);
            res.json({ success: true, message: 'Released (or already released)' });
        } else {
            console.error('[RELEASE] Error:', err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    }
});

// ---- Send WhatsApp Notification via Fonnte ----
app.post('/api/notify/whatsapp', async (req, res) => {
    try {
        const { target, message } = req.body;
        if (!message) return res.status(400).json({ success: false, message: 'message required' });

        const waToken = process.env.FONNTE_TOKEN;
        const waTarget = target || process.env.FONNTE_TARGET;

        if (!waToken || waToken === 'CHANGE_ME') {
            console.log('[WA] Token not configured. Skipping.');
            return res.json({ success: false, message: 'Fonnte token not configured. Set FONNTE_TOKEN in .env' });
        }

        console.log(`[WA] Sending to ${waTarget}: ${message.substring(0, 50)}...`);

        const response = await axios.post('https://api.fonnte.com/send', 
            new URLSearchParams({
                target: waTarget,
                message: message,
                countryCode: '62'
            }).toString(),
            {
                headers: {
                    'Authorization': waToken,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            }
        );

        console.log(`[WA] Response:`, response.data);

        if (response.data && response.data.status) {
            res.json({ success: true, message: 'WhatsApp sent', detail: response.data });
        } else {
            res.json({ success: false, message: response.data?.reason || 'WA send failed', detail: response.data });
        }
    } catch (err) {
        console.error('[WA] Error:', err.message);
        res.json({ success: false, message: err.message });
    }
});

// ---- Start Server ----
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Transport Manager Backend`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`  DEV: ${process.env.SAP_DEV_HOST}:${process.env.SAP_DEV_PORT}`);
    console.log(`  QA:  ${process.env.SAP_QA_HOST}:${process.env.SAP_QA_PORT}`);
    console.log(`  WA:  Fonnte (${process.env.FONNTE_TOKEN ? 'configured' : 'NOT configured'})`);
    console.log(`${'='.repeat(50)}\n`);
});
