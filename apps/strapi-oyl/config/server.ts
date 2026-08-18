export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  mcp: {
    enabled: env.bool('STRAPI_MCP_ENABLED', true),
  },
  // In production, Caddy terminates TLS and proxies plain HTTP to Strapi. Without this, Koa
  // doesn't trust the X-Forwarded-Proto Caddy sends, so ctx.request.secure reads false even on a
  // real HTTPS request — breaking any `secure: true` cookie (e.g. the google oauth nonce cookie
  // in src/api/google/controllers/google.ts), which the `cookies` lib refuses to set over what
  // it believes is plain HTTP. Harmless in dev/test: nothing proxies to Strapi there.
  proxy: {
    koa: true,
  },
});
