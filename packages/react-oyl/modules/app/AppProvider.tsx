import React, { useState } from 'react';
import context from './app-context';
import AuthProvider from '@/modules/auth/AuthProvider'
import SyncBootstrap from '@/modules/data/sync/SyncBootstrap'

const Provider = context.Provider;

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState<boolean>(!navigator.onLine);

  return (
    <Provider value={{
      offline,
      setOffline
    }}>
      <AuthProvider>
        <SyncBootstrap>
          {children}
        </SyncBootstrap>
      </AuthProvider>
    </Provider>
  )
}