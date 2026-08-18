export default ({ env }) => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    // Dev defaults cover the local app + Vite; production origins (e.g. https://app.<domain>)
    // are supplied via the CORS_ORIGINS env var (comma-separated) in /etc/strapi/strapi.env.
    // credentials: true is required for the google oauth link-mode cookie (connectUrl's
    // HttpOnly nonce cookie, see src/api/google/controllers/google.ts) to survive a cross-origin
    // fetch from the app's origin — the Fetch spec drops a cross-origin Set-Cookie unless the
    // request used credentials:'include' AND the response echoes Access-Control-Allow-Credentials:
    // true paired with a specific (non-wildcard) origin. Safe here because `origin` above is
    // already an explicit allowlist, never '*' — Strapi's CORS middleware only ever echoes back
    // one of these specific origins, never a wildcard, when credentials is enabled.
    config: { origin: env.array('CORS_ORIGINS', ['http://localhost:8041', 'http://localhost:5173']), credentials: true },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
