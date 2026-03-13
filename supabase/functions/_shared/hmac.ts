/**
 * HMAC-SHA256 signing for Standard Webhooks.
 *
 * Signs per the Standard Webhooks spec:
 *   signature = HMAC-SHA256("{msg_id}.{timestamp}.{body}", secret)
 *
 * Uses the Web Crypto API (built into Deno, no external deps).
 */

const encoder = new TextEncoder()

export async function signWebhookPayload(
  msgId: string,
  timestamp: number,
  body: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const data = encoder.encode(`${msgId}.${timestamp}.${body}`)
  const signature = await crypto.subtle.sign('HMAC', key, data)

  // Base64-encode the raw signature bytes
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}
