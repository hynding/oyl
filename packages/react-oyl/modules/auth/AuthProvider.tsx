'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../app/useApp'
import { Provider } from './auth-context'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { offline } = useApp()
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: number; username: string; email: string } | null>(null);

  const isAuthenticated = !!apiToken;

  console.log('Offline mode:', offline);

  const updateApiToken = (apiToken: string | null) => {
    setApiToken(apiToken);

    if (apiToken) {
      localStorage.setItem('apiToken', apiToken);
    } else {
      localStorage.removeItem('apiToken');
    }
  };

  const updateUser = (user: { id: number; username: string; email: string } | null) => {
    setUser(user);

    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }

  useEffect(() => {
    const storedToken = localStorage.getItem('apiToken');
    const storedUser = localStorage.getItem('user');

    if (storedToken) {
      setApiToken(storedToken);
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return <Provider value={{
    isAuthenticated,
    apiToken,
    user,
    updateApiToken,
    updateUser
  }}>
    {children}
  </Provider>
}