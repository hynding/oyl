import { useState } from 'react'

export default function useAsync<T, P>(asyncFunction: (...params: P[]) => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)

  const trigger = async (...params: P[]) => {
    setLoading(true)
    setError(null)
    try {
      const result = await asyncFunction(...params)
      setData(result)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  return { trigger, data, loading, error }
}