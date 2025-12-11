'use client';

import { useContext } from 'react'
import { context } from '../components/AppProvider'

export default function useApp() {
  return useContext(context)
}