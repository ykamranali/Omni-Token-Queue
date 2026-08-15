import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, requireAuth, getDefaultCompanyId } from '../middleware.js';

export function registerQueueRuleRoutes(router) {
  router.get('/api/queue-rules', requireAuth((req, res, params, ctx) => {
    const { serviceId, branchId } = ctx.query;
    const companyId = getDefaultCompanyId(ctx.db);
    let rows;
    if (serviceId) {
      rows = ctx.db.prepare('SELECT * FROM queue_rules WHERE company_id = ? AND service_id = ?').all(companyId, serviceId);
    } else if (branchId) {
      rows = ctx.db.prepare('SELECT * FROM queue_rules WHERE company_id = ? AND branch_id = ?').all(companyId, branchId);
    } else {
      rows = ctx.db.prepare('SELECT * FROM queue_rules WHERE company_id = ?').all(companyId);
    }
    sendJson(res, 200, rows);
  }));

  router.post('/api/queue-rules', requirePermission('services.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const companyId = getDefaultCompanyId(ctx.db);
    const row = ctx.db.prepare(
      `INSERT INTO queue_rules
        (company_id, branch_id, service_id, token_prefix, daily_reset_time, priority_levels,
         max_waiting_time_minutes, auto_cancel_enabled, auto_cancel_minutes, no_show_policy,
         recall_limit, transfer_rules, vip_handling, emergency_queue_behavior)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`
    ).get(
      companyId, body.branchId || null, body.serviceId || null, body.tokenPrefix || '',
      body.dailyResetTime || '00:00', JSON.stringify(body.priorityLevels || []),
      body.maxWaitingTimeMinutes || null, body.autoCancelEnabled ? 1 : 0, body.autoCancelMinutes || null,
      JSON.stringify(body.noShowPolicy || {}), body.recallLimit ?? 3,
      JSON.stringify(body.transferRules || {}), JSON.stringify(body.vipHandling || {}),
      JSON.stringify(body.emergencyQueueBehavior || {})
    );
    sendJson(res, 201, row);
  }));

  router.put('/api/queue-rules/:id', requirePermission('services.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const existing = ctx.db.prepare('SELECT * FROM queue_rules WHERE id = ?').get(params.id);
    if (!existing) return sendError(res, 404, 'Queue rule not found');
    ctx.db.prepare(
      `UPDATE queue_rules SET token_prefix=?, daily_reset_time=?, priority_levels=?, max_waiting_time_minutes=?,
        auto_cancel_enabled=?, auto_cancel_minutes=?, no_show_policy=?, recall_limit=?, transfer_rules=?,
        vip_handling=?, emergency_queue_behavior=? WHERE id=?`
    ).run(
      body.tokenPrefix ?? existing.token_prefix,
      body.dailyResetTime ?? existing.daily_reset_time,
      body.priorityLevels ? JSON.stringify(body.priorityLevels) : existing.priority_levels,
      body.maxWaitingTimeMinutes ?? existing.max_waiting_time_minutes,
      body.autoCancelEnabled === undefined ? existing.auto_cancel_enabled : (body.autoCancelEnabled ? 1 : 0),
      body.autoCancelMinutes ?? existing.auto_cancel_minutes,
      body.noShowPolicy ? JSON.stringify(body.noShowPolicy) : existing.no_show_policy,
      body.recallLimit ?? existing.recall_limit,
      body.transferRules ? JSON.stringify(body.transferRules) : existing.transfer_rules,
      body.vipHandling ? JSON.stringify(body.vipHandling) : existing.vip_handling,
      body.emergencyQueueBehavior ? JSON.stringify(body.emergencyQueueBehavior) : existing.emergency_queue_behavior,
      params.id
    );
    sendJson(res, 200, ctx.db.prepare('SELECT * FROM queue_rules WHERE id = ?').get(params.id));
  }));
}
