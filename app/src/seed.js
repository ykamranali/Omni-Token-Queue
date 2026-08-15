// First-run seed data. Only runs once, when the `companies` table is empty,
// so it is always safe to start the server against an existing database.
import { hashPassword } from './auth.js';

function insertReturningId(db, sql, params) {
  return db.prepare(`${sql} RETURNING id`).get(...params).id;
}

export function seedIfEmpty(db) {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM companies').get();
  if (existing.c > 0) return;

  const companyName = process.env.SEED_COMPANY_NAME || 'My Organization';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  console.log('[seed] empty database detected, creating starter data...');

  const companyId = insertReturningId(
    db,
    `INSERT INTO companies (name, industry_type, default_language_code, default_currency_code) VALUES (?,?,?,?)`,
    [companyName, 'general', 'en', 'USD']
  );

  const branchId = insertReturningId(
    db,
    `INSERT INTO branches (company_id, name, code, address) VALUES (?,?,?,?)`,
    [companyId, 'Main Branch', 'MAIN', '']
  );

  const deptId = insertReturningId(
    db,
    `INSERT INTO departments (company_id, branch_id, name) VALUES (?,?,?)`,
    [companyId, branchId, 'Customer Service']
  );

  const counter1 = insertReturningId(
    db,
    `INSERT INTO counters (branch_id, department_id, name, number) VALUES (?,?,?,?)`,
    [branchId, deptId, 'Counter 1', '1']
  );
  const counter2 = insertReturningId(
    db,
    `INSERT INTO counters (branch_id, department_id, name, number) VALUES (?,?,?,?)`,
    [branchId, deptId, 'Counter 2', '2']
  );

  // --- Permissions & roles ---
  const permissionDefs = [
    ['services.manage', 'services', 'manage_settings', 'Create/edit/delete services'],
    ['queue.manage', 'queue', 'approve', 'Call, recall, transfer, complete tokens'],
    ['admin.manage', 'admin', 'manage_settings', 'Manage branches, counters, users, roles'],
    ['reports.view', 'reports', 'view', 'View reports'],
  ];
  const permIds = {};
  for (const [code, module_, action, description] of permissionDefs) {
    permIds[code] = insertReturningId(
      db,
      `INSERT INTO permissions (code, module, action, description) VALUES (?,?,?,?)`,
      [code, module_, action, description]
    );
  }

  const adminRoleId = insertReturningId(
    db,
    `INSERT INTO roles (company_id, name, description, is_system_role) VALUES (?,?,?,1)`,
    [companyId, 'Administrator', 'Full access to configuration and queue management']
  );
  const agentRoleId = insertReturningId(
    db,
    `INSERT INTO roles (company_id, name, description, is_system_role) VALUES (?,?,?,1)`,
    [companyId, 'Agent', 'Front-desk queue operation only']
  );
  for (const code of Object.keys(permIds)) {
    db.prepare(`INSERT INTO role_permissions VALUES (?,?)`).run(adminRoleId, permIds[code]);
  }
  db.prepare(`INSERT INTO role_permissions VALUES (?,?)`).run(agentRoleId, permIds['queue.manage']);

  const adminUserId = insertReturningId(
    db,
    `INSERT INTO users (company_id, branch_id, full_name, email, password_hash) VALUES (?,?,?,?,?)`,
    [companyId, branchId, 'Administrator', adminEmail, hashPassword(adminPassword)]
  );
  db.prepare(`INSERT INTO user_roles (user_id, role_id, branch_id) VALUES (?,?,?)`)
    .run(adminUserId, adminRoleId, null);

  // --- Demo services ---
  const services = [
    { name: 'Customer Service', color: '#3b82f6', prefix: 'A', duration: 10 },
    { name: 'Billing', color: '#8b5cf6', prefix: 'B', duration: 8 },
  ];
  for (const svc of services) {
    const serviceId = insertReturningId(
      db,
      `INSERT INTO services (company_id, name, color, estimated_duration_minutes, is_enabled, online_booking_enabled)
       VALUES (?,?,?,?,1,0)`,
      [companyId, svc.name, svc.color, svc.duration]
    );
    db.prepare(`INSERT INTO service_branches VALUES (?,?)`).run(serviceId, branchId);
    db.prepare(`INSERT INTO service_departments VALUES (?,?)`).run(serviceId, deptId);
    db.prepare(`INSERT INTO service_counters VALUES (?,?)`).run(serviceId, counter1);
    db.prepare(`INSERT INTO service_counters VALUES (?,?)`).run(serviceId, counter2);
    db.prepare(
      `INSERT INTO queue_rules (company_id, branch_id, service_id, token_prefix, max_waiting_time_minutes, recall_limit)
       VALUES (?,?,?,?,?,?)`
    ).run(companyId, branchId, serviceId, svc.prefix, 30, 3);
  }

  // --- Default intake form ---
  const formId = insertReturningId(
    db,
    `INSERT INTO form_templates (company_id, name, description) VALUES (?,?,?)`,
    [companyId, 'Customer Registration', 'Default walk-in intake form']
  );
  const fields = [
    ['full_name', 'full_name', 'Full Name', 1, 1],
    ['mobile_number', 'mobile_number', 'Mobile Number', 1, 2],
    ['notes', 'notes', 'Notes', 0, 3],
  ];
  for (const [key, type, label, required, order] of fields) {
    db.prepare(
      `INSERT INTO form_fields (form_template_id, field_key, field_type, label, is_required, display_order)
       VALUES (?,?,?,?,?,?)`
    ).run(formId, key, type, label, required, order);
  }

  // --- Default display screen ---
  db.prepare(
    `INSERT INTO display_screens (branch_id, name, layout_config) VALUES (?,?,?)`
  ).run(branchId, 'Lobby Display', '{"zones":["now_serving","waiting","ticker"]}');

  console.log(`[seed] done. Admin login: ${adminEmail} / ${adminPassword}`);
  console.log('[seed] change the admin password after first login.');
}
