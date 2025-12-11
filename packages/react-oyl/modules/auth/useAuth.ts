'use client';

import { useContext } from 'react'
import { context } from './auth-context'

export default function useAuth() {
  return useContext(context)
}