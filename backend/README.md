# Transport Manager Backend

Backend proxy untuk SAP BW Transport Manager. Handle release & import transport via SAP ADT REST API.

## Quick Start

```bash
cd dashboard/transport-manager/backend

# 1. Install dependencies
npm install

# 2. Configure SAP credentials
# Edit .env file — isi host, user, password SAP DEV & QA
notepad .env

# 3. Start server
npm start

# Atau dengan auto-reload (development)
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + system info |
| POST | `/api/transport/validate` | Validate TR exists in DEV |
| POST | `/api/transport/release` | Release TR in DEV |
| POST | `/api/transport/import` | Import TR to QA (MBQ) |
| GET | `/api/transports?system=dev` | List open transports |

## Request Examples

### Validate
```json
POST /api/transport/validate
{ "trNumber": "MBDK900123" }
```

### Release & Import
```json
POST /api/transport/release
{ "trNumber": "MBDK900123", "type": "WORKBENCH", "system": "MBD" }

POST /api/transport/import
{ "trNumber": "MBDK900123", "targetSystem": "MBQ", "targetClient": "200" }
```

## SAP Prerequisites

1. **ADT Services enabled** di kedua system (DEV & QA)
   - Transaction: `SICF` → activate `/sap/bc/adt/`
   
2. **User authorization** — user di .env butuh:
   - `S_CTS_ADMI` — Transport administration
   - `S_TRANSPRT` — Transport operations
   - `S_RFC` — RFC access (jika cross-system)

3. **TMS Route** (recommended):
   - Setup auto-import di `STMS` → Transport Routes
   - Kalau auto-import aktif, cukup release di DEV → otomatis import di QA
   - Kalau tidak, backend akan coba trigger import via ADT API

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `CSRF token failed` | Session expired | Restart server |
| `403 Forbidden` | Missing auth | Check S_CTS_ADMI authorization |
| `404 Not Found` | ADT not active | Activate /sap/bc/adt/ in SICF |
| `Release failed: locked` | Object locked | Release lock in SE09/SE10 |
| `Import failed: 405` | No import endpoint | Setup TMS auto-import instead |

## Architecture

```
Frontend (index.html)
    ↓ HTTP POST
Backend (server.js:3000)
    ↓ HTTPS + Basic Auth
SAP ADT API (/sap/bc/adt/cts/transportrequests)
    ↓
TMS → Import to QA
```
