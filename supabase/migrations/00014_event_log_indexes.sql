-- Index on event_log(event_type) for filtering queries
CREATE INDEX IF NOT EXISTS idx_event_log_event_type ON event_log (event_type);
