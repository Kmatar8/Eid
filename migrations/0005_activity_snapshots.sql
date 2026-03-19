CREATE TABLE IF NOT EXISTS activity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  
  -- Host metrics
  hosts_with_assignment INTEGER NOT NULL,
  hosts_present INTEGER NOT NULL,
  hosts_stale INTEGER NOT NULL,
  
  -- Room metrics
  rooms_assigned INTEGER NOT NULL,
  rooms_active INTEGER NOT NULL,
  rooms_missing INTEGER NOT NULL,
  rooms_inactive INTEGER NOT NULL,
  
  -- Controller metrics
  controllers_joined INTEGER NOT NULL,
  controllers_active INTEGER NOT NULL,
  controllers_stale INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_snapshots_observed_at 
ON activity_snapshots(observed_at);
