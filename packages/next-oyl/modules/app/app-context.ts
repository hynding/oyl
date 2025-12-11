'use client';

import { createContext } from 'react';
import { AppType as AppContext } from './AppType';

const defaultAppContext: AppContext = {
  offline: true,
  setOffline: () => {}
};

export default createContext<AppContext>(defaultAppContext);