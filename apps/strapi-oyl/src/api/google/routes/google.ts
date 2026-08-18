/**
 * Custom (non-content-type) Google OAuth routes. `config`, `connect` and
 * `callback` are public (granted in src/index.ts); the rest require a JWT.
 * The google-account content-type itself has NO REST routes — these are the
 * only doors to it.
 */
export default {
  routes: [
    { method: 'GET', path: '/google/config', handler: 'google.config', config: { policies: [] } },
    { method: 'GET', path: '/google/connect', handler: 'google.connect', config: { policies: [] } },
    { method: 'GET', path: '/google/connect-url', handler: 'google.connectUrl', config: { policies: [] } },
    { method: 'GET', path: '/google/callback', handler: 'google.callback', config: { policies: [] } },
    { method: 'GET', path: '/google/drive-token', handler: 'google.driveToken', config: { policies: [] } },
    { method: 'GET', path: '/google/status', handler: 'google.status', config: { policies: [] } },
    { method: 'POST', path: '/google/disconnect', handler: 'google.disconnect', config: { policies: [] } },
  ],
}
