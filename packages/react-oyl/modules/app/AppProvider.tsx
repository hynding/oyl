import React, { useState } from 'react';
import context from './app-context';
import AuthProvider from '@/modules/auth/AuthProvider'

const Provider = context.Provider;

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState<boolean>(false);

  return (
    <Provider value={{
      offline,
      setOffline
    }}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </Provider>
  )
}