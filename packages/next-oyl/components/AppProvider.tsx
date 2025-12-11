'use client';

import React, { createContext, useState, useEffect } from 'react';

type AppContext = {
  offline: boolean,
  setOffline: (v: boolean) => void
}

const defaultAppContext: AppContext = {
  offline: true,
  setOffline: () => {}
};

export const context = createContext<AppContext>(defaultAppContext);

const Provider = context.Provider;

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState<boolean>(true);

  return <Provider value={{
    offline,
    setOffline
  }}>
    {children}
  </Provider>
}