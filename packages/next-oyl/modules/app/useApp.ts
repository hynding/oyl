'use client';

import { useContext } from 'react'
import context from './app-context'

export function useApp() {
  return useContext(context)
}