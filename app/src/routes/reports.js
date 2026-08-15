import { sendJson, sendError } from '../router.js';
import { requirePermission } from '../middleware.js';

export function registerReportRoutes(router) {
  router.get('/api/reports/summary', requirePermission('reports.view')((req, res, params, ctx) => {
    const { branchId } = ctx.query;
    if (!branchId) return sendError(res, 400, 'branchId is required');
    const date = ctx.query.date || new Date().toISOString().slice(0, 10);

    const totals = ctx.db.prepare(
      `SELECT status, COUNT(*) AS c FROM tokens WHERE branch_id = ? AND date(issued_at) = date(?) GROUP BY status`
    ).all(branchId, date);

    const avgWait = ctx.db.prepare(
      `SELECT AVG((julianday(called_at) - julianday(issued_at)) * 24 * 60) AS avg_minutes
       FROM tokens WHERE branch_id = ? AND date(issued_at) = date(?) AND called_at IS NOT NULL`
    ).get(branchId, date);

    const avgService = ctx.db.prepare(
      `SELECT AVG((julianday(completed_at) - julianday(served_at)) * 24 * 60) AS avg_minutes
       FROM tokens WHERE branch_id = ? AND date(issued_at) = date(?) AND served_at IS NOT NULL AND completed_at IS NOT NULL`
    ).get(branchId, date);

    const byService = ctx.db.prepare(
      `SELECT s.name AS service_name, t.status, COUNT(*) AS c
       FROM tokens t JOIN services s ON s.id = t.service_id
       WHERE t.branch_id = ? AND date(t.issued_at) = date(?)
       GROUP BY s.name, t.status
       ORDER BY s.name`
    ).all(branchId, date);

    sendJson(res, 200, {
      date,
      totals: Object.fromEntries(totals.map(r => [r.status, r.c])),
      avgWaitMinutes: avgWait.avg_minutes ? Math.round(avgWait.avg_minutes * 10) / 10 : null,
      avgServiceMinutes: avgService.avg_minutes ? Math.round(avgService.avg_minutes * 10) / 10 : null,
      byService,
    });
  }));
}
