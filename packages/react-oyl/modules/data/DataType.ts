import { type AsyncState } from "@/lib/useAsync";

export type DataType<T, P> = {
  get: (id: string) => AsyncState<T, P>;
  find: () => AsyncState<T, P>;
  save: (data: T) => AsyncState<void, [T]>;
}