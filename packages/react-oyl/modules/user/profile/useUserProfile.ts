import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function useUserProfile(): UseUserProfileResult {
  const { apiToken } = useAuth();
  const tokenRef = useRef(apiToken);
  tokenRef.current = apiToken;

  const client = useMemo(
    () => createRemoteClient(() => tokenRef.current),
    [],
  );

  const [state, setState] = useState<State>({
    documentId: null,
    timezone: detectBrowserTimezone(),
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!apiToken) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    client
      .findAll<StrapiProfile>('user-profiles')
      .then((profiles) => {
        if (cancelled) return;
        const profile = profiles[0];
        setState((s) => ({
          ...s,
          documentId: profile?.documentId ?? null,
          timezone: profile?.timezone || s.timezone,
          loading: false,
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load profile',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [apiToken, client]);

  const setTimezone = useCallback(
    async (tz: string) => {
      const previous = state.timezone;
      setState((s) => ({ ...s, timezone: tz, error: null }));
      if (!state.documentId) return;
      try {
        await client.update<StrapiProfile>('user-profiles', state.documentId, { timezone: tz });
      } catch (err) {
        setState((s) => ({
          ...s,
          timezone: previous,
          error: err instanceof Error ? err.message : 'Failed to save timezone',
        }));
      }
    },
    [client, state.documentId, state.timezone],
  );

  return { ...state, setTimezone };
}
