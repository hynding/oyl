/** Dedicated e2e ports — distinct from native dev (app 8041, backend 1340) and docker (3340/8041). */
export const APP_PORT = 8042
export const BACKEND_PORT = 1341
export const FAKE_GOOGLE_PORT = 1342

/** The stencil-oyl shell (apps/stencil-oyl) served from its www/ build. */
export const STENCIL_APP_PORT = 8043

export const APP_URL = `http://localhost:${APP_PORT}`
export const STENCIL_APP_URL = `http://localhost:${STENCIL_APP_PORT}`
export const API_URL = `http://localhost:${BACKEND_PORT}/api`
