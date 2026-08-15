import { sendJson } from '../router.js';
import { getDefaultCompanyId } from '../middleware.js';

export function registerMetaRoutes(router) {
  // Public - used by the kiosk/display/login screens to know what
  // organization and branches this installation serves.
  router.get('/api/meta', (req, res, params, ctx) => {
    const companyId = getDefaultCompanyId(ctx.db);
    const company = companyId
      ? ctx.db.prepare('SELECT id, name, industry_type, default_language_code, default_currency_code FROM companies WHERE id = ?').get(companyId)
      : null;
    const branches = companyId
      ? ctx.db.prepare('SELECT id, name, code FROM branches WHERE company_id = ? AND is_active = 1 ORDER BY name').all(companyId)
      : [];
    sendJson(res, 200, { company, branches });
  });
}
