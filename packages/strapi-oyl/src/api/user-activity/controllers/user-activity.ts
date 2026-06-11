// user-activity controller
//
// Owner-scoped via the shared factory. See src/utils/README.md.
//
// Before this wrap, the bare factory let `POST /api/user-activities` persist
// rows without a `user` relation (and `GET` returned every user's rows), which
// surfaced as ghost activities appearing on the daily page after a focus
// refresh — the aggregate enforced ownership while the bare REST did not.

import { createUserScopedController } from '../../../utils/user-scoped-controller'

export default createUserScopedController('api::user-activity.user-activity')
