import { createContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useRequest } from './useRequest';
import { getItem, setItem, removeItem } from '../utils/storage';

type AuthContext = {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  apiToken: string | null;
  user: { id: number; username: string; email: string } | null;
  signIn: (identifier: string, password: string) => void;
  signUp: (email: string, firstName: string, lastName: string, birthdate: string, password: string) => void;
  signOut: () => void;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3337/api';

export const context = createContext<AuthContext | null>(null);

const Provider = context.Provider;

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: number; username: string; email: string } | null>(null);
  const router = useRouter();
  const loginRequest = useRequest<{ jwt: string; user: { id: number; username: string; email: string } }>(
    `${API_URL}/auth/local`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
  });
  const signupRequest = useRequest<{ jwt: string; user: { id: number; username: string; email: string } }>(
    `${API_URL}/auth/local/register`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
  });

  const isAuthenticated = !!apiToken;
  const isAuthenticating = loginRequest.loading || signupRequest.loading;

  const signIn = useCallback(async (identifier: string, password: string) => {
    await loginRequest.send({
      data: {
        identifier,
        password,
      },
    });
    if (loginRequest.error) {
      throw loginRequest.error;
    }
  }, []);

  const signUp = useCallback(async (email: string, firstName: string, lastName: string, birthdate: string, password: string) => {
    await signupRequest.send({
      data: {
        email,
        firstName,
        lastName,
        birthdate,
        password,
      },
    });
  }, []);

  const signOut = useCallback(() => {
    setApiToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (loginRequest.data?.jwt) {
      setApiToken(loginRequest.data.jwt);
    }
    if (loginRequest.data?.user) {
      setUser(loginRequest.data.user);
    }
  }, [loginRequest.data]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated]);

  return <Provider value={{
    isAuthenticated,
    isAuthenticating,
    apiToken,
    user,
    signIn,
    signUp,
    signOut,
  }}>{children}</Provider>;
}