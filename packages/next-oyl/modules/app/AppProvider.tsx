'use client';

import React, { useState } from 'react';
import context from './app-context';

const Provider = context.Provider;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState<boolean>(true);

  return <Provider value={{
    offline,
    setOffline
  }}>
    {children}
  </Provider>
}