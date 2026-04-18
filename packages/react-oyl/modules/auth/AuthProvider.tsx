'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../app/useApp'
import { Provider } from './auth-context'

const localApiToken = window?.localStorage?.getItem('apiToken') ?? null

function isJWTExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp ? payload.exp * 1000 : 0; // Convert to milliseconds
    if (new Date(exp).getTime() < Date.now()) {
      return true;
    }
    return false;
  } catch (e) {
    console.error('Invalid JWT token:', e);
    return true;
  }
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { offline } = useApp()
  const [apiToken, setApiToken] = useState<string | null>(localApiToken);
  const [user, setUser] = useState<{ id: number; username: string; email: string } | null>(null);

  const tokenExpired = apiToken ? isJWTExpired(apiToken) : true;
  if (tokenExpired) {
    localStorage.removeItem('apiToken');
  }
  const isAuthenticated = !!apiToken && !tokenExpired;

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