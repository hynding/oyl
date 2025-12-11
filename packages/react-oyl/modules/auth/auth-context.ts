import { createContext } from 'react'

type AuthContext = {
  isAuthenticated: boolean;
  apiToken?: string;
  user: { id: number; username: string; email: string } | null;
  updateApiToken: (token: string | null) => void;
  updateUser: (user: { id: number; username: string; email: string } | null) => void;
}

const defaultAuthContext: AuthContext = {
  isAuthenticated: false,
  user: null,
  updateApiToken: () => {},
  updateUser: () => {},
};

export const context = createContext<AuthContext>(defaultAuthContext);

export const Provider = context.Provider
