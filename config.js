/**
 * Transport Manager Configuration
 * ================================
 * Self-service: Create ToC → Release → Notify Basis via WA
 */

const CONFIG = {
    // Source system (where TR lives)
    sourceSystem: {
        id: "MBD",
        name: "SAP BW DEV",
        client: "100"
    },

    // Target system for import
    targetSystem: {
        id: "MBQ",
        name: "SAP BW QA",
        client: "200"
    },

    // TR Number format validation
    trFormat: {
        pattern: /^[A-Z]{3,4}K9\d{5,6}$/,
        example: "MBDK900123",
        placeholder: "e.g., MBDK900123"
    },

    // WhatsApp Notification (Fonnte)
    whatsapp: {
        // Fonnte API endpoint
        apiUrl: "https://api.fonnte.com/send",
        // API token from Fonnte dashboard
        apiToken: "CHANGE_ME",
        // Target: group ID or phone number
        // For group: use group ID from Fonnte dashboard
        // For personal: use phone number with country code (6282151127343)
        target: "GROUP_ID_HERE",
        // Phone number registered in Fonnte
        senderNumber: "6282151127343",
        // Message template — {TR} will be replaced with actual TR number
        messageTemplate: "Selamat pagi Tim Basis, minta tolong transport TR ke MBQ:\n{TR};1;W\nTerima kasih"
    },

    // API Configuration
    api: {
        baseUrl: "http://localhost:3000/api",
        timeout: 60000,
        mockMode: false
    },

    // UI Settings
    ui: {
        confirmBeforeExecute: true,
        autoClearOnSuccess: true,
        maxHistoryItems: 50
    }
};
