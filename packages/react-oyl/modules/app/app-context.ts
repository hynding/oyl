'use client';

import { createContext } from 'react';
import { type AppType as AppContext } from './AppType';

const defaultAppContext: AppContext = {
  offline: true,
  setOffline: () => {}
};

export default createContext<AppContext>(defaultAppContext);