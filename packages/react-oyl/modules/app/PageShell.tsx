import type { ReactNode } from 'react'

export default function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 py-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        {children}
      </div>
    </div>
  )
}
