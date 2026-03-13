-- Webhook delivery: Postgres trigger on tasks → pg_net → webhook-deliver Edge Function
--
-- The trigger function is always created (no extension dependency).
-- The trigger attachment is gated on pg_net availability, matching the
-- conditional pattern from 00012_pg_cron_cleanup.sql.

-- ══════════════════════════════════════════════════════════════════════
-- Trigger function: derive webhook events from OLD/NEW diff, call Edge Function via pg_net
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION notify_webhook_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events text[];
  v_payload jsonb;
  v_internal_secret text;
  v_edge_url text;
BEGIN
  -- 1. Derive webhook event types from OLD/NEW diff
  v_events := '{}';

  IF TG_OP = 'INSERT' THEN
    v_events := array_append(v_events, 'task.created');
    IF NEW.assigned_to_agent_key_id IS NOT NULL THEN
      v_events := array_append(v_events, 'task.assigned');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_events := array_append(v_events, 'task.updated');
      IF NEW.status = 'done' THEN
        v_events := array_append(v_events, 'task.completed');
      ELSIF NEW.status = 'failed' THEN
        v_events := array_append(v_events, 'task.failed');
      END IF;
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      IF NOT ('task.updated' = ANY(v_events)) THEN
        v_events := array_append(v_events, 'task.updated');
      END IF;
    END IF;

    IF NEW.assigned_to_agent_key_id IS DISTINCT FROM OLD.assigned_to_agent_key_id THEN
      IF OLD.assigned_to_agent_key_id IS NULL THEN
        v_events := array_append(v_events, 'task.assigned');
      ELSE
        v_events := array_append(v_events, 'task.reassigned');
      END IF;
    END IF;
  END IF;

  -- 2. No events derived → nothing to do
  IF array_length(v_events, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Build payload for Edge Function
  v_payload := jsonb_build_object(
    'task_id', NEW.id,
    'project_id', NEW.project_id,
    'workspace_id', NEW.workspace_id,
    'version', NEW.version,
    'events', to_jsonb(v_events),
    'new_record', to_jsonb(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );

  -- 4. Get config: prefer Vault (hosted), fall back to GUC (local dev)
  BEGIN
    SELECT decrypted_secret INTO v_internal_secret
      FROM vault.decrypted_secrets WHERE name = 'webhook_internal_secret' LIMIT 1;
    SELECT decrypted_secret INTO v_edge_url
      FROM vault.decrypted_secrets WHERE name = 'edge_function_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault not available (local dev)
    NULL;
  END;
  v_internal_secret := COALESCE(v_internal_secret,
    current_setting('app.settings.webhook_internal_secret', true));
  v_edge_url := COALESCE(v_edge_url,
    current_setting('app.settings.edge_function_url', true));

  -- 5. Call Edge Function via pg_net (fires after commit)
  IF v_edge_url IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := v_edge_url || '/webhook-deliver',
        body := v_payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Webhook-Internal-Secret', COALESCE(v_internal_secret, '')
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- pg_net not available — log and continue (task mutation must not fail)
      RAISE NOTICE 'webhook delivery skipped: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Attach trigger only if pg_net is available
-- ══════════════════════════════════════════════════════════════════════
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE TRIGGER trg_webhook_notify
      AFTER INSERT OR UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION notify_webhook_subscribers();
  ELSE
    RAISE NOTICE 'pg_net not available — skipping webhook trigger attachment';
  END IF;
END;
$outer$;
