type LogLevel = 'info' | 'warn' | 'error'

interface LogContext {
  request_id?: string
  agent_key_id?: string
  [key: string]: unknown
}

function log(level: LogLevel, msg: string, ctx: LogContext = {}) {
  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...ctx,
  }
  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
}
