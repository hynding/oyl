import type { ReactNode } from 'react'

type Props<T> = {
  items: T[]
  renderItem: (item: T) => ReactNode
  emptyMessage?: ReactNode
  className?: string
}

const DEFAULT_EMPTY = 'No goals.'

export default function UserGoalsList<T>({
  items,
  renderItem,
  emptyMessage = DEFAULT_EMPTY,
  className = 'space-y-3',
}: Props<T>) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
  }
  return <div className={className}>{items.map(renderItem)}</div>
}
