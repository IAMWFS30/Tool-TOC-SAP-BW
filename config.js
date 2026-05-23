/**
 * Transport Manager Configuration
 * ================================
 * Pure frontend — direct call to SAP ICF service
 * No backend needed. Configure SAP connection in Settings.
 */

const CONFIG = {
    // SAP Connection (configurable via Settings UI)
    sap: {
        host: "dc1sdevbw.mitrakeluarga.com",
        port: "8051",
        client: "100",
        protocol: "http",
        user: "",
        pass: "",
        // ICF service path (Z-program)
        servicePath: "/sap/bc/z_transport_imp"
    },

    // Target system for Transport of Copies
    targetSystem: "MBQ",

    // TR Number format validation
    trFormat: {
        pattern: /^[A-Z]{3,4}K9\d{5,6}$/,
        example: "MBDK900123"
    },

    // WhatsApp Notification (Fonnte)
    whatsapp: {
        enabled: false,
        apiUrl: "https://api.fonnte.com/send",
        apiToken: "",
        target: "",
        messageTemplate: "Selamat pagi Tim Basis, minta tolong transport TR ke MBQ:\n{TR};1;W\nTerima kasih"
    },

    // UI Settings
    ui: {
        confirmBeforeExecute: true,
        autoClearOnSuccess: true,
        maxHistoryItems: 50
    }
};
