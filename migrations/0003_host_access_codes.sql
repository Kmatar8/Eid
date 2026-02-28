-- Host credential inventory stored in D1 for ecommerce upload + redemption tracking

CREATE TABLE IF NOT EXISTS host_access_codes (
  code TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_at INTEGER,
  redeemed_at INTEGER,
  access_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_host_access_codes_status ON host_access_codes(status);
CREATE INDEX IF NOT EXISTS idx_host_access_codes_access_expires_at ON host_access_codes(access_expires_at);
