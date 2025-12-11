import { useRequest } from './useRequest';
import type { AxiosRequestConfig } from 'axios';

export function useAuthRequest<T>(url: string, options?: AxiosRequestConfig) {
  return useRequest<T>(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  });
}