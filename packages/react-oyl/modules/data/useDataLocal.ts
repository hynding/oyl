import { useCallback } from 'react'
import useAsync from '@/lib/useAsync';

const localStorageFetch = async <T>(key: string): Promise<T> => {
  const data = localStorage.getItem(key);
  if (data) {
    return JSON.parse(data) as T;
  }
  throw new Error(`No data found for key: ${key}`);
};

const localStorageSave = async <T>(key: string, value: T): Promise<T> => {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
};

export function useDataLocal<T, P>(storageKey: string) {
  const getRequestFn = useCallback(async (id: string) => {
    return await localStorageFetch<T>(`${storageKey}/${id}`);
  }, [storageKey])

  const findRequestFn = useCallback(async () => {
    return await localStorageFetch<T>(storageKey);
  }, [storageKey])

  const saveRequestFn = useCallback(async (data: P) => {
    return await localStorageSave<T>(storageKey, data as unknown as T);
  }, [storageKey])

  const getRequest = useAsync<T, string>(getRequestFn);
  const findRequest = useAsync<T, P>(findRequestFn);
  const saveRequest = useAsync<T, P>(saveRequestFn);

  return {
    get: getRequest,
    find: findRequest,
    save: saveRequest
  };
}
