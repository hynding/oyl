'use client';

import { useContext, useMemo } from 'react'
import { context } from '../components/AuthProvider'
import { strapi } from '@strapi/client'

export default function useCMS() {
  const authContext = useContext(context)

  return useMemo(() => {
    return strapi({
      baseURL: 'http://localhost:3337/api',
      headers: {
        Authorization: `Bearer ${authContext.apiToken}`,
      },
    })

    // return {
    //   find: (contentType: string, params?: any) => client.find(contentType, params),
    //   findOne: (contentType: string, id: number | string, params?: any) => client.findOne(contentType, id, params),
    //   create: (contentType: string, data: any) => client.create(contentType, data),
    //   update: (contentType: string, id: number | string, data: any) => client.update(contentType, id, data),
    //   delete: (contentType: string, id: number | string) => client.delete(contentType, id),
    // }
  }, [authContext.apiToken])
}

  // return useMemo(() => {
  //   const baseURL = 'http://localhost:3337/api'

  //   const headers: Record<string, string> = {
  //     'Content-Type': 'application/json',
  //   }

  //   if (authContext.apiToken) {
  //     headers['Authorization'] = `Bearer ${authContext.apiToken}`
  //   }

  //   const request = async (endpoint: string, options: RequestInit = {}) => {
  //     const url = `${baseURL}/${endpoint}`
  //     const response = await fetch(url, {
  //       ...options,
  //       headers: {
  //         ...headers,
  //         ...options.headers,
  //       },
  //     })

  //     if (!response.ok) {
  //       throw new Error(`HTTP error! status: ${response.status}`)
  //     }

  //     return response.json()
  //   }

  //   return {
  //     find: (contentType: string, params?: any) => {
  //       const searchParams = new URLSearchParams()
  //       if (params) {
  //         searchParams.append('filters', params.filters || {})
  //         if (params.populate) {
  //           searchParams.append('populate', params.populate)
  //         }
  //       }
  //       return request(`${contentType}?${searchParams.toString()}`)
  //     },

  //     findOne: (contentType: string, id: number | string, params?: any) => {
  //       const searchParams = new URLSearchParams()
  //       if (params?.populate) {
  //         searchParams.append('populate', params.populate.join(','))
  //       }
  //       return request(`${contentType}/${id}?${searchParams.toString()}`)
  //     },

  //     create: (contentType: string, data: any) => {
  //       return request(contentType, {
  //         method: 'POST',
  //         body: JSON.stringify(data),
  //       })
  //     },

  //     update: (contentType: string, id: number | string, data: any) => {
  //       return request(`${contentType}/${id}`, {
  //         method: 'PUT',
  //         body: JSON.stringify(data),
  //       })
  //     },

  //     delete: (contentType: string, id: number | string) => {
  //       return request(`${contentType}/${id}`, {
  //         method: 'DELETE',
  //       })
  //     },
  //   }
  // }, [authContext.apiToken])
// }