import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, getDefaultCompanyId } from '../middleware.js';
import { hashPassword } from '../auth.js';

export function registerUserRoutes(router) {
  router.get('/api/users', requirePermission('admin.manage')((req, res, params, ctx) => {
    const companyId = getDefaultCompanyId(ctx.db);
    const rows = ctx.db.prepare(
      `SELECT id, full_name, email, branch_id, is_active, last_login_at FROM users WHERE company_id = ? ORDER BY full_name`
    ).all(companyId);
    const withRoles = rows.map(u => ({
      ...u,
      roles: ctx.db.prepare(
        `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
      ).all(u.id),
    }));
    sendJson(res, 200, withRoles);
  }));

  router.post('/api/users', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!body.fullName || !body.email || !body.password) {
      return sendError(res, 400, 'fullName, email and password are required');
    }
    const companyId = getDefaultCompanyId(ctx.db);
    let user;
    try {
      user = ctx.db.prepare(
        `INSERT INTO users (company_id, branch_id, full_name, email, password_hash) VALUES (?,?,?,?,?) RETURNING id, full_name, email, branch_id`
      ).get(companyId, body.branchId || null, body.fullName, body.email, hashPassword(body.password));
    } catch (e) {
      return sendError(res, 409, 'A user with that email already exists');
    }
    if (body.roleId) {
      ctx.db.prepare('INSERT INTO user_roles (user_id, role_id, branch_id) VALUES (?,?,?)')
        .run(user.id, body.roleId, body.branchId || null);
    }
    sendJson(res, 201, user);
  }));

  router.put('/api/users/:id', requirePermission('admin.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const existing = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'User not found');
    ctx.db.prepare('UPDATE users SET full_name=?, is_active=? WHERE id=?').run(
      body.fullName ?? existing.full_name,
      body.isActive === undefined ? existing.is_active : (body.isActive ? 1 : 0),
      params.id
    );
    if (body.password) {
      ctx.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), params.id);
    }
    sendJson(res, 200, ctx.db.prepare('SELECT id, full_name, email, branch_id, is_active FROM users WHERE id = ?').get(params.id));
  }));

  router.get('/api/roles', requirePermission('admin.manage')((req, res, params, ctx) => {
    const companyId = getDefaultCompanyId(ctx.db);
    const roles = ctx.db.prepare('SELECT * FROM roles WHERE company_id = ? ORDER BY name').all(companyId);
    const withPerms = roles.map(r => ({
      ...r,
      permissions: ctx.db.prepare(
        `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?`
      ).all(r.id).map(p => p.code),
    }));
    sendJson(res, 200, withPerms);
  }));

  router.get('/api/permissions', requirePermission('admin.manage')((req, res, params, ctx) => {
    sendJson(res, 200, ctx.db.prepare('SELECT * FROM permissions ORDER BY module, action').all());
  }));
}
