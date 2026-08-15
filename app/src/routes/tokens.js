import { sendJson, sendError, readJsonBody } from '../router.js';
import { requirePermission, getDefaultCompanyId } from '../middleware.js';

function padNumber(n, width = 3) {
  return String(n).padStart(width, '0');
}

function nextSequenceAndNumber(db, branchId, serviceId, prefix) {
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM tokens WHERE branch_id = ? AND service_id = ? AND date(issued_at) = date('now')`
  ).get(branchId, serviceId);
  const seq = row.c + 1;
  return { seq, tokenNumber: `${prefix}${padNumber(seq)}` };
}

export function registerTokenRoutes(router, { broadcast }) {
  // --- Issue a token (kiosk, public) ------------------------------------
  router.post('/api/tokens', async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const { branchId, serviceId } = body;
    if (!branchId || !serviceId) return sendError(res, 400, 'branchId and serviceId are required');

    const service = ctx.db.prepare('SELECT * FROM services WHERE id = ? AND is_enabled = 1').get(serviceId);
    if (!service) return sendError(res, 404, 'Service not found or disabled');
    const branch = ctx.db.prepare('SELECT * FROM branches WHERE id = ? AND is_active = 1').get(branchId);
    if (!branch) return sendError(res, 404, 'Branch not found');

    const companyId = getDefaultCompanyId(ctx.db);
    const rule = ctx.db.prepare(
      `SELECT * FROM queue_rules WHERE service_id = ? LIMIT 1`
    ).get(serviceId) || ctx.db.prepare(
      `SELECT * FROM queue_rules WHERE branch_id = ? AND service_id IS NULL LIMIT 1`
    ).get(branchId);
    const prefix = rule?.token_prefix || service.name.slice(0, 1).toUpperCase();

    let customerId = null;
    if (body.customerName || body.mobileNumber) {
      customerId = ctx.db.prepare(
        `INSERT INTO customers (company_id, branch_id, full_name, mobile_number) VALUES (?,?,?,?) RETURNING id`
      ).get(companyId, branchId, body.customerName || null, body.mobileNumber || null).id;
    }

    const { seq, tokenNumber } = nextSequenceAndNumber(ctx.db, branchId, serviceId, prefix);
    const priorityLevel = body.priorityLevel || 'normal';

    const token = ctx.db.prepare(
      `INSERT INTO tokens (company_id, branch_id, service_id, customer_id, token_number, sequence_number, priority_level, status)
       VALUES (?,?,?,?,?,?,?, 'waiting') RETURNING *`
    ).get(companyId, branchId, serviceId, customerId, tokenNumber, seq, priorityLevel);

    ctx.db.prepare(
      `INSERT INTO token_events (token_id, event_type, metadata) VALUES (?, 'issued', '{}')`
    ).run(token.id);

    const waitingAhead = ctx.db.prepare(
      `SELECT COUNT(*) AS c FROM tokens WHERE branch_id = ? AND service_id = ? AND status = 'waiting' AND sequence_number < ?`
    ).get(branchId, serviceId, seq).c;

    broadcast(branchId, 'token_issued', { token, service: { id: service.id, name: service.name } });

    sendJson(res, 201, {
      token,
      position: waitingAhead + 1,
      estimatedWaitMinutes: (waitingAhead) * (service.estimated_duration_minutes || 10),
    });
  });

  // --- List tokens (public - used by TV display and agent terminal) ----
  router.get('/api/tokens', (req, res, params, ctx) => {
    const { branchId, status, serviceId, counterId } = ctx.query;
    if (!branchId) return sendError(res, 400, 'branchId is required');
    const clauses = ['t.branch_id = ?'];
    const args = [branchId];
    if (status) { clauses.push('t.status = ?'); args.push(status); }
    if (serviceId) { clauses.push('t.service_id = ?'); args.push(serviceId); }
    if (counterId) { clauses.push('t.counter_id = ?'); args.push(counterId); }
    const rows = ctx.db.prepare(
      `SELECT t.*, s.name AS service_name, s.color AS service_color, c.name AS counter_name
       FROM tokens t
       JOIN services s ON s.id = t.service_id
       LEFT JOIN counters c ON c.id = t.counter_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY (priority_level = 'vip') DESC, t.sequence_number ASC`
    ).all(...args);
    sendJson(res, 200, rows);
  });

  router.get('/api/tokens/:id', (req, res, params, ctx) => {
    const row = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
    if (!row) return sendError(res, 404, 'Token not found');
    const events = ctx.db.prepare('SELECT * FROM token_events WHERE token_id = ? ORDER BY created_at').all(params.id);
    sendJson(res, 200, { ...row, events });
  });

  // --- Agent actions (require queue.manage permission) ------------------
  router.post('/api/counters/:counterId/call-next', requirePermission('queue.manage')((req, res, params, ctx) => {
    const counter = ctx.db.prepare('SELECT * FROM counters WHERE id = ?').get(params.counterId);
    if (!counter) return sendError(res, 404, 'Counter not found');

    const next = ctx.db.prepare(
      `SELECT t.* FROM tokens t
       JOIN service_counters sc ON sc.service_id = t.service_id AND sc.counter_id = ?
       WHERE t.branch_id = ? AND t.status = 'waiting'
       ORDER BY (t.priority_level = 'vip') DESC, t.sequence_number ASC
       LIMIT 1`
    ).get(params.counterId, counter.branch_id);

    if (!next) return sendJson(res, 200, { token: null, message: 'No customers waiting' });

    ctx.db.prepare(
      `UPDATE tokens SET status = 'called', counter_id = ?, called_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(params.counterId, next.id);
    ctx.db.prepare(
      `INSERT INTO token_events (token_id, event_type, performed_by) VALUES (?, 'called', ?)`
    ).run(next.id, ctx.session.userId);

    const updated = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(next.id);
    broadcast(counter.branch_id, 'token_called', { token: updated, counter });
    sendJson(res, 200, { token: updated, counter });
  }));

  function transition(action, fromStatuses, toStatus, extraSql = '') {
    router.post(`/api/tokens/:id/${action}`, requirePermission('queue.manage')((req, res, params, ctx) => {
      const token = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
      if (!token) return sendError(res, 404, 'Token not found');
      if (fromStatuses.length && !fromStatuses.includes(token.status)) {
        return sendError(res, 409, `Token must be in one of [${fromStatuses.join(', ')}] (currently ${token.status})`);
      }
      ctx.db.prepare(`UPDATE tokens SET status = ?${extraSql} WHERE id = ?`).run(toStatus, params.id);
      ctx.db.prepare(`INSERT INTO token_events (token_id, event_type, performed_by) VALUES (?, ?, ?)`)
        .run(params.id, action, ctx.session.userId);
      const updated = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
      broadcast(token.branch_id, `token_${action}`, { token: updated });
      sendJson(res, 200, { token: updated });
    }));
  }

  transition('serve', ['called'], 'serving', `, served_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  transition('complete', ['called', 'serving'], 'completed', `, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  transition('no-show', ['called'], 'no_show', '');
  transition('cancel', ['waiting', 'called'], 'cancelled', '');

  router.post('/api/tokens/:id/recall', requirePermission('queue.manage')((req, res, params, ctx) => {
    const token = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
    if (!token) return sendError(res, 404, 'Token not found');
    if (!['called', 'serving'].includes(token.status)) {
      return sendError(res, 409, 'Token must be called or serving to recall');
    }
    ctx.db.prepare('UPDATE tokens SET recall_count = recall_count + 1 WHERE id = ?').run(params.id);
    ctx.db.prepare(`INSERT INTO token_events (token_id, event_type, performed_by) VALUES (?, 'recalled', ?)`)
      .run(params.id, ctx.session.userId);
    const updated = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
    broadcast(token.branch_id, 'token_recalled', { token: updated });
    sendJson(res, 200, { token: updated });
  }));

  router.post('/api/tokens/:id/transfer', requirePermission('queue.manage')(async (req, res, params, ctx) => {
    let body; try { body = await readJsonBody(req); } catch (e) { return sendError(res, 400, e.message); }
    const token = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
    if (!token) return sendError(res, 404, 'Token not found');
    if (body.toServiceId) {
      ctx.db.prepare(`UPDATE tokens SET service_id = ?, status = 'waiting', counter_id = NULL WHERE id = ?`)
        .run(body.toServiceId, params.id);
    } else if (body.toCounterId) {
      ctx.db.prepare(`UPDATE tokens SET counter_id = ? WHERE id = ?`).run(body.toCounterId, params.id);
    } else {
      return sendError(res, 400, 'toServiceId or toCounterId is required');
    }
    ctx.db.prepare(`INSERT INTO token_events (token_id, event_type, performed_by, metadata) VALUES (?, 'transferred', ?, ?)`)
      .run(params.id, ctx.session.userId, JSON.stringify(body));
    const updated = ctx.db.prepare('SELECT * FROM tokens WHERE id = ?').get(params.id);
    broadcast(token.branch_id, 'token_transferred', { token: updated });
    sendJson(res, 200, { token: updated });
  }));
}
