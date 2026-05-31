// packages/react-oyl/modules/data/sync/instance.ts
import { SyncEngine } from './SyncEngine'
import { createRemoteClient } from '../useDataRemote'

let _tokenGetter: () => string | null = () => null

export const setSyncAuthTokenGetter = (fn: () => string | null) => { _tokenGetter = fn }

export const syncEngine = new SyncEngine(createRemoteClient(() => _tokenGetter()))
