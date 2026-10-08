/**
 * The bundle's own reactive core, for specs: a spec that creates a signal must use the same
 * instance the components use (see src/global/app.ts), so it imports from
 * `www/build/index.esm.js` rather than from `@oyl/all-of-oyl/client` directly.
 */
export { signal, computed, effect } from '@oyl/all-of-oyl/client'
