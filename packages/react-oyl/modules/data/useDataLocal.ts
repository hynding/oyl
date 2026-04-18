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
  const getRequest = useAsync<T, string>(async (id) => {
    return await localStorageFetch<T>(`${storageKey}/${id}`);
  });

  const findRequest = useAsync<T, P>(async () => {
    return await localStorageFetch<T>(storageKey);
  });

  const saveRequest = useAsync<T, P>(async (data: P) => {
    return await localStorageSave<T>(storageKey, data as unknown as T);
  });

  return {
    get: getRequest,
    find: findRequest,
    save: saveRequest
  };
}
