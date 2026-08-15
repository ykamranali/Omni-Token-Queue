import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, requireAuth } from '../middleware.js';

export function registerCounterRoutes(router) {
  router.get('/api/counters', requireAuth((req, res, params, ctx) => {
    const branchId = ctx.query.branchId;
    const rows = branchId
      ? ctx.db.prepare('SELECT * FROM counters WHERE branch_id = ? ORDER BY name').all(branchId)
      : ctx.db.prepare('SELECT * FROM counters ORDER BY name').all();
    sendJson(res, 200, rows);
  }));

  router.post('/api/counters', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!body.name || !body.branchId) return sendError(res, 400, 'name and branchId are required');
    const row = ctx.db.prepare(
      `INSERT INTO counters (branch_id, department_id, name, number) VALUES (?,?,?,?) RETURNING *`
    ).get(body.branchId, body.departmentId || null, body.name, body.number || null);
    sendJson(res, 201, row);
  }));

  router.put('/api/counters/:id', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const existing = ctx.db.prepare('SELECT * FROM counters WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Counter not found');
    ctx.db.prepare('UPDATE counters SET name=?, number=?, department_id=?, is_active=? WHERE id=?').run(
      body.name ?? existing.name,
      body.number ?? existing.number,
      body.departmentId ?? existing.department_id,
      body.isActive === undefined ? existing.is_active : (body.isActive ? 1 : 0),
      params.id
    );
    sendJson(res, 200, ctx.db.prepare('SELECT * FROM counters WHERE id = ?').get(params.id));
  }));

  router.delete('/api/counters/:id', requirePermission('admin.manage')((req, res, params, ctx) => {
    const existing = ctx.db.prepare('SELECT * FROM counters WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Counter not found');
    ctx.db.prepare('UPDATE counters SET is_active = 0 WHERE id = ?').run(params.id);
    sendJson(res, 200, { ok: true });
  }));

  // Services a counter is allowed to serve (used by the agent terminal to
  // decide which queue "call next" should pull from).
  router.get('/api/counters/:id/services', requireAuth((req, res, params, ctx) => {
    const rows = ctx.db.prepare(
      `SELECT s.* FROM service_counters sc JOIN services s ON s.id = sc.service_id WHERE sc.counter_id = ?`
    ).all(params.id);
    sendJson(res, 200, rows);
  }));

  router.post('/api/counters/:id/services', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!body.serviceId) return sendError(res, 400, 'serviceId is required');
    ctx.db.prepare('INSERT OR IGNORE INTO service_counters VALUES (?,?)').run(body.serviceId, params.id);
    sendJson(res, 201, { ok: true });
  }));

  router.delete('/api/counters/:id/services/:serviceId', requirePermission('admin.manage')((req, res, params, ctx) => {
    ctx.db.prepare('DELETE FROM service_counters WHERE counter_id = ? AND service_id = ?').run(params.id, params.serviceId);
    sendJson(res, 200, { ok: true });
  }));
}
