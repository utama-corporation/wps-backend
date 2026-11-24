const { AsyncLocalStorage } = require("async_hooks");

/** Menyimpan actor + request_id per HTTP request (diisi verify-token). */
const auditStore = new AsyncLocalStorage();

module.exports = { auditStore };
