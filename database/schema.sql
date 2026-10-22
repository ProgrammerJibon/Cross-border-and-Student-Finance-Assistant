CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('STUDENT','PARENT','ADMIN','MODERATOR') NOT NULL DEFAULT 'STUDENT',
  status ENUM('ACTIVE','SUSPENDED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  session_version INT NOT NULL DEFAULT 1,
  onboarded BOOLEAN NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT 0,
  avatar MEDIUMTEXT NULL,
  admin_permissions JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX(role,status)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id VARCHAR(64) PRIMARY KEY,
  country_code CHAR(2) NOT NULL DEFAULT 'BD',
  ai_model_id VARCHAR(64) NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  theme VARCHAR(10) NOT NULL DEFAULT 'light',
  preferred_currency CHAR(3) NOT NULL DEFAULT 'CNY',
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Dhaka',
  notifications BOOLEAN NOT NULL DEFAULT 1,
  auto_alerts BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id VARCHAR(64) PRIMARY KEY,
  birth_date DATE,
  student_status VARCHAR(40) DEFAULT 'FULL_TIME',
  university VARCHAR(160) DEFAULT '',
  home_country VARCHAR(80) DEFAULT 'Bangladesh',
  study_country VARCHAR(80) DEFAULT 'China',
  home_currency CHAR(3) DEFAULT 'BDT',
  study_currency CHAR(3) DEFAULT 'CNY',
  monthly_income DECIMAL(18,2) NOT NULL DEFAULT 0,
  monthly_expenses DECIMAL(18,2) NOT NULL DEFAULT 0,
  goals TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS currencies (
  code CHAR(3) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS countries (
  code CHAR(2) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  FOREIGN KEY(currency_code) REFERENCES currencies(code)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id VARCHAR(64) PRIMARY KEY,
  currency CHAR(3) NOT NULL,
  rate DECIMAL(20,8) NOT NULL,
  recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(currency) REFERENCES currencies(code),
  INDEX(currency,recorded_at)
);

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  type VARCHAR(20) NOT NULL,
  currency CHAR(3) NOT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(currency) REFERENCES currencies(code),
  INDEX(user_id,archived)
);

CREATE TABLE IF NOT EXISTS transaction_categories (
  name VARCHAR(40) PRIMARY KEY,
  color VARCHAR(10) NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  type ENUM('INCOME','EXPENSE') NOT NULL,
  category VARCHAR(40) NOT NULL,
  description VARCHAR(160) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  confidence DECIMAL(4,3),
  date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id),
  INDEX(user_id,date),
  INDEX(account_id),
  INDEX(category)
);

CREATE TABLE IF NOT EXISTS budgets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  category VARCHAR(40) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  month CHAR(7) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  UNIQUE(user_id,category,currency,month)
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id VARCHAR(64) PRIMARY KEY,
  budget_id VARCHAR(64) NOT NULL,
  category VARCHAR(40) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  FOREIGN KEY(budget_id) REFERENCES budgets(id)
);

CREATE TABLE IF NOT EXISTS tuition_invoices (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  paid DECIMAL(18,2) NOT NULL DEFAULT 0,
  scholarship DECIMAL(18,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL,
  due_date DATE NOT NULL,
  semester VARCHAR(160) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(user_id,due_date)
);

CREATE TABLE IF NOT EXISTS tuition_plans (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  invoice_id VARCHAR(64) NOT NULL,
  monthly_target DECIMAL(18,2) NOT NULL,
  scenario JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(invoice_id) REFERENCES tuition_invoices(id)
);

CREATE TABLE IF NOT EXISTS remittance_providers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_fee DECIMAL(18,2) NOT NULL,
  percentage_fee DECIMAL(10,6) NOT NULL,
  spread DECIMAL(10,6) NOT NULL,
  minimum DECIMAL(18,2) NOT NULL,
  maximum DECIMAL(18,2) NOT NULL,
  eta_days INT NOT NULL,
  reliability INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS remittance_corridors (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  source_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  FOREIGN KEY(provider_id) REFERENCES remittance_providers(id),
  UNIQUE(provider_id,source_currency,target_currency)
);

CREATE TABLE IF NOT EXISTS transfer_quotes (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  source_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  receive_amount DECIMAL(18,2) NOT NULL,
  source_amount DECIMAL(18,2) NOT NULL,
  fee DECIMAL(18,2) NOT NULL,
  total DECIMAL(18,2) NOT NULL,
  rate DECIMAL(20,8) NOT NULL,
  eta_days INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(provider_id) REFERENCES remittance_providers(id),
  INDEX(user_id,expires_at)
);

CREATE TABLE IF NOT EXISTS sandbox_transfers (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  quote_id VARCHAR(64) NOT NULL UNIQUE,
  account_id VARCHAR(64) NOT NULL,
  destination_id VARCHAR(64),
  invoice_id VARCHAR(64),
  recipient VARCHAR(160) NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  status ENUM('DRAFT','WAITING_APPROVAL','APPROVED','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL,
  reference VARCHAR(80) UNIQUE,
  risk JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(quote_id) REFERENCES transfer_quotes(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id),
  INDEX(user_id,status,created_at)
);

CREATE TABLE IF NOT EXISTS sandbox_ledger_entries (
  id VARCHAR(64) PRIMARY KEY,
  transfer_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64),
  direction ENUM('DEBIT','CREDIT') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  balance_after DECIMAL(18,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(transfer_id) REFERENCES sandbox_transfers(id),
  INDEX(account_id)
);

CREATE TABLE IF NOT EXISTS financial_goals (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  target DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(40) NOT NULL,
  severity VARCHAR(15) NOT NULL DEFAULT 'INFO',
  detail VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',
  snoozed_until DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(user_id,status)
);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(40) NOT NULL,
  detail VARCHAR(500) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(user_id,is_read)
);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  goal VARCHAR(2000) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  provider VARCHAR(15) NOT NULL,
  result JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(user_id,created_at)
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64),
  run_id VARCHAR(64) NOT NULL,
  role VARCHAR(15) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES agent_runs(id)
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  name VARCHAR(80) NOT NULL,
  input JSON NOT NULL,
  output JSON NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(run_id) REFERENCES agent_runs(id),
  INDEX(run_id)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id VARCHAR(64) PRIMARY KEY,
  transfer_id VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64),
  expires_at DATETIME,
  consumed BOOLEAN NOT NULL DEFAULT 0,
  approved_at DATETIME,
  FOREIGN KEY(transfer_id) REFERENCES sandbox_transfers(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  transfer_id VARCHAR(64),
  assessment JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(user_id,created_at)
);

CREATE TABLE IF NOT EXISTS family_links (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(64),
  invite_hash CHAR(64) UNIQUE,
  invite_email VARCHAR(190) NOT NULL,
  status ENUM('INVITED','PENDING','LINKED','REVOKED') NOT NULL,
  invited_by VARCHAR(10) NOT NULL DEFAULT 'STUDENT',
  expires_at DATETIME,
  visibility JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES users(id),
  FOREIGN KEY(parent_id) REFERENCES users(id),
  INDEX(parent_id,status)
);

CREATE TABLE IF NOT EXISTS parental_controls (
  link_id VARCHAR(64) PRIMARY KEY,
  threshold DECIMAL(18,2) NOT NULL DEFAULT 500,
  per_transfer DECIMAL(18,2) NOT NULL DEFAULT 10000,
  daily_limit DECIMAL(18,2) NOT NULL DEFAULT 15000,
  monthly_limit DECIMAL(18,2) NOT NULL DEFAULT 25000,
  currency CHAR(3) NOT NULL DEFAULT 'CAD',
  tuition_approval BOOLEAN NOT NULL DEFAULT 1,
  conversion_approval BOOLEAN NOT NULL DEFAULT 1,
  auto_approve BOOLEAN NOT NULL DEFAULT 0,
  allow_non_beneficiary BOOLEAN NOT NULL DEFAULT 0,
  non_beneficiary_limit DECIMAL(18,2) NOT NULL DEFAULT 0,
  category_limits JSON,
  FOREIGN KEY(link_id) REFERENCES family_links(id)
);

CREATE TABLE IF NOT EXISTS parent_approvals (
  id VARCHAR(64) PRIMARY KEY,
  transfer_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(64) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reason VARCHAR(500),
  decided_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(transfer_id) REFERENCES sandbox_transfers(id),
  FOREIGN KEY(parent_id) REFERENCES users(id),
  UNIQUE(transfer_id,parent_id)
);

CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  description_key VARCHAR(80) NOT NULL,
  trial_days INT NOT NULL DEFAULT 0,
  limits JSON NOT NULL,
  recommended BOOLEAN NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_prices (
  plan_id VARCHAR(64) PRIMARY KEY,
  monthly DECIMAL(18,2) NOT NULL,
  yearly DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  plan_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id VARCHAR(64) NOT NULL,
  feature VARCHAR(40) NOT NULL,
  period CHAR(7) NOT NULL,
  used INT NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,feature,period),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS demo_payments (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  last_four CHAR(4) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reference VARCHAR(80) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  category VARCHAR(40) NOT NULL,
  subject VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  related_id VARCHAR(64),
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  resolution VARCHAR(1000),
  internal_note VARCHAR(1000),
  assigned_to VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(status,created_at)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  metadata JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(actor_id,created_at),
  INDEX(action)
);

CREATE TABLE IF NOT EXISTS admin_settings (
  name VARCHAR(80) PRIMARY KEY,
  value JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_tasks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  task_key VARCHAR(80) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT 0,
  UNIQUE(user_id,task_key)
);

CREATE TABLE IF NOT EXISTS credit_profiles (
  user_id VARCHAR(64) PRIMARY KEY,
  utilization INT NOT NULL DEFAULT 0,
  age_months INT NOT NULL DEFAULT 0,
  overdue INT NOT NULL DEFAULT 0,
  on_time INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  identifier VARCHAR(190) PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS platform_migrations (
  id VARCHAR(64) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS ai_models (
  id VARCHAR(64) PRIMARY KEY,
  owner_id VARCHAR(64) NULL,
  company ENUM('OPENAI','GEMINI','ANTHROPIC','COMPATIBLE') NOT NULL,
  label VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  key_cipher TEXT NOT NULL,
  key_last_four CHAR(4) NOT NULL,
  base_url VARCHAR(300) NULL,
  input_price DECIMAL(16,6) NULL,
  output_price DECIMAL(16,6) NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS saved_cards (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  label VARCHAR(80) NOT NULL,
  last_four CHAR(4) NOT NULL,
  expiry CHAR(5) NOT NULL,
  demo_token VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS team_members (
  user_id VARCHAR(64) PRIMARY KEY,
  department VARCHAR(100) NOT NULL,
  designation VARCHAR(100) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  portfolio VARCHAR(300) NOT NULL DEFAULT '',
  is_ceo BOOLEAN NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  deposit_enabled BOOLEAN NOT NULL DEFAULT 1,
  withdrawal_enabled BOOLEAN NOT NULL DEFAULT 1,
  instructions VARCHAR(2000) NOT NULL DEFAULT '',
  currencies JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  method VARCHAR(20) NOT NULL,
  currency CHAR(3) NOT NULL,
  country_code CHAR(2) NOT NULL,
  destination VARCHAR(1500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(user_id,status)
);

CREATE TABLE IF NOT EXISTS beneficiary_decisions (
  beneficiary_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(beneficiary_id,parent_id),
  FOREIGN KEY(beneficiary_id) REFERENCES beneficiaries(id),
  FOREIGN KEY(parent_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS financial_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  kind VARCHAR(15) NOT NULL,
  method VARCHAR(20) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  recipient VARCHAR(160) NOT NULL,
  destination VARCHAR(1500) NOT NULL,
  beneficiary_id VARCHAR(64),
  recipient_account_id VARCHAR(64),
  recipient_user_id VARCHAR(64),
  receive_amount DECIMAL(18,2) NOT NULL,
  receive_currency CHAR(3) NOT NULL,
  fx_rate DECIMAL(20,8) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'Other',
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  held BOOLEAN NOT NULL DEFAULT 0,
  reference VARCHAR(100) NOT NULL DEFAULT '',
  payment_instructions VARCHAR(2000) NOT NULL DEFAULT '',
  note VARCHAR(500) NOT NULL DEFAULT '',
  idempotency_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id),
  UNIQUE(user_id,idempotency_key),
  INDEX(user_id,status,created_at)
);

CREATE TABLE IF NOT EXISTS financial_approvals (
  request_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reason VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY(request_id,parent_id),
  FOREIGN KEY(request_id) REFERENCES financial_requests(id),
  FOREIGN KEY(parent_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS financial_events (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(request_id) REFERENCES financial_requests(id),
  INDEX(request_id,created_at)
);

CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  phase VARCHAR(20) NOT NULL,
  entry_key VARCHAR(40) NOT NULL,
  account_id VARCHAR(64),
  direction VARCHAR(10) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES financial_requests(id),
  UNIQUE(request_id,phase,entry_key)
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  action VARCHAR(20) NOT NULL,
  cycle VARCHAR(10) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX(user_id,created_at)
);

CREATE TABLE IF NOT EXISTS agent_action_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  action_name VARCHAR(64) NOT NULL,
  input_json JSON NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  result_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(run_id,fingerprint),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(run_id) REFERENCES agent_runs(id)
);

CREATE TABLE IF NOT EXISTS agent_conversation_turns (
  run_id VARCHAR(64) PRIMARY KEY,
  previous_run_id VARCHAR(64) NOT NULL,
  FOREIGN KEY(run_id) REFERENCES agent_runs(id),
  FOREIGN KEY(previous_run_id) REFERENCES agent_runs(id)
);

CREATE TABLE IF NOT EXISTS agent_provider_usage (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  run_id VARCHAR(64) NULL,
  model_id VARCHAR(64) NULL,
  provider VARCHAR(20) NOT NULL,
  model VARCHAR(100) NOT NULL,
  http_status INT NOT NULL,
  input_tokens BIGINT NULL,
  output_tokens BIGINT NULL,
  total_tokens BIGINT NULL,
  estimated_cost_usd DECIMAL(20,8) NULL,
  details JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(run_id) REFERENCES agent_runs(id),
  INDEX(user_id,created_at)
);

CREATE TABLE IF NOT EXISTS generated_alerts (
  user_id VARCHAR(64) NOT NULL,
  condition_key VARCHAR(160) NOT NULL,
  alert_id VARCHAR(64) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  source_student VARCHAR(64),
  visibility_field VARCHAR(30),
  PRIMARY KEY(user_id,condition_key),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(alert_id) REFERENCES alerts(id)
);
