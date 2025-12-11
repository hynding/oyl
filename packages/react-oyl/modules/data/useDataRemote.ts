import useAsync from '@/lib/useAsync';
import useAuth from '@/modules/auth/useAuth';

type FetchProps = {
  domain: string;
  apiToken?: string;
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
  const getRequest = useAsync<T, string>(async (id) => {
    return await authDataFetch<T>({ domain: `${domain}/${id}`, apiToken })
  })
  const findRequest = useAsync<T, P>(async () => {
    return await authDataFetch<T>({ domain, apiToken })
  })
  const saveRequest = useAsync<T, P>(async () => {
    return await authDataFetch<T>({ domain, apiToken })
  })

  return {
    get: getRequest,
    find: findRequest,
    save: saveRequest
  };
}
