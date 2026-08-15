import { sendError } from './router.js';

// Wraps a handler so it 401s unless a valid session cookie is present.
// The resolved session ({ userId, companyId }) is attached to ctx.session.
export function requireAuth(handler) {
  return (req, res, params, ctx) => {
    if (!ctx.session) return sendError(res, 401, 'Authentication required');
    return handler(req, res, params, ctx);
  };
}

// Wraps a handler so it 403s unless the logged-in user holds the given
// permission code (checked via user_roles -> role_permissions -> permissions).
export function requirePermission(code) {
  return handler => requireAuth((req, res, params, ctx) => {
    const row = ctx.db.prepare(
      `SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ? AND p.code = ?
       LIMIT 1`
    ).get(ctx.session.userId, code);
    if (!row) return sendError(res, 403, `Missing permission: ${code}`);
    return handler(req, res, params, ctx);
  });
}

export function getDefaultCompanyId(db) {
  const row = db.prepare('SELECT id FROM companies ORDER BY created_at LIMIT 1').get();
  return row ? row.id : null;
}
