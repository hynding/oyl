import { useContext } from 'react'
import { context } from './user-daily-context'

export const useDailyProvider = () => useContext(context)