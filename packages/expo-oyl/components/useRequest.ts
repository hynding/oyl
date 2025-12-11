import axios from 'axios';
import { useState } from 'react';

import type { AxiosRequestConfig } from 'axios';

export function useRequest<T>(url: string, options?: AxiosRequestConfig) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const safeOptions: AxiosRequestConfig = {
    method: 'GET',
    ...options,
  }

  async function send(extraOptions?: AxiosRequestConfig) {
    try {
      setLoading(true);
      const response = await axios.request<T>({
        url,
        ...safeOptions,
        ...extraOptions,
      });
      console.log('extraOptions', extraOptions);
      console.log('response', response);
      setData(response.data);
    } catch (err) {
      console.log('err', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, error, send };
}

