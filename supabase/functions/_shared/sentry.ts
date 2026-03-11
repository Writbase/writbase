import * as Sentry from '@sentry/deno'

const AGENT_KEY_RE = /wb_[0-9a-f-]{36}_[0-9a-f]{64}/gi
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie']

function scrubEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  const req = event.request as { headers?: Record<string, string> } | undefined
  if (req?.headers) {
    for (const key of Object.keys(req.headers)) {
      if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
        req.headers[key] = '[REDACTED]'
      }
    }
  }

  const raw = JSON.stringify(event)
  const scrubbed = raw.replace(AGENT_KEY_RE, '[REDACTED_AGENT_KEY]')
  return JSON.parse(scrubbed)
}

export function initSentry(): void {
  Sentry.init({
    dsn: Deno.env.get('SENTRY_DSN'),
    tracesSampleRate: 0.1,
    environment: Deno.env.get('DENO_DEPLOYMENT_ID') ? 'production' : 'development',
    beforeSend(event: Record<string, unknown>) {
      return scrubEvent(event)
    },
    beforeSendTransaction(event: Record<string, unknown>) {
      return scrubEvent(event)
    },
  })
}

export function captureException(err: unknown): void {
  Sentry.captureException(err)
}
