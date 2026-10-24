CREATE TABLE IF NOT EXISTS provider_checkouts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  cycle VARCHAR(10) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  remote_id VARCHAR(255) NULL,
  approval_url TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  receipt VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY provider_remote (provider, remote_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id),
  INDEX(user_id, created_at)
);
