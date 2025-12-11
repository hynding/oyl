import { type DataType } from './DataType';

export function useDataLocal<T>(model: string): DataType<T> {
  return {
    get: (id: string) => ({} as T),
    find: () => ([] as T[]),
    save: (data: T) => {}
  };
}