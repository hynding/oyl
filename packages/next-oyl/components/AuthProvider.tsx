'use client';

import React, { createContext, useState, useEffect } from 'react';
import useApp from '../hooks/useApp'

type AuthContext = {
  isAuthenticated: boolean;
  apiToken: string | null;
  user: { id: number; username: string; email: string } | null;
  updateApiToken: (token: string | null) => void;
  updateUser: (user: { id: number; username: string; email: string } | null) => void;
}

const defaultAuthContext: AuthContext = {
  isAuthenticated: false,
  apiToken: null,
  user: null,
  updateApiToken: () => {},
  updateUser: () => {},
};

export const context = createContext<AuthContext>(defaultAuthContext);

const Provider = context.Provider;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { offline } = useApp()
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: number; username: string; email: string } | null>(null);

  const isAuthenticated = !!apiToken;

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