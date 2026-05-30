import React from 'react';

type Props = {
  title: string;
  children?: React.ReactNode;
}

export function Section({
  title,
  children
}: Props) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </section>
  )
}