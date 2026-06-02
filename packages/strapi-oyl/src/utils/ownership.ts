// Pure helpers for turning an "owner path" (dot-notation, e.g. 'user' or
// 'user_goal.user') into the Strapi populate / filter shapes we need, and for
// reading the resolved owner id back out of a loaded document.

export function getOwnerIdAtPath(doc: any, ownerPath: string): number | string | null {
  if (!doc) return null
  const value = ownerPath.split('.').reduce<any>((cur, key) => (cur == null ? cur : cur[key]), doc)
  return value?.id ?? null
}

// 'user'             -> ['user']
// 'user_goal.user'   -> { user_goal: { populate: ['user'] } }
export function buildOwnerPopulate(ownerPath: string): unknown {
  const parts = ownerPath.split('.')
  if (parts.length === 1) return [parts[0]]
  const leafKey = parts[parts.length - 1]
  let acc: any = { [parts[parts.length - 2]]: { populate: [leafKey] } }
  for (let i = parts.length - 3; i >= 0; i--) {
    acc = { [parts[i]]: { populate: acc } }
  }
  return acc
}

// 'user', 5              -> { user: { id: { $eq: 5 } } }
// 'user_goal.user', 5    -> { user_goal: { user: { id: { $eq: 5 } } } }
export function buildOwnerFilter(ownerPath: string, userId: number | string): Record<string, unknown> {
  const parts = ownerPath.split('.')
  let leaf: any = { id: { $eq: userId } }
  for (let i = parts.length - 1; i >= 0; i--) {
    leaf = { [parts[i]]: leaf }
  }
  return leaf
}
