import { DataType } from './DataType';

export function useDataLocal<T>(model: string): DataType<T> {
  return {
    get: () => ({} as T),
    find: () => ([] as T[]),
    save: (data: T) => {}
  };
}