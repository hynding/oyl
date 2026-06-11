'use client';

import React, { useState, useEffect, useRef } from 'react';
import useAuth from '@/modules/auth/useAuth';
import { useApp } from '@/modules/app/useApp';
import { syncEngine, setSyncAuthTokenGetter } from './instance';
import { wipeUser } from './storage';
import { SYNCED_PATHS } from './types';

// Skip per-path refetches that would land within FOCUS_MAX_AGE_MS of the last
// successful sync; collapse rapid focus bursts via FOCUS_DEBOUNCE_MS.
const FOCUS_MAX_AGE_MS = 30_000;
const FOCUS_DEBOUNCE_MS = 500;

const todayLocalIsoDate = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function SyncBootstrap({ children }: { children: React.ReactNode }) {
  const { user, apiToken } = useAuth();
  const { offline, setOffline } = useApp();
  const [seeded, setSeeded] = useState(false);
  const [lastUserId, setLastUserId] = useState<number | null>(null);

  // Keep the auth token getter current.
  useEffect(() => {
    setSyncAuthTokenGetter(() => apiToken);
  }, [apiToken]);

  // Wire online/offline events.
  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      syncEngine.setOnline(true);
    };
    const handleOffline = () => {
      setOffline(true);
      syncEngine.setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    syncEngine.setOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  // Bind user — wipe previous user data when user changes, seed mirror.
  useEffect(() => {
    const userId = user?.id ?? null;

    if (userId !== lastUserId) {
      if (lastUserId !== null) {
        wipeUser(String(lastUserId));
      }
      setLastUserId(userId);
      setSeeded(false);

      syncEngine.setUser(userId !== null ? String(userId) : null);

      if (userId !== null) {
        if (!offline) {
          // One batched call seeds every mirror path. Fall back to the per-path
          // fan-out if the aggregate endpoint failed or returned no mirror data
          // (older Strapi build, transient error, etc.).
          syncEngine
            .refreshAggregate(todayLocalIsoDate())
            .then(() => {
              const seededAny = SYNCED_PATHS.some(
                p => syncEngine.state().lastSyncedAtByPath[p],
              );
              if (!seededAny) {
                return syncEngine.refreshAll([...SYNCED_PATHS]);
              }
            })
            .finally(() => setSeeded(true));
        } else {
          setSeeded(true);
        }
      }
    }
  }, [user?.id, lastUserId, offline]);

  // Re-sync on window focus when online and authenticated. A short debounce
  // collapses rapid focus bursts and maxAgeMs lets refresh() short-circuit when
  // the per-path mirror is already fresh.
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handleFocus = () => {
      if (offline || !user?.id) return;
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        syncEngine
          .refreshAll([...SYNCED_PATHS], { maxAgeMs: FOCUS_MAX_AGE_MS })
          .catch(() => {});
      }, FOCUS_DEBOUNCE_MS);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [offline, user?.id]);

  if (user?.id && !seeded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading your data…
      </div>
    );
  }

  return <>{children}</>;
}
