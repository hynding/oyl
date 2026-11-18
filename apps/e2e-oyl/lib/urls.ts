/** Dedicated e2e ports — distinct from native dev (app 3344, backend 1340) and docker (3340/3344). */
export const APP_PORT = 8043
export const BACKEND_PORT = 1341
export const FAKE_GOOGLE_PORT = 1342

export const APP_URL = `http://localhost:${APP_PORT}`
export const API_URL = `http://localhost:${BACKEND_PORT}/api`
