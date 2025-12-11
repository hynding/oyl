export type DataType<T> = {
  get: () => T;
  find: () => T[];
  save: (data: T) => void;
}