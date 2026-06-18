import { signal } from '../lib/reactive/signal.js'
import { User } from '@oyl/all-of-oyl'
import { PROFILE_ID_KEY } from '../storage/keys.js'

/** @typedef {Partial<{ displayName: string, timezone: string, defaultCurrency: string, units: 'metric'|'imperial', birthday: string, weightKg: number, heightCm: number, gender: string, location: string }>} ProfilePatch */

/** Effective timezone: the stored profile's, else the browser's. @param {import('@oyl/all-of-oyl').User|null} profile @param {string} browserTz @returns {string} */
export function resolveTimezone(profile, browserTz) {
  return profile?.timezone ?? browserTz
}

/**
 * The current-user profile over repos.users. Single-user: the pinned id (oyl/profile-id),
 * else the first record. save() is create-or-update + re-pin.
 * @param {{ users: import('@oyl/all-of-oyl').Repository<import('@oyl/all-of-oyl').User> }} repos
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void }} storage
 */
export function createProfileStore(repos, storage) {
  const profile = signal(/** @type {import('@oyl/all-of-oyl').User|null} */ (null))

  async function load() {
    const all = await repos.users.list()
    if (all.length === 0) { profile.set(null); return }
    const pinned = storage.getItem(PROFILE_ID_KEY)
    const current = /** @type {import('@oyl/all-of-oyl').User} */ ((pinned && all.find((u) => u.id === pinned)) || all[0])
    storage.setItem(PROFILE_ID_KEY, current.id)
    profile.set(current)
  }

  /** @param {ProfilePatch} patch */
  async function save(patch) {
    const cur = profile.get()
    const pick = (/** @type {keyof ProfilePatch} */ k, /** @type {any} */ fallback) =>
      k in patch ? patch[k] : (cur ? /** @type {any} */ (cur)[k] : fallback)
    const next = new User({
      ...(cur ? { id: cur.id } : {}),
      displayName: pick('displayName', 'You'),
      timezone: pick('timezone', 'UTC'),
      defaultCurrency: pick('defaultCurrency', 'USD'),
      units: pick('units', undefined),
      birthday: pick('birthday', undefined),
      weightKg: pick('weightKg', undefined),
      heightCm: pick('heightCm', undefined),
      gender: pick('gender', undefined),
      location: pick('location', undefined),
    })
    if (cur?.meta) next.meta = cur.meta
    const saved = await repos.users.save(next)
    storage.setItem(PROFILE_ID_KEY, saved.id)
    profile.set(saved)
  }

  return { profile, load, save }
}
