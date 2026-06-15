export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  { name: 'strapi::cors', config: { origin: ['http://localhost:8041', 'http://localhost:5173'], credentials: false } },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
