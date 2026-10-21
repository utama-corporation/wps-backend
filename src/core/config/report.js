// Report microservice (open-api-report, default port 5006) — sama dengan
// MstSettingAPI.ApiReportURL aplikasi desktop.
const REPORT_BASE = (process.env.REPORT_MICROSERVICE_URL || `http://${process.env.DB_SERVER}:5006`).replace(/\/+$/, "");

module.exports = { REPORT_BASE };
