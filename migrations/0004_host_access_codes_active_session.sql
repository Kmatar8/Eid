-- Track currently active host device session nonce per credential code.

ALTER TABLE host_access_codes ADD COLUMN active_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_host_access_codes_active_session_id
  ON host_access_codes(active_session_id);
