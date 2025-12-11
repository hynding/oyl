import { useApp } from '@/modules/app';
import type { DataType } from './DataType';
import { useDataLocal } from './useDataLocal';
import { useDataRemote } from './useDataRemote';

export function useData<T, P>(path: string): DataType<T, P> {
  const { offline } = useApp();
  const localData = useDataLocal<T>(path)
  const remoteData = useDataRemote<T, P>(path);

  return offline ? localData : remoteData;
}
