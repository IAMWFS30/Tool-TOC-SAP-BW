/**
 * WhatsApp Client — whatsapp-web.js
 * ===================================
 * Maintains WA session, sends messages to groups.
 * First run: scan QR code. After that, session auto-restores.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let waClient = null;
let waReady = false;
let waQR = null;
let waInfo = null;

/**
 * Initialize WhatsApp client
 */
function initWA() {
    waClient = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wa-session' }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    waClient.on('qr', (qr) => {
        waQR = qr;
        console.log('\n[WA] ========================================');
        console.log('[WA] Scan QR code below with WhatsApp:');
        console.log('[WA] ========================================');
        qrcode.generate(qr, { small: true });
        console.log('[WA] Or open http://localhost:3000/wa/qr in browser');
        console.log('[WA] ========================================\n');
    });

    waClient.on('ready', () => {
        waReady = true;
        waQR = null;
        waInfo = waClient.info;
        console.log(`[WA] ✓ Connected as ${waInfo.pushname} (${waInfo.wid.user})`);
    });

    waClient.on('authenticated', () => {
        console.log('[WA] ✓ Authenticated (session restored)');
    });

    waClient.on('auth_failure', (msg) => {
        waReady = false;
        console.log('[WA] ✗ Auth failed:', msg);
    });

    waClient.on('disconnected', (reason) => {
        waReady = false;
        console.log('[WA] Disconnected:', reason);
        // Try to reconnect
        setTimeout(() => {
            console.log('[WA] Attempting reconnect...');
            waClient.initialize();
        }, 5000);
    });

    waClient.initialize();
    console.log('[WA] Initializing... (wait for QR or auto-restore)');
}

/**
 * Send message to a group
 * @param {string} groupName - Group name to search for
 * @param {string} message - Message text
 */
async function sendToGroup(groupName, message) {
    if (!waReady || !waClient) {
        throw new Error('WhatsApp not connected. Scan QR first.');
    }

    // Find group by name
    const chats = await waClient.getChats();
    const group = chats.find(c => c.isGroup && c.name.toLowerCase().includes(groupName.toLowerCase()));

    if (!group) {
        throw new Error(`Group "${groupName}" not found. Available groups: ${chats.filter(c => c.isGroup).map(c => c.name).slice(0, 10).join(', ')}`);
    }

    await group.sendMessage(message);
    return { success: true, groupName: group.name, groupId: group.id._serialized };
}

/**
 * Send message to a specific chat ID (group or personal)
 * @param {string} chatId - Chat ID (e.g., "6281234567890@c.us" or "123456789@g.us")
 * @param {string} message - Message text
 */
async function sendToChat(chatId, message) {
    if (!waReady || !waClient) {
        throw new Error('WhatsApp not connected. Scan QR first.');
    }

    await waClient.sendMessage(chatId, message);
    return { success: true, chatId };
}

/**
 * Get list of groups
 */
async function getGroups() {
    if (!waReady || !waClient) {
        throw new Error('WhatsApp not connected.');
    }

    const chats = await waClient.getChats();
    return chats
        .filter(c => c.isGroup)
        .map(c => ({ name: c.name, id: c.id._serialized }));
}

/**
 * Get status
 */
function getStatus() {
    return {
        ready: waReady,
        qrPending: !!waQR,
        qr: waQR,
        user: waInfo ? { name: waInfo.pushname, number: waInfo.wid.user } : null
    };
}

module.exports = {
    initWA,
    sendToGroup,
    sendToChat,
    getGroups,
    getStatus
};
