export default ({ env }) => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    // Dev defaults cover the local app + Vite; production origins (e.g. https://app.<domain>)
    // are supplied via the CORS_ORIGINS env var (comma-separated) in /etc/strapi/strapi.env.
    config: { origin: env.array('CORS_ORIGINS', ['http://localhost:8041', 'http://localhost:5173']), credentials: false },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
