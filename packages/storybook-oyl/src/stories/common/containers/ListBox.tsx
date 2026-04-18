import { forwardRef } from 'react'

export interface ListBoxOption {
  value: string
  label: string
  description?: string
  image?: string
}

export interface ListBoxProps {
  options: ListBoxOption[]
  highlightedIndex?: number
  onOptionClick?: (option: ListBoxOption) => void
  id?: string
  className?: string
}

export const ListBox = forwardRef<HTMLDivElement, ListBoxProps>(
  ({ options, highlightedIndex = -1, onOptionClick, id, className = '' }, ref) => {
    return (
      <div
        ref={ref}
        id={id}
        role="listbox"
        className={`absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto ${className}`}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            data-index={index}
            id={`option-${index}`}
            role="option"
            aria-selected={index === highlightedIndex}
            onClick={() => onOptionClick?.(option)}
            className={`px-4 py-2 cursor-pointer transition-colors ${
              index === highlightedIndex
                ? 'bg-blue-500 text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              {option.image && (
                <img
                  src={option.image}
                  alt={option.label}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium">{option.label}</div>
                {option.description && (
                  <div
                    className={`text-sm ${
                      index === highlightedIndex
                        ? 'text-blue-100'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {option.description}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }
)

ListBox.displayName = 'ListBox'