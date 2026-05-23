/**
 * Transport Manager Configuration
 * ================================
 * Pure frontend — direct call to SAP ICF service
 * No backend needed. Configure SAP connection in Settings.
 */

const CONFIG = {
    // Server presets
    servers: {
        bw: { name: "SAP BW (MBD)", host: "dc1sdevbw.mitrakeluarga.com", port: "8051", client: "100", target: "MBQ" },
        ecc: { name: "SAP ECC (MED)", host: "dc1sdevecc.mitrakeluarga.com", port: "8001", client: "100", target: "MEQ" }
    },

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
