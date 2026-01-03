import crypto from 'crypto';

export function hashIngestionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateIngestionToken() {
  // Keep it URL-safe and distinct from other keys.
  const raw = crypto.randomBytes(32).toString('base64url');
  return `hdx_ingest_${raw}`;
}

export function tokenPrefix(token: string, chars: number = 12) {
  return token.slice(0, chars);
}
