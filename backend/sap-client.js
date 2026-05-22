/**
 * SAP ADT Client — Transport of Copies Flow
 * ============================================
 * Functions: listTransports, createTransportOfCopies, includeObjects, releaseTransport
 */

const axios = require('axios');

const SYSTEMS = {
    dev: {
        host: process.env.SAP_DEV_HOST,
        port: process.env.SAP_DEV_PORT,
        user: process.env.SAP_DEV_USER,
        pass: process.env.SAP_DEV_PASS,
        client: process.env.SAP_DEV_CLIENT,
        protocol: process.env.SAP_DEV_PROTOCOL || 'http'
    },
    qa: {
        host: process.env.SAP_QA_HOST,
        port: process.env.SAP_QA_PORT,
        user: process.env.SAP_QA_USER,
        pass: process.env.SAP_QA_PASS,
        client: process.env.SAP_QA_CLIENT,
        protocol: process.env.SAP_QA_PROTOCOL || 'http'
    }
};

function getBaseUrl(systemKey) {
    const sys = SYSTEMS[systemKey];
    return `${sys.protocol}://${sys.host}:${sys.port}`;
}

function getAuth(systemKey) {
    const sys = SYSTEMS[systemKey];
    return Buffer.from(`${sys.user}:${sys.pass}`).toString('base64');
}

/**
 * Get CSRF token
 */
async function getCsrfToken(systemKey) {
    const sys = SYSTEMS[systemKey];
    const baseURL = getBaseUrl(systemKey);
    const auth = getAuth(systemKey);

    const response = await axios.get(`${baseURL}/sap/bc/adt/discovery`, {
        headers: {
            'sap-client': sys.client,
            'X-CSRF-Token': 'Fetch',
            'Authorization': `Basic ${auth}`
        },
        timeout: 15000,
        validateStatus: (s) => s < 500
    });

    return {
        token: response.headers['x-csrf-token'],
        cookies: response.headers['set-cookie']
    };
}

/**
 * List open transports
 */
async function listTransports(systemKey, user) {
    const sys = SYSTEMS[systemKey];
    const baseURL = getBaseUrl(systemKey);
    const auth = getAuth(systemKey);

    const response = await axios.get(`${baseURL}/sap/bc/adt/cts/transportrequests`, {
        params: { user: user || sys.user },
        headers: {
            'sap-client': sys.client,
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/atom+xml'
        },
        timeout: 15000,
        validateStatus: (s) => s < 500
    });

    // Simple parse
    const transports = [];
    const data = response.data || '';
    const entries = data.match(/<tm:request[^>]*>/g) || [];
    for (const entry of entries) {
        const num = entry.match(/tm:number="([^"]+)"/);
        const desc = entry.match(/tm:desc="([^"]+)"/);
        const owner = entry.match(/tm:owner="([^"]+)"/);
        if (num) transports.push({ number: num[1], description: desc ? desc[1] : '', owner: owner ? owner[1] : '' });
    }
    return transports;
}

/**
 * Create Transport of Copies via Z-program ICF service
 */
async function createTransportOfCopies(systemKey, sourceTR, description, targetSystem) {
    const sys = SYSTEMS[systemKey];
    const baseURL = getBaseUrl(systemKey);
    const auth = getAuth(systemKey);

    const response = await axios.post(
        `${baseURL}/sap/bc/z_transport_imp?sap-client=${sys.client}`,
        JSON.stringify({
            action: 'CREATE',
            description: description,
            targetSystem: targetSystem || 'MBQ'
        }),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`,
                'sap-client': sys.client
            },
            timeout: 30000,
            validateStatus: () => true
        }
    );

    console.log(`[SAP] Create ToC response: HTTP ${response.status}`, response.data);

    if (response.status === 200) {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        return data;
    } else {
        const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return { success: false, message: `HTTP ${response.status}: ${body.substring(0, 200)}` };
    }
}

/**
 * Include objects from source TR into target TR via Z-program
 */
async function includeObjects(systemKey, sourceTR, targetTR) {
    const sys = SYSTEMS[systemKey];
    const baseURL = getBaseUrl(systemKey);
    const auth = getAuth(systemKey);

    const response = await axios.post(
        `${baseURL}/sap/bc/z_transport_imp?sap-client=${sys.client}`,
        JSON.stringify({
            action: 'COPY',
            sourceTR: sourceTR,
            targetTR: targetTR
        }),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`,
                'sap-client': sys.client
            },
            timeout: 30000,
            validateStatus: () => true
        }
    );

    console.log(`[SAP] Copy objects response: HTTP ${response.status}`, response.data);

    if (response.status === 200) {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        return { ...data, objectCount: data.objectCount || 0 };
    } else {
        const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return { success: false, message: `HTTP ${response.status}: ${body.substring(0, 200)}` };
    }
}

/**
 * Release transport via Z-program
 */
async function releaseTransport(systemKey, trNumber) {
    const sys = SYSTEMS[systemKey];
    const baseURL = getBaseUrl(systemKey);
    const auth = getAuth(systemKey);

    const response = await axios.post(
        `${baseURL}/sap/bc/z_transport_imp?sap-client=${sys.client}`,
        JSON.stringify({
            action: 'RELEASE',
            trNumber: trNumber
        }),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`,
                'sap-client': sys.client
            },
            timeout: 60000,
            validateStatus: () => true
        }
    );

    console.log(`[SAP] Release response: HTTP ${response.status}`, response.data);

    if (response.status === 200) {
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        return data;
    } else {
        const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        throw new Error(`HTTP ${response.status}: ${body.substring(0, 200)}`);
    }
}

module.exports = {
    listTransports,
    createTransportOfCopies,
    includeObjects,
    releaseTransport
};

// ---- Helper ----
function extractTRNumber(data, headers) {
    const str = typeof data === 'string' ? data : JSON.stringify(data || '');
    // Try XML attribute
    let match = str.match(/tm:number="([A-Z]{3,4}K9\d{5,6})"/);
    if (match) return match[1];
    // Try any TR pattern in body
    match = str.match(/([A-Z]{3,4}K9\d{5,6})/);
    if (match) return match[1];
    // Try Location header
    if (headers && headers['location']) {
        match = headers['location'].match(/([A-Z]{3,4}K9\d{5,6})/);
        if (match) return match[1];
    }
    return null;
}
