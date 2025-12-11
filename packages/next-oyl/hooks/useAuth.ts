'use client';

import { useContext } from 'react'
import { context } from '../components/AuthProvider'

export default function useAuth() {
  return useContext(context)
}