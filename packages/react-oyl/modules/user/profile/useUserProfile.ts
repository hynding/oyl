import { useCallback, useEffect, useSyncExternalStore } from 'react';
import useAuth from '../../auth/useAuth';
import { createRemoteClient } from '../../data/useDataRemote';
import { detectBrowserTimezone } from './timezone-utils';

type StrapiProfile = {
  id: number;
  documentId: string;
  timezone?: string | null;
};

type State = {
  documentId: string | null;
  timezone: string;
  loading: boolean;
  error: string | null;
};

export type UseUserProfileResult = State & {
  setTimezone: (tz: string) => Promise<void>;
};

// Module-level singleton: the daily page mounts useUserProfile from multiple
// components (orchestrator + UserDailyNutrition). Without a shared store each
// instance would fire its own GET /user-profiles — doubled again in React
// StrictMode. The store keeps one fetch in flight per apiToken and broadcasts
// the result to every subscribed hook instance.
const initialState: State = {
  documentId: null,
  timezone: detectBrowserTimezone(),
  loading: false,
  error: null,
};

let state: State = initialState;
let loadedToken: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function load(token: string): Promise<void> {
  if (inflight && loadedToken === token) return inflight;
  loadedToken = token;
  setState({ ...state, loading: true, error: null });
  const client = createRemoteClient(() => token);
  const work = client
    .findAll<StrapiProfile>('user-profiles')
    .then((profiles) => {
      const profile = profiles[0];
      setState({
        documentId: profile?.documentId ?? null,
        timezone: profile?.timezone || state.timezone,
        loading: false,
        error: null,
      });
    })
    .catch((err: unknown) => {
      setState({
        ...state,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load profile',
      });
    })
    .finally(() => {
      inflight = null;
    });
  inflight = work;
  return work;
}

export function useUserProfile(): UseUserProfileResult {
  const { apiToken } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (!apiToken) return;
    if (loadedToken === apiToken && !state.loading) return;
    if (loadedToken !== apiToken) {
      // Token changed (login/logout) — reset cache before loading.
      loadedToken = null;
      setState(initialState);
    }
    load(apiToken);
  }, [apiToken]);

  const setTimezone = useCallback(
    async (tz: string) => {
      const previous = state.timezone;
      const documentId = state.documentId;
      setState({ ...state, timezone: tz, error: null });
      if (!documentId || !apiToken) return;
      const client = createRemoteClient(() => apiToken);
      try {
        await client.update<StrapiProfile>('user-profiles', documentId, { timezone: tz });
      } catch (err) {
        setState({
          ...state,
          timezone: previous,
          error: err instanceof Error ? err.message : 'Failed to save timezone',
        });
      }
    },
    [apiToken],
  );

  return { ...snapshot, setTimezone };
}

// Exposed for tests that need a clean slate between cases.
export function __resetUserProfileForTests(): void {
  state = initialState;
  loadedToken = null;
  inflight = null;
  listeners.clear();
}
