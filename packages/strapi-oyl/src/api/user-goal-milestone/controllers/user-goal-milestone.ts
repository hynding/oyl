// user-goal-milestone controller
//
// Ownership is transitive: a milestone belongs to whoever owns its parent
// user_goal. We tell the factory how to traverse the relation and it handles
// the rest (find filter, findOne/update/delete ownership check, and on create
// it verifies the referenced user_goal is itself owned by the caller).
//
// See src/utils/README.md for the pattern.

import { createUserScopedController } from '../../../utils/user-scoped-controller'

export default createUserScopedController(
  'api::user-goal-milestone.user-goal-milestone',
  { ownerPath: 'user_goal.user' },
)
