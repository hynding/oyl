'use client';

import React, { useState, useEffect } from 'react';
import useAuth from '@/modules/auth/useAuth';
import { useApp } from '@/modules/app/useApp';
import { syncEngine, setSyncAuthTokenGetter } from './instance';
import { wipeUser } from './storage';
import { SYNCED_PATHS } from './types';

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
          syncEngine.refreshAll([...SYNCED_PATHS]).finally(() => setSeeded(true));
        } else {
          setSeeded(true);
        }
      }
    }
  }, [user?.id, lastUserId, offline]);

  // Re-sync on window focus when online and authenticated.
  useEffect(() => {
    const handleFocus = () => {
      if (!offline && user?.id) {
        syncEngine.refreshAll([...SYNCED_PATHS]).catch(() => {});
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
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
