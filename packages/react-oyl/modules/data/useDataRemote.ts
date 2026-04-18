import { useCallback } from 'react'
import useAsync from '@/lib/useAsync';
import useAuth from '@/modules/auth/useAuth';

type FetchProps = {
  domain: string;
  apiToken: string | null;
  method?: string;
}

const authDataFetch = async <T>(props: FetchProps): Promise<T> => {
  const { domain, apiToken, method = 'GET' } = props;
  const res = await fetch(`http://localhost:3337/api/${domain}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`
    }
  })
  if (res.ok) {
    const data = await res.json()
    return data
  } else {
    throw new Error('Failed to fetch data')
  }
}

export function useDataRemote<T, P>(domain: string) {
  const { apiToken } = useAuth()

  const getRequestFn = useCallback(async (id: string) => {
    return await authDataFetch<T>({ domain: `${domain}/${id}`, apiToken })
  }, [domain, apiToken])
  const findRequestFn = useCallback(async () => {
    return await authDataFetch<T>({ domain, apiToken })
  }, [domain, apiToken])
  const saveRequestFn = useCallback(async () => {
    return await authDataFetch<T>({ domain, apiToken })
  }, [domain, apiToken])

  const getRequest = useAsync<T, string>(getRequestFn)
  const findRequest = useAsync<T, P>(findRequestFn)
  const saveRequest = useAsync<T, P>(saveRequestFn)
  return {
    get: getRequest,
    find: findRequest,
    save: saveRequest
  };
}
