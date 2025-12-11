import { useApp } from '@/modules/app';
import { DataType } from './DataType';
import { useDataLocal } from './useDataLocal';
import { useDataRemote } from './useDataRemote';

export function useData<T>(path: string): DataType<T> {
  const { offline } = useApp();
  const localData = useDataLocal<T>(path)
  const remoteData = useDataRemote<T>(path);

  return offline ? localData : remoteData;
}
