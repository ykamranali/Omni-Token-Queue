-- ============================================================================
-- OMNI TOKEN SYSTEM — SQLite build (for in-browser testing via sql.js)
-- Structurally identical to the PostgreSQL schema; only dialect differs:
--   UUID -> TEXT, BOOLEAN -> INTEGER(0/1), JSONB -> TEXT (JSON string),
--   TIMESTAMPTZ/TIME/DATE -> TEXT (ISO-8601), gen_random_uuid() -> hex/randomblob,
--   per-table CREATE TRIGGER instead of a Postgres DO-block loop.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE companies (
  id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name                    TEXT NOT NULL,
  industry_type           TEXT,
  timezone                TEXT NOT NULL DEFAULT 'UTC',
  default_language_code   TEXT NOT NULL DEFAULT 'en',
  default_currency_code   TEXT NOT NULL DEFAULT 'USD',
  is_active               INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE branches (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  code          TEXT,
  address       TEXT,
  timezone      TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, code)
);

CREATE TABLE languages (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_default   INTEGER NOT NULL DEFAULT 0,
  is_enabled   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (company_id, code)
);

CREATE TABLE currencies (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  symbol       TEXT,
  is_default   INTEGER NOT NULL DEFAULT 0,
  is_enabled   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (company_id, code)
);

CREATE TABLE permissions (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code          TEXT NOT NULL UNIQUE,
  module        TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN
                  ('view','create','edit','delete','export','print','approve','manage_settings')),
  description   TEXT
);

CREATE TABLE roles (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  is_system_role   INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, name)
);

CREATE TABLE role_permissions (
  role_id         TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id       TEXT REFERENCES branches(id) ON DELETE SET NULL,
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  password_hash   TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, email)
);

-- NOTE: Postgres version uses UNIQUE NULLS NOT DISTINCT so multiple "all-branch"
-- role grants can't duplicate. SQLite's UNIQUE treats NULLs as distinct, so
-- application logic should prevent duplicate (user_id, role_id, NULL) rows.
CREATE TABLE user_roles (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id      TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_id    TEXT REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE (user_id, role_id, branch_id)
);

CREATE TABLE departments (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id     TEXT REFERENCES branches(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE counters (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  department_id   TEXT REFERENCES departments(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  number          TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE counter_staff_assignments (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  counter_id       TEXT NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_from    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  assigned_until   TEXT
);

CREATE TABLE services (
  id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id                  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  description                 TEXT,
  icon                        TEXT,
  image_url                   TEXT,
  color                       TEXT,
  estimated_duration_minutes  INTEGER,
  priority                    INTEGER NOT NULL DEFAULT 0,
  is_enabled                  INTEGER NOT NULL DEFAULT 1,
  online_booking_enabled      INTEGER NOT NULL DEFAULT 0,
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE service_branches (
  service_id   TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  branch_id    TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, branch_id)
);

CREATE TABLE service_departments (
  service_id      TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  department_id   TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, department_id)
);

CREATE TABLE service_counters (
  service_id   TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  counter_id   TEXT NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, counter_id)
);

CREATE TABLE form_templates (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE form_fields (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  form_template_id       TEXT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  field_key              TEXT NOT NULL,
  field_type             TEXT NOT NULL CHECK (field_type IN (
                           'first_name','last_name','full_name','mobile_number','email','emirates_id',
                           'passport_number','nationality','date_of_birth','company_name','customer_type',
                           'gender','address','notes','file_upload','photo_upload','signature','qr_code',
                           'barcode','dropdown','checkbox','radio_button','date_picker','time_picker',
                           'number','currency','custom_text'
                         )),
  label                  TEXT NOT NULL,
  placeholder            TEXT,
  is_required            INTEGER NOT NULL DEFAULT 0,
  validation_rules       TEXT NOT NULL DEFAULT '{}',
  default_value          TEXT,
  is_read_only           INTEGER NOT NULL DEFAULT 0,
  visibility_condition   TEXT,
  display_order          INTEGER NOT NULL DEFAULT 0,
  branch_id              TEXT REFERENCES branches(id) ON DELETE CASCADE,
  service_id             TEXT REFERENCES services(id) ON DELETE CASCADE,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (form_template_id, field_key)
);

CREATE TABLE form_field_options (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  form_field_id   TEXT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,
  label           TEXT NOT NULL,
  display_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE customers (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id      TEXT REFERENCES branches(id) ON DELETE SET NULL,
  full_name      TEXT,
  mobile_number  TEXT,
  email          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE customer_field_values (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id     TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  form_field_id   TEXT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  value_text      TEXT,
  value_json      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (customer_id, form_field_id)
);

CREATE TABLE workflows (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id   TEXT REFERENCES services(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE workflow_steps (
  id                        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workflow_id               TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order                INTEGER NOT NULL,
  name                      TEXT NOT NULL,
  department_id             TEXT REFERENCES departments(id) ON DELETE SET NULL,
  counter_assignment_type   TEXT NOT NULL DEFAULT 'automatic' CHECK (counter_assignment_type IN ('automatic','manual')),
  priority_handling         TEXT NOT NULL DEFAULT '{}',
  is_start                  INTEGER NOT NULL DEFAULT 0,
  is_end                    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workflow_id, step_order)
);

CREATE TABLE workflow_transitions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_step_id    TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  to_step_id      TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  condition       TEXT,
  display_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE queue_rules (
  id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id                  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id                   TEXT REFERENCES branches(id) ON DELETE CASCADE,
  service_id                  TEXT REFERENCES services(id) ON DELETE CASCADE,
  token_prefix                TEXT NOT NULL DEFAULT '',
  numbering_format            TEXT NOT NULL DEFAULT '{prefix}{seq:03d}',
  daily_reset_time            TEXT NOT NULL DEFAULT '00:00',
  priority_levels             TEXT NOT NULL DEFAULT '[]',
  max_waiting_time_minutes    INTEGER,
  auto_cancel_enabled         INTEGER NOT NULL DEFAULT 0,
  auto_cancel_minutes         INTEGER,
  no_show_policy              TEXT NOT NULL DEFAULT '{}',
  recall_limit                INTEGER NOT NULL DEFAULT 3,
  transfer_rules              TEXT NOT NULL DEFAULT '{}',
  vip_handling                TEXT NOT NULL DEFAULT '{}',
  emergency_queue_behavior    TEXT NOT NULL DEFAULT '{}',
  is_active                   INTEGER NOT NULL DEFAULT 1,
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE tokens (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id          TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id         TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  workflow_id        TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  current_step_id    TEXT REFERENCES workflow_steps(id) ON DELETE SET NULL,
  token_number       TEXT NOT NULL,
  sequence_number    INTEGER NOT NULL,
  priority_level     TEXT,
  status             TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN
                       ('waiting','called','serving','completed','no_show','cancelled','transferred')),
  counter_id         TEXT REFERENCES counters(id) ON DELETE SET NULL,
  issued_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  called_at          TEXT,
  served_at          TEXT,
  completed_at       TEXT,
  recall_count       INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX idx_tokens_daily_unique ON tokens (branch_id, token_number, (date(issued_at)));

CREATE TABLE token_events (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  token_id        TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  from_step_id    TEXT REFERENCES workflow_steps(id),
  to_step_id      TEXT REFERENCES workflow_steps(id),
  performed_by    TEXT REFERENCES users(id),
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE display_screens (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  branch_id       TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  layout_config   TEXT NOT NULL DEFAULT '{}',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE display_themes (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  logo_url         TEXT,
  colors           TEXT NOT NULL DEFAULT '{}',
  fonts            TEXT NOT NULL DEFAULT '{}',
  background_url   TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE display_content (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id           TEXT REFERENCES branches(id) ON DELETE CASCADE,
  display_screen_id   TEXT REFERENCES display_screens(id) ON DELETE CASCADE,
  content_type        TEXT NOT NULL CHECK (content_type IN
                        ('video','advertisement','announcement','scrolling_message',
                         'emergency_alert','promotional_banner','image')),
  title               TEXT,
  media_url           TEXT,
  text_content        TEXT,
  display_order       INTEGER NOT NULL DEFAULT 0,
  active_from         TEXT,
  active_to           TEXT,
  is_enabled          INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE announcement_templates (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id           TEXT REFERENCES branches(id) ON DELETE CASCADE,
  language_code       TEXT NOT NULL,
  script_text         TEXT NOT NULL,
  audio_file_url      TEXT,
  is_tts              INTEGER NOT NULL DEFAULT 1,
  tts_voice           TEXT,
  voice_speed         REAL NOT NULL DEFAULT 1.0,
  voice_volume        REAL NOT NULL DEFAULT 1.0,
  repetition_count    INTEGER NOT NULL DEFAULT 1,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE branding_settings (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id             TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  logo_url               TEXT,
  favicon_url            TEXT,
  brand_colors           TEXT NOT NULL DEFAULT '{}',
  typography             TEXT NOT NULL DEFAULT '{}',
  login_screen_config    TEXT NOT NULL DEFAULT '{}',
  dashboard_theme        TEXT NOT NULL DEFAULT '{}',
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE document_templates (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_type    TEXT NOT NULL CHECK (template_type IN
                     ('email','sms','whatsapp','push','printed_token','pdf_report')),
  name             TEXT NOT NULL,
  subject          TEXT,
  body             TEXT NOT NULL,
  layout_config    TEXT NOT NULL DEFAULT '{}',
  variables        TEXT NOT NULL DEFAULT '[]',
  is_default       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE notification_logs (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id         TEXT REFERENCES document_templates(id) ON DELETE SET NULL,
  channel             TEXT NOT NULL CHECK (channel IN ('sms','whatsapp','email','push')),
  recipient           TEXT NOT NULL,
  rendered_content    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','delivered')),
  related_token_id    TEXT REFERENCES tokens(id) ON DELETE SET NULL,
  sent_at             TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE report_definitions (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id           TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  data_fields          TEXT NOT NULL DEFAULT '[]',
  filters              TEXT NOT NULL DEFAULT '{}',
  date_range_config    TEXT NOT NULL DEFAULT '{}',
  chart_config         TEXT NOT NULL DEFAULT '{}',
  table_config         TEXT NOT NULL DEFAULT '{}',
  kpi_config           TEXT NOT NULL DEFAULT '{}',
  export_formats       TEXT NOT NULL DEFAULT '["pdf","xlsx","csv"]',
  is_shared            INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE report_schedules (
  id                       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  report_definition_id     TEXT NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  cron_expression          TEXT NOT NULL,
  recipients               TEXT NOT NULL DEFAULT '[]',
  export_format            TEXT NOT NULL DEFAULT 'pdf',
  is_active                INTEGER NOT NULL DEFAULT 1,
  last_run_at              TEXT,
  next_run_at              TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE settings (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id    TEXT REFERENCES branches(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, branch_id, category, key)
);

CREATE TABLE business_hours (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id     TEXT REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time     TEXT,
  close_time    TEXT,
  is_closed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE holidays (
  id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id             TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id              TEXT REFERENCES branches(id) ON DELETE CASCADE,
  holiday_date           TEXT NOT NULL,
  name                   TEXT NOT NULL,
  is_recurring_yearly    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE appointment_slots (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id      TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id     TEXT REFERENCES services(id) ON DELETE CASCADE,
  slot_date      TEXT NOT NULL,
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL,
  capacity       INTEGER NOT NULL DEFAULT 1,
  booked_count   INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE security_policies (
  id                             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id                     TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  password_min_length            INTEGER NOT NULL DEFAULT 8,
  password_requires_uppercase    INTEGER NOT NULL DEFAULT 1,
  password_requires_number       INTEGER NOT NULL DEFAULT 1,
  password_requires_symbol       INTEGER NOT NULL DEFAULT 0,
  password_expiry_days           INTEGER,
  mfa_required                   INTEGER NOT NULL DEFAULT 0,
  session_timeout_minutes        INTEGER NOT NULL DEFAULT 30,
  backup_schedule_cron           TEXT,
  updated_at                     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL,
  scopes        TEXT NOT NULL DEFAULT '[]',
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at    TEXT
);

CREATE TABLE integrations (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  config        TEXT NOT NULL DEFAULT '{}',
  is_enabled    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE audit_logs (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  before_value   TEXT,
  after_value    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_branches_company               ON branches (company_id);
CREATE INDEX idx_users_company_branch            ON users (company_id, branch_id);
CREATE INDEX idx_departments_company_branch      ON departments (company_id, branch_id);
CREATE INDEX idx_counters_branch                 ON counters (branch_id);
CREATE INDEX idx_services_company                ON services (company_id, is_enabled);
CREATE INDEX idx_form_fields_template_order       ON form_fields (form_template_id, display_order);
CREATE INDEX idx_customer_field_values_customer   ON customer_field_values (customer_id);
CREATE INDEX idx_customers_company_branch         ON customers (company_id, branch_id);
CREATE INDEX idx_workflow_steps_workflow_order    ON workflow_steps (workflow_id, step_order);
CREATE INDEX idx_queue_rules_lookup               ON queue_rules (company_id, branch_id, service_id);
CREATE INDEX idx_tokens_branch_status             ON tokens (branch_id, status);
CREATE INDEX idx_tokens_service_issued            ON tokens (service_id, issued_at);
CREATE INDEX idx_token_events_token               ON token_events (token_id);
CREATE INDEX idx_display_content_branch_type      ON display_content (branch_id, content_type, is_enabled);
CREATE INDEX idx_document_templates_company_type  ON document_templates (company_id, template_type);
CREATE INDEX idx_notification_logs_status         ON notification_logs (status, created_at);
CREATE INDEX idx_report_schedules_next_run        ON report_schedules (next_run_at) WHERE is_active = 1;
CREATE INDEX idx_settings_lookup                  ON settings (company_id, branch_id, category);
CREATE INDEX idx_audit_logs_company_entity        ON audit_logs (company_id, entity_type, entity_id);

-- ============================================================================
-- updated_at TRIGGERS (one per table with the column; Postgres build generates
-- these automatically via a DO block, SQLite needs them declared explicitly)
-- ============================================================================

CREATE TRIGGER trg_companies_updated_at AFTER UPDATE ON companies BEGIN UPDATE companies SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_branches_updated_at AFTER UPDATE ON branches BEGIN UPDATE branches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_roles_updated_at AFTER UPDATE ON roles BEGIN UPDATE roles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_users_updated_at AFTER UPDATE ON users BEGIN UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_departments_updated_at AFTER UPDATE ON departments BEGIN UPDATE departments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_counters_updated_at AFTER UPDATE ON counters BEGIN UPDATE counters SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_services_updated_at AFTER UPDATE ON services BEGIN UPDATE services SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_form_templates_updated_at AFTER UPDATE ON form_templates BEGIN UPDATE form_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_form_fields_updated_at AFTER UPDATE ON form_fields BEGIN UPDATE form_fields SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_customers_updated_at AFTER UPDATE ON customers BEGIN UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_customer_field_values_updated_at AFTER UPDATE ON customer_field_values BEGIN UPDATE customer_field_values SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_workflows_updated_at AFTER UPDATE ON workflows BEGIN UPDATE workflows SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_queue_rules_updated_at AFTER UPDATE ON queue_rules BEGIN UPDATE queue_rules SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_tokens_updated_at AFTER UPDATE ON tokens BEGIN UPDATE tokens SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_display_screens_updated_at AFTER UPDATE ON display_screens BEGIN UPDATE display_screens SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_display_content_updated_at AFTER UPDATE ON display_content BEGIN UPDATE display_content SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_announcement_templates_updated_at AFTER UPDATE ON announcement_templates BEGIN UPDATE announcement_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_branding_settings_updated_at AFTER UPDATE ON branding_settings BEGIN UPDATE branding_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_document_templates_updated_at AFTER UPDATE ON document_templates BEGIN UPDATE document_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_report_definitions_updated_at AFTER UPDATE ON report_definitions BEGIN UPDATE report_definitions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_settings_updated_at AFTER UPDATE ON settings BEGIN UPDATE settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_security_policies_updated_at AFTER UPDATE ON security_policies BEGIN UPDATE security_policies SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_integrations_updated_at AFTER UPDATE ON integrations BEGIN UPDATE integrations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
