/**
 * Transport Manager Configuration
 * ================================
 * Pure frontend — direct call to SAP ICF service
 * No backend needed. Configure SAP connection in Settings.
 */

const CONFIG = {
    // Server presets
    servers: {
        bw: { name: "SAP BW (MBD)", host: "dc1sdevbw.mitrakeluarga.com", port: "8051", client: "100", target: "MBQ", waTemplate: "Selamat pagi Tim Basis, minta tolong TOC ke MBQ:\n{TR};1;W\nTerima kasih" },
        ecc: { name: "SAP ECC (MED)", host: "dc1sdeverp.mitrakeluarga.com", port: "8021", client: "101", target: "MEQ", waTemplate: "Selamat pagi Tim Basis, minta tolong TOC ke MEQ:\n{TR};1;W\nTerima kasih" }
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

    // WhatsApp Notification (via whatsapp-web.js backend)
    whatsapp: {
        enabled: true,
        // Group name (partial match) — backend will find the group
        groupName: "Basis",
        // Or use exact group ID (get from /api/wa/groups)
        groupId: "",
        messageTemplate: "Selamat pagi Tim Basis, minta tolong TOC ke MBQ:\n{TR};1;W\nTerima kasih"
    },

    // UI Settings
    ui: {
        confirmBeforeExecute: true,
        autoClearOnSuccess: true,
        maxHistoryItems: 50
    }
};
