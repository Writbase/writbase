-- Add configurable limit for agent keys created by a single manager.
-- Default 20, NULL means unlimited.
ALTER TABLE app_settings
  ADD COLUMN max_agent_keys_per_manager integer DEFAULT 20;
