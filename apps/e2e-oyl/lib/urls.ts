/** Dedicated e2e ports — distinct from native dev (app 8041, backend 1340) and docker (3340/8041). */
export const APP_PORT = 8042
export const BACKEND_PORT = 1341

export const APP_URL = `http://localhost:${APP_PORT}`
export const API_URL = `http://localhost:${BACKEND_PORT}/api`
