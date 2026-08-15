import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, getDefaultCompanyId } from '../middleware.js';

export function registerBranchRoutes(router) {
  router.get('/api/branches', requirePermission('admin.manage')((req, res, params, ctx) => {
    const companyId = getDefaultCompanyId(ctx.db);
    const rows = ctx.db.prepare('SELECT * FROM branches WHERE company_id = ? ORDER BY name').all(companyId);
    sendJson(res, 200, rows);
  }));

  router.post('/api/branches', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!body.name) return sendError(res, 400, 'name is required');
    const companyId = getDefaultCompanyId(ctx.db);
    const row = ctx.db.prepare(
      `INSERT INTO branches (company_id, name, code, address, timezone) VALUES (?,?,?,?,?) RETURNING *`
    ).get(companyId, body.name, body.code || null, body.address || '', body.timezone || null);
    sendJson(res, 201, row);
  }));

  router.put('/api/branches/:id', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const existing = ctx.db.prepare('SELECT * FROM branches WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Branch not found');
    ctx.db.prepare(
      `UPDATE branches SET name=?, code=?, address=?, timezone=?, is_active=? WHERE id=?`
    ).run(
      body.name ?? existing.name,
      body.code ?? existing.code,
      body.address ?? existing.address,
      body.timezone ?? existing.timezone,
      body.isActive === undefined ? existing.is_active : (body.isActive ? 1 : 0),
      params.id
    );
    sendJson(res, 200, ctx.db.prepare('SELECT * FROM branches WHERE id = ?').get(params.id));
  }));

  router.delete('/api/branches/:id', requirePermission('admin.manage')((req, res, params, ctx) => {
    const existing = ctx.db.prepare('SELECT * FROM branches WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Branch not found');
    ctx.db.prepare('UPDATE branches SET is_active = 0 WHERE id = ?').run(params.id);
    sendJson(res, 200, { ok: true });
  }));
}
