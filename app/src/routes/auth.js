import { sendJson, sendError, readJsonBody } from '../router.js';
import { hashPassword, verifyPassword, createSession, destroySession } from '../auth.js';
import { getDefaultCompanyId } from '../middleware.js';

export function registerAuthRoutes(router) {
  router.post('/api/auth/login', async (req, res, params, ctx) => {
    let body;
    try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const { email, password } = body;
    if (!email || !password) return sendError(res, 400, 'email and password are required');

    const user = ctx.db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const roles = ctx.db.prepare(
      `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
    ).all(user.id);

    const token = createSession(user.id, user.company_id);
    res.setHeader('Set-Cookie', `otq_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
    ctx.db.prepare('UPDATE users SET last_login_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?').run(user.id);

    sendJson(res, 200, {
      user: { id: user.id, fullName: user.full_name, email: user.email, branchId: user.branch_id },
      roles,
    });
  });

  router.post('/api/auth/logout', (req, res, params, ctx) => {
    const cookie = ctx.rawCookies['otq_session'];
    destroySession(cookie);
    res.setHeader('Set-Cookie', 'otq_session=; HttpOnly; Path=/; Max-Age=0');
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', (req, res, params, ctx) => {
    if (!ctx.session) return sendError(res, 401, 'Not logged in');
    const user = ctx.db.prepare('SELECT id, full_name, email, branch_id FROM users WHERE id = ?').get(ctx.session.userId);
    if (!user) return sendError(res, 401, 'Not logged in');
    const roles = ctx.db.prepare(
      `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`
    ).all(user.id);
    const permissions = ctx.db.prepare(
      `SELECT DISTINCT p.code FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ?`
    ).all(user.id).map(r => r.code);
    sendJson(res, 200, {
      user: { id: user.id, fullName: user.full_name, email: user.email, branchId: user.branch_id },
      roles,
      permissions,
    });
  });
}
