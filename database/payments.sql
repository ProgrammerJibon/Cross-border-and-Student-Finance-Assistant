CREATE TABLE IF NOT EXISTS payment_methods (code VARCHAR(20) PRIMARY KEY, name VARCHAR(80) NOT NULL, active BOOLEAN NOT NULL DEFAULT 1, deposit_enabled BOOLEAN NOT NULL DEFAULT 1, withdrawal_enabled BOOLEAN NOT NULL DEFAULT 1, instructions VARCHAR(2000) NOT NULL DEFAULT '', currencies JSON NOT NULL);
CREATE TABLE IF NOT EXISTS beneficiaries (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL, method VARCHAR(20) NOT NULL, currency CHAR(3) NOT NULL, country_code CHAR(2) NOT NULL, destination VARCHAR(1500) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id), INDEX(user_id,status));
CREATE TABLE IF NOT EXISTS beneficiary_decisions (beneficiary_id VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL, status VARCHAR(20) NOT NULL, reason VARCHAR(500) NOT NULL DEFAULT '', decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(beneficiary_id,parent_id), FOREIGN KEY(beneficiary_id) REFERENCES beneficiaries(id), FOREIGN KEY(parent_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS financial_requests (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, account_id VARCHAR(64) NOT NULL, kind VARCHAR(15) NOT NULL, method VARCHAR(20) NOT NULL, amount DECIMAL(18,2) NOT NULL, currency CHAR(3) NOT NULL, recipient VARCHAR(160) NOT NULL, destination VARCHAR(1500) NOT NULL, beneficiary_id VARCHAR(64), recipient_account_id VARCHAR(64), recipient_user_id VARCHAR(64), receive_amount DECIMAL(18,2) NOT NULL, receive_currency CHAR(3) NOT NULL, fx_rate DECIMAL(20,8) NOT NULL, category VARCHAR(40) NOT NULL DEFAULT 'Other', status VARCHAR(24) NOT NULL DEFAULT 'DRAFT', held BOOLEAN NOT NULL DEFAULT 0, reference VARCHAR(100) NOT NULL DEFAULT '', payment_instructions VARCHAR(2000) NOT NULL DEFAULT '', note VARCHAR(500) NOT NULL DEFAULT '', idempotency_key VARCHAR(100) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at DATETIME, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, completed_at DATETIME, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(account_id) REFERENCES accounts(id), UNIQUE(user_id,idempotency_key), INDEX(user_id,status,created_at));
CREATE TABLE IF NOT EXISTS financial_approvals (request_id VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', reason VARCHAR(500) NOT NULL DEFAULT '', PRIMARY KEY(request_id,parent_id), FOREIGN KEY(request_id) REFERENCES financial_requests(id), FOREIGN KEY(parent_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS financial_events (id VARCHAR(64) PRIMARY KEY, request_id VARCHAR(64) NOT NULL, actor_id VARCHAR(64) NOT NULL, status VARCHAR(24) NOT NULL, note VARCHAR(500) NOT NULL DEFAULT '', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(request_id) REFERENCES financial_requests(id), INDEX(request_id,created_at));
CREATE TABLE IF NOT EXISTS financial_ledger_entries (id VARCHAR(64) PRIMARY KEY, request_id VARCHAR(64) NOT NULL, phase VARCHAR(20) NOT NULL, entry_key VARCHAR(40) NOT NULL, account_id VARCHAR(64), direction VARCHAR(10) NOT NULL, amount DECIMAL(18,2) NOT NULL, currency CHAR(3) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(request_id) REFERENCES financial_requests(id), UNIQUE(request_id,phase,entry_key));

CREATE TABLE IF NOT EXISTS subscription_events (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, plan_id VARCHAR(64) NOT NULL, action VARCHAR(20) NOT NULL, cycle VARCHAR(10) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id), INDEX(user_id,created_at));
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
