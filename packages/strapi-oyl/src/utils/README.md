# User-Scoped Controllers

This package owns user data on behalf of authenticated callers. The rule is:

> An authenticated user (and only that user — plus configured admin roles) may
> read or write rows they own. No one else.

Enforcement lives in one place: [`user-scoped-controller.ts`](./user-scoped-controller.ts).
Every `user-*` API plugs into it.

---

## What the factory does

`createUserScopedController(uid, options?, extend?)` wraps Strapi's core
controller and enforces the rule for every default action:

| Action     | Enforcement                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `find`     | Merges `filters.user.id.$eq = ctx.state.user.id` into `ctx.query` so list responses can't leak other users |
| `findOne`  | Loads the row by `documentId`, 404s if the owner relation doesn't match the caller                         |
| `create`   | **Overwrites** `data.user` with `ctx.state.user.id` — the body cannot spoof an owner                       |
| `update`   | Ownership-checks the row first, then force-sets `data.user` again to block ownership transfer              |
| `delete`   | Ownership-checks the row first                                                                             |

Ownership mismatch returns **404, not 403**, so callers can't probe for the
existence of other users' rows.

Authentication is required on every action. Unauthenticated calls get 401.

---

## Admin bypass

If `ctx.state.user.role.type` or `ctx.state.user.role.name` matches one of the
configured admin roles, the enforcement is skipped and the call passes through
to the core controller untouched. Defaults to `['admin', 'Administrator']`.

To change it for a specific resource:

```ts
createUserScopedController('api::user-goal.user-goal', {
  adminRoles: ['admin', 'support-staff'],
})
```

Pass `adminRoles: []` to disable bypass entirely (no one is an admin).

---

## Adding a new user-* API

1. **Confirm the content type has a `user` relation** to
   `plugin::users-permissions.user`. Look at
   `src/api/<name>/content-types/<name>/schema.json`. If it's nested (the
   owner is reached via another relation), see [Transitive ownership](#transitive-ownership).

2. **Replace the controller** with a single line:

   ```ts
   // src/api/your-new-api/controllers/your-new-api.ts
   import { createUserScopedController } from '../../../utils/user-scoped-controller'

   export default createUserScopedController('api::your-new-api.your-new-api')
   ```

3. **Enable the action permissions in Users & Permissions.** In the admin UI:
   *Settings → Users & Permissions → Roles → Authenticated*, then tick
   `find / findOne / create / update / delete` for the new resource.

   This step is easy to forget. Without it the request is rejected by the U&P
   plugin *before* the controller runs, and it looks like the factory is
   broken when it's actually doing nothing.

4. **Done.** No route changes needed; the default `createCoreRouter` works.

---

## Transitive ownership

Some resources don't have a direct `user` relation — they're owned through a
parent. Example: `user-goal-milestone` has a `user_goal` relation; ownership
is whoever owns that goal.

Tell the factory how to walk the relation:

```ts
createUserScopedController('api::user-goal-milestone.user-goal-milestone', {
  ownerPath: 'user_goal.user',
})
```

The factory:

- Builds nested populate (`{ user_goal: { populate: ['user'] } }`) for the
  ownership check.
- Builds nested filter (`{ user_goal: { user: { id: { $eq: <uid> } } } }`)
  for the list scope.
- On `create`, looks up the referenced parent (`user_goal` here) via
  `strapi.contentType(uid).attributes.user_goal.target` and verifies *that*
  document is owned by the caller. Bodies that reference a parent the caller
  doesn't own get 404.
- On `update`, if the body changes the parent relation, the new parent is
  re-verified.

Longer chains work the same way: `ownerPath: 'a.b.c.user'`.

---

## Custom actions

When you need an action that isn't standard CRUD (`saveByDate`,
`findOneByDate`, etc.), pass an `extend` function. It receives
`{ strapi }` and returns the extra methods.

```ts
createUserScopedController(UID, {}, ({ strapi }) => ({
  async findOneByDate(ctx) {
    // ... custom logic
  },
}))
```

**Two rules for custom actions:**

1. **They don't get free enforcement.** The factory only wraps the standard
   actions. Call the helpers manually:

   - [`injectOwnerFilter(ctx, userId, ownerPath?)`](./user-scoped-controller.ts) —
     merges the owner filter into `ctx.query` before you delegate to `find`
     or query `strapi.documents()` with `ctx.query`.
   - [`assertDocumentOwned(strapi, uid, documentId, userId, ownerPath?)`](./user-scoped-controller.ts) —
     throws `NotFoundError` if the row isn't owned by `userId`. Call before
     any update or delete that targets a specific `documentId` from the body.

2. **`super.find` etc. don't work from `extend` methods** (the [[HomeObject]]
   of the extend literal isn't the controller's prototype). If you need the
   factory's owner-scoped `find` inside a custom action, call `this.find(ctx)`
   instead of `super.find(ctx)`. Or, more commonly, just call
   `strapi.documents(uid).findMany(ctx.query)` directly after
   `injectOwnerFilter`.

See [`api/user-daily/controllers/user-daily.ts`](../api/user-daily/controllers/user-daily.ts)
for a worked example combining default CRUD + two custom actions.

---

## Why this approach (vs the alternatives we considered)

- **Route policy** — Policies are predicates (allow/deny). They can't
  idiomatically *mutate* `data.user` on create, which is half of what we
  need. Would force a policy plus a controller override, two pieces per
  resource. The factory does both jobs in one place.

- **Route middleware** — Middleware *can* mutate the body, but you'd still
  need a separate policy for the ownership check on `findOne`/`update`/
  `delete`. Two configuration points per resource, plus you have to switch
  to manual route config to attach them.

- **Document service middleware** (`strapi.documents.use(...)`) — Catches
  every code path (REST, admin panel, cron, GraphQL) but has no access to
  `ctx.state.user`. Requires AsyncLocalStorage to thread the current user
  through. Too much machinery for a REST-only surface.

- **A third-party plugin** — We previously had
  `strapi-plugin-data-ownership-guard` in dependencies but never wired it
  up. Removed in the same change that introduced this pattern; we prefer
  not to depend on a one-maintainer plugin for our auth boundary.

---

## Security caveats

- **Don't bypass the factory in custom code.** If you call
  `strapi.documents(uid).update({ documentId, ... })` from a service or a
  custom controller action without `assertDocumentOwned`, you've created an
  IDOR (insecure direct object reference) bug. Use the helper.

- **Don't trust `data.user` from the request body.** The factory overwrites
  it on create and update; if you bypass the factory, you're on the hook.

- **404 vs 403 is intentional.** Returning 403 ("you don't own this") leaks
  the fact that the row exists. 404 ("not found") doesn't.

- **The factory doesn't protect resources that don't have a `user`
  relation.** If the schema doesn't have one (and there's no transitive
  chain), the factory's create/update will populate a `user` field that
  doesn't exist and Strapi will reject — *fail loud*. But the find filter
  silently returns nothing rather than erroring, which is confusing during
  setup. Make sure the relation is present before wiring the factory in.

- **Currently scoped APIs** — see this directory's siblings in
  [`../api/`](../api/) where the `user-` prefix indicates owner-scoped data.
  Keep that naming convention so future maintainers know to use the factory.
