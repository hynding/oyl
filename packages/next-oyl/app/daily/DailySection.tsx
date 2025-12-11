'use client';

import React from 'react';

type Props = {
  title: string;
  children?: React.ReactNode;
}

export default function DailySection({
  title,
  children
}: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  )
}