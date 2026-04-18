import { useApp } from '@/modules/app';
import { useDataLocal } from './useDataLocal';
import { useDataRemote } from './useDataRemote';

export function useData<T, P>(path: string) {
  const { offline } = useApp();
  const localData = useDataLocal<T, P>(path)
  const remoteData = useDataRemote<T, P>(path);

  return offline ? localData: remoteData
}
