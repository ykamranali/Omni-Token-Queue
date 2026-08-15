import { sendJson, sendError } from '../router.js';
import { sseHandler } from '../sse.js';

export function registerDisplayRoutes(router) {
  // Public - the TV display and agent terminal poll/subscribe to this.
  router.get('/api/display/:branchId/now-serving', (req, res, params, ctx) => {
    const counters = ctx.db.prepare(
      `SELECT * FROM counters WHERE branch_id = ? AND is_active = 1 ORDER BY name`
    ).all(params.branchId);

    const nowServing = counters.map(counter => {
      const token = ctx.db.prepare(
        `SELECT t.*, s.name AS service_name, s.color AS service_color
         FROM tokens t JOIN services s ON s.id = t.service_id
         WHERE t.counter_id = ? AND t.status IN ('called','serving')
         ORDER BY t.called_at DESC LIMIT 1`
      ).get(counter.id);
      return { counter, token: token || null };
    });

    const waiting = ctx.db.prepare(
      `SELECT s.id AS service_id, s.name AS service_name, COUNT(*) AS waiting_count
       FROM tokens t JOIN services s ON s.id = t.service_id
       WHERE t.branch_id = ? AND t.status = 'waiting'
       GROUP BY s.id, s.name`
    ).all(params.branchId);

    const content = ctx.db.prepare(
      `SELECT * FROM display_content WHERE branch_id = ? AND is_enabled = 1 ORDER BY display_order`
    ).all(params.branchId);

    sendJson(res, 200, { nowServing, waiting, content });
  });

  router.get('/api/display/:branchId/stream', (req, res, params, ctx) => {
    sseHandler(req, res, params.branchId);
  });

  // Announcement templates (used to render/announce voice scripts client-side)
  router.get('/api/display/:branchId/announcements', (req, res, params, ctx) => {
    const rows = ctx.db.prepare(
      `SELECT * FROM announcement_templates WHERE branch_id = ? AND is_active = 1`
    ).all(params.branchId);
    sendJson(res, 200, rows);
  });
}
