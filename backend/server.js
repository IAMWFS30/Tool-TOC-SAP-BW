/**
 * Transport Manager — Minimal CORS Proxy
 * ========================================
 * Proxies requests from frontend to SAP ICF service.
 * Needed because browsers block cross-origin requests to SAP.
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '..')));

// ---- SAP Proxy ----
app.post('/api/sap-proxy', async (req, res) => {
    const { _sap, ...body } = req.body;

    if (!_sap || !_sap.host || !_sap.user) {
        return res.status(400).json({ success: false, message: 'SAP connection not configured' });
    }

    const sapUrl = `${_sap.protocol}://${_sap.host}:${_sap.port}${_sap.servicePath}?sap-client=${_sap.client}`;
    const auth = Buffer.from(`${_sap.user}:${_sap.pass}`).toString('base64');

    try {
        const response = await axios.post(sapUrl, JSON.stringify(body), {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            timeout: 60000,
            validateStatus: () => true
        });

        // Forward SAP response as-is
        const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        try {
            res.json(JSON.parse(data));
        } catch {
            res.json({ success: false, message: data.substring(0, 300) });
        }
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
            res.json({ success: false, message: `Cannot reach SAP server: ${_sap.host}:${_sap.port}` });
        } else {
            res.json({ success: false, message: err.message });
        }
    }
});

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Transport Manager Proxy`);
    console.log(`  http://localhost:${PORT}\n`);
});
