const service = require('./mst-user-so-service');

function fail(res, error, ctx) {
  const statusCode = error.statusCode || 500;
  console.error(`Error ${ctx} MstUserSO:`, error);
  return res.status(statusCode).json({ success: false, message: statusCode === 500 ? 'Internal Server Error' : error.message, ...(statusCode === 500 ? { error: error.message } : {}) });
}

async function list(req, res) { try { const data = await service.listUsers(); return res.json({ success: true, message: 'Data user SO berhasil diambil', totalData: data.length, data }); } catch (e) { return fail(res, e, 'listing'); } }
async function getEmployees(req, res) { try { const data = await service.searchEmployees(req.query.db, req.query.q); return res.json({ success: true, message: 'Data karyawan berhasil diambil', totalData: data.length, data }); } catch (e) { return fail(res, e, 'searching employees'); } }
async function create(req, res) { try { const data = await service.create(req.body); return res.status(201).json({ success: true, message: 'User SO baru berhasil disimpan', data }); } catch (e) { return fail(res, e, 'creating'); } }
async function update(req, res) { try { const data = await service.update(req.body); return res.json({ success: true, message: 'User SO berhasil diubah', data }); } catch (e) { return fail(res, e, 'updating'); } }
async function remove(req, res) { try { await service.remove(req.query.idUsername); return res.json({ success: true, message: 'User SO berhasil dihapus' }); } catch (e) { return fail(res, e, 'deleting'); } }

module.exports = { list, getEmployees, create, update, remove };
