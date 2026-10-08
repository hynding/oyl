import { signal } from '../reactive/signal.js'
import { User } from '../../index.js'
import type { Repository } from '../../index.js'
import type { StorageLike } from '../ports.js'
import { PROFILE_ID_KEY } from '../storage/keys.js'

export type ProfilePatch = Partial<{ displayName: string, timezone: string, defaultCurrency: string, units: 'metric'|'imperial', birthday: string, weightKg: number, heightCm: number, gender: string, location: string }>

/** Effective timezone: the stored profile's, else the browser's. */
export function resolveTimezone(profile: User | null, browserTz: string): string {
  return profile?.timezone ?? browserTz
}

/**
 * The current-user profile over repos.users. Single-user: the pinned id (oyl/profile-id),
 * else the first record. save() is create-or-update + re-pin.
 */
export function createProfileStore(repos: { users: Repository<User> }, storage: Pick<StorageLike, 'getItem' | 'setItem'>) {
  const profile = signal(null as User | null)

  async function load() {
    const all = await repos.users.list()
    if (all.length === 0) { profile.set(null); return }
    const pinned = storage.getItem(PROFILE_ID_KEY)
    const current = ((pinned && all.find((u) => u.id === pinned)) || all[0]) as User
    storage.setItem(PROFILE_ID_KEY, current.id)
    profile.set(current)
  }

  async function save(patch: ProfilePatch) {
    const cur = profile.get()
    const pick = (k: keyof ProfilePatch, fallback: any) =>
      k in patch ? patch[k] : (cur ? (cur as any)[k] : fallback)
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
