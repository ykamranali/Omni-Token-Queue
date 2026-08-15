import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, getDefaultCompanyId } from '../middleware.js';

export function registerServiceRoutes(router) {
  // Public - the kiosk needs the service list for a branch to build its menu.
  router.get('/api/services', (req, res, params, ctx) => {
    const { branchId } = ctx.query;
    const companyId = getDefaultCompanyId(ctx.db);
    let rows;
    if (branchId) {
      rows = ctx.db.prepare(
        `SELECT s.* FROM services s
         JOIN service_branches sb ON sb.service_id = s.id
         WHERE sb.branch_id = ? AND s.company_id = ? AND s.is_enabled = 1
         ORDER BY s.priority, s.name`
      ).all(branchId, companyId);
    } else {
      rows = ctx.db.prepare('SELECT * FROM services WHERE company_id = ? ORDER BY priority, name').all(companyId);
    }
    sendJson(res, 200, rows);
  });

  router.get('/api/services/:id', (req, res, params, ctx) => {
    const row = ctx.db.prepare('SELECT * FROM services WHERE id = ?').get(params.id);
    if (!row) return sendError(res, 404, 'Service not found');
    const branches = ctx.db.prepare(
      `SELECT b.id, b.name FROM service_branches sb JOIN branches b ON b.id = sb.branch_id WHERE sb.service_id = ?`
    ).all(params.id);
    const counters = ctx.db.prepare(
      `SELECT c.id, c.name FROM service_counters sc JOIN counters c ON c.id = sc.counter_id WHERE sc.service_id = ?`
    ).all(params.id);
    sendJson(res, 200, { ...row, branches, counters });
  });

  router.post('/api/services', requirePermission('services.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!body.name) return sendError(res, 400, 'name is required');
    const companyId = getDefaultCompanyId(ctx.db);
    const row = ctx.db.prepare(
      `INSERT INTO services (company_id, name, description, icon, color, estimated_duration_minutes, priority, is_enabled, online_booking_enabled)
       VALUES (?,?,?,?,?,?,?,?,?) RETURNING *`
    ).get(
      companyId, body.name, body.description || '', body.icon || null, body.color || '#3b82f6',
      body.estimatedDurationMinutes || 10, body.priority || 0,
      body.isEnabled === false ? 0 : 1, body.onlineBookingEnabled ? 1 : 0
    );
    if (Array.isArray(body.branchIds)) {
      for (const bId of body.branchIds) {
        ctx.db.prepare('INSERT OR IGNORE INTO service_branches VALUES (?,?)').run(row.id, bId);
      }
    }
    if (Array.isArray(body.counterIds)) {
      for (const cId of body.counterIds) {
        ctx.db.prepare('INSERT OR IGNORE INTO service_counters VALUES (?,?)').run(row.id, cId);
      }
    }
    sendJson(res, 201, row);
  }));

  router.put('/api/services/:id', requirePermission('services.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const existing = ctx.db.prepare('SELECT * FROM services WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Service not found');
    ctx.db.prepare(
      `UPDATE services SET name=?, description=?, icon=?, color=?, estimated_duration_minutes=?, priority=?, is_enabled=?, online_booking_enabled=? WHERE id=?`
    ).run(
      body.name ?? existing.name,
      body.description ?? existing.description,
      body.icon ?? existing.icon,
      body.color ?? existing.color,
      body.estimatedDurationMinutes ?? existing.estimated_duration_minutes,
      body.priority ?? existing.priority,
      body.isEnabled === undefined ? existing.is_enabled : (body.isEnabled ? 1 : 0),
      body.onlineBookingEnabled === undefined ? existing.online_booking_enabled : (body.onlineBookingEnabled ? 1 : 0),
      params.id
    );
    sendJson(res, 200, ctx.db.prepare('SELECT * FROM services WHERE id = ?').get(params.id));
  }));

  router.delete('/api/services/:id', requirePermission('services.manage')((req, res, params, ctx) => {
    const existing = ctx.db.prepare('SELECT * FROM services WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Service not found');
    ctx.db.prepare('UPDATE services SET is_enabled = 0 WHERE id = ?').run(params.id);
    sendJson(res, 200, { ok: true });
  }));
}
