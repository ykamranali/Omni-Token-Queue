import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, requireAuth, getDefaultCompanyId } from '../middleware.js';

export function registerDepartmentRoutes(router) {
  router.get('/api/departments', requireAuth((req, res, params, ctx) => {
    const branchId = ctx.query.branchId;
    const companyId = getDefaultCompanyId(ctx.db);
    const rows = branchId
      ? ctx.db.prepare('SELECT * FROM departments WHERE company_id = ? AND branch_id = ? ORDER BY name').all(companyId, branchId)
      : ctx.db.prepare('SELECT * FROM departments WHERE company_id = ? ORDER BY name').all(companyId);
    sendJson(res, 200, rows);
  }));

  router.post('/api/departments', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!body.name || !body.branchId) return sendError(res, 400, 'name and branchId are required');
    const companyId = getDefaultCompanyId(ctx.db);
    const row = ctx.db.prepare(
      `INSERT INTO departments (company_id, branch_id, name, description) VALUES (?,?,?,?) RETURNING *`
    ).get(companyId, body.branchId, body.name, body.description || '');
    sendJson(res, 201, row);
  }));

  router.put('/api/departments/:id', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const existing = ctx.db.prepare('SELECT * FROM departments WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Department not found');
    ctx.db.prepare('UPDATE departments SET name=?, description=?, is_active=? WHERE id=?').run(
      body.name ?? existing.name,
      body.description ?? existing.description,
      body.isActive === undefined ? existing.is_active : (body.isActive ? 1 : 0),
      params.id
    );
    sendJson(res, 200, ctx.db.prepare('SELECT * FROM departments WHERE id = ?').get(params.id));
  }));

  router.delete('/api/departments/:id', requirePermission('admin.manage')((req, res, params, ctx) => {
    const existing = ctx.db.prepare('SELECT * FROM departments WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Department not found');
    ctx.db.prepare('UPDATE departments SET is_active = 0 WHERE id = ?').run(params.id);
    sendJson(res, 200, { ok: true });
  }));
}
