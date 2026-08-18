/** Google OAuth env config. Read per-call (not module-load) so tests can set env before boot. */
export type GoogleConfig = {
  configured: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
  appUrl: string
  authBaseUrl: string
  tokenUrl: string
  revokeUrl: string
}

export function googleConfig(): GoogleConfig {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? ''
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? ''
  return {
    configured: clientId !== '' && clientSecret !== '',
    clientId,
    clientSecret,
    redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:1340/api/google/callback',
    appUrl: process.env['APP_URL'] ?? 'http://localhost:8041',
    authBaseUrl: process.env['GOOGLE_AUTH_BASE_URL'] ?? 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: process.env['GOOGLE_TOKEN_URL'] ?? 'https://oauth2.googleapis.com/token',
    revokeUrl: process.env['GOOGLE_REVOKE_URL'] ?? 'https://oauth2.googleapis.com/revoke',
  }
}
