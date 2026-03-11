import * as Sentry from '@sentry/nextjs';

const AGENT_KEY_RE = /wb_[0-9a-f-]{36}_[0-9a-f]{64}/gi;
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sentry event types vary across versions
function scrubEvent(event: any): any {
  const headers = event.request?.headers as Record<string, string> | undefined;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
        headers[key] = '[REDACTED]';
      }
    }
  }

  const raw = JSON.stringify(event);
  const scrubbed = raw.replace(AGENT_KEY_RE, '[REDACTED_AGENT_KEY]');
  return JSON.parse(scrubbed);
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,
  beforeSend(event) {
    return scrubEvent(event);
  },
  beforeSendTransaction(event) {
    return scrubEvent(event);
  },
});
