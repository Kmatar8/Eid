-- Host onboarding migration: add host email and redeemable code inventory

ALTER TABLE hosts ADD COLUMN email TEXT;
ALTER TABLE hosts ADD COLUMN access_expires_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hosts_email ON hosts(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS redeem_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  redeemed_at INTEGER,
  redeemed_by_host_id TEXT,
  FOREIGN KEY (redeemed_by_host_id) REFERENCES hosts(id)
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_email ON redeem_codes(email);
