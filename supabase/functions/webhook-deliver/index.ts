/**
 * webhook-deliver Edge Function
 *
 * Receives task mutation payloads from the Postgres trigger (via pg_net),
 * looks up matching webhook subscriptions, HMAC-signs payloads per the
 * Standard Webhooks spec, and fans out delivery to subscriber URLs.
 *
 * Auth: X-Webhook-Internal-Secret header (not JWT — deployed with --no-verify-jwt).
 * Delivery: fire-and-forget, at-most-once. No retry.
 */

import { createServiceClient } from '../_shared/supabase-client.ts'
import { signWebhookPayload } from '../_shared/hmac.ts'
import { logger } from '../_shared/logger.ts'

const INTERNAL_SECRET = Deno.env.get('WEBHOOK_INTERNAL_SECRET') ?? ''

interface TriggerPayload {
  task_id: string
  project_id: string
  workspace_id: string
  version: number
  events: string[]
  new_record: Record<string, unknown>
  old_record: Record<string, unknown> | null
}

interface WebhookSubscription {
  id: string
  url: string
  secret: string
  event_types: string[]
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1. Verify internal secret
  const providedSecret = req.headers.get('X-Webhook-Internal-Secret') ?? ''
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    logger.warn('Unauthorized webhook-deliver call')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Parse payload
  let payload: TriggerPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { task_id, project_id, workspace_id, version, events, new_record, old_record } = payload

  if (!task_id || !project_id || !workspace_id || !events?.length) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Query matching subscriptions (workspace-scoped, active, event overlap)
  const supabase = createServiceClient()
  const { data: subscriptions, error } = await supabase
    .from('webhook_subscriptions')
    .select('id, url, secret, event_types')
    .eq('project_id', project_id)
    .eq('workspace_id', workspace_id)
    .eq('is_active', true)
    .overlaps('event_types', events)
    .returns<WebhookSubscription[]>()

  if (error) {
    logger.error('Failed to query subscriptions', { error: error.message, task_id })
    return new Response(JSON.stringify({ error: 'Subscription lookup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ delivered: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 4. Diff OLD vs NEW to build changes object
  const changes = buildChanges(new_record, old_record)

  // 5. Fan out: for each subscription × each matching event
  const deliveries: Promise<DeliveryResult>[] = []

  for (const sub of subscriptions) {
    // Find events this subscription cares about
    const matchingEvents = events.filter((e) => sub.event_types.includes(e))

    for (const eventType of matchingEvents) {
      deliveries.push(deliverWebhook(sub, eventType, task_id, project_id, version, new_record, changes))
    }
  }

  const results = await Promise.allSettled(deliveries)

  const summary = {
    delivered: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length,
    failed: results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length,
    total: results.length,
  }

  logger.info('Webhook delivery complete', { task_id, ...summary })

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Helpers ───────────────────────────────────────────────────────────

interface DeliveryResult {
  ok: boolean
  subscriptionId: string
  status?: number
  error?: string
}

const TRACKED_FIELDS = ['status', 'priority', 'description', 'notes', 'department_id', 'due_date', 'assigned_to_agent_key_id']

function buildChanges(
  newRecord: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null,
): Record<string, { old: unknown; new: unknown }> {
  if (!oldRecord) return {}

  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const field of TRACKED_FIELDS) {
    const oldVal = oldRecord[field] ?? null
    const newVal = newRecord[field] ?? null
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { old: oldVal, new: newVal }
    }
  }
  return changes
}

async function deliverWebhook(
  sub: WebhookSubscription,
  eventType: string,
  taskId: string,
  projectId: string,
  version: number,
  newRecord: Record<string, unknown>,
  changes: Record<string, { old: unknown; new: unknown }>,
): Promise<DeliveryResult> {
  // Build webhook payload
  const webhookPayload = {
    type: eventType,
    timestamp: newRecord.updated_at ?? new Date().toISOString(),
    data: {
      task_id: taskId,
      project_id: projectId,
      version,
      status: newRecord.status,
      changes,
      actor: {
        type: newRecord.updated_by_type ?? null,
        id: newRecord.updated_by_id ?? null,
      },
    },
  }

  const body = JSON.stringify(webhookPayload)

  // Deterministic webhook-id for consumer-side idempotency
  const msgId = `msg_${taskId}_${version}_${eventType}`
  const timestamp = Math.floor(Date.now() / 1000)

  // HMAC-SHA256 sign
  const signature = await signWebhookPayload(msgId, timestamp, body, sub.secret)

  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WritBase-Webhooks/1.0',
        'webhook-id': msgId,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': `v1,${signature}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      logger.warn('Webhook delivery failed', {
        subscription_id: sub.id,
        url: sub.url,
        status: res.status,
        event: eventType,
      })
    }

    return { ok: res.ok, subscriptionId: sub.id, status: res.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Webhook delivery error', {
      subscription_id: sub.id,
      url: sub.url,
      error: message,
      event: eventType,
    })
    return { ok: false, subscriptionId: sub.id, error: message }
  }
}
