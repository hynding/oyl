import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { ListBox } from '../containers'

export interface AutocompleteOption {
  value: string
  label: string
  description?: string
  image?: string
}

export interface AutocompleteProps {
  options: AutocompleteOption[]
  placeholder?: string
  onSelect?: (option: AutocompleteOption) => void
  className?: string
  isLoading?: boolean
  onInputChange?: (value: string) => void
  minLength?: number
}

export const Autocomplete = ({
  options,
  placeholder = 'Search...',
  onSelect,
  className = '',
  isLoading = false,
  onInputChange,
  minLength = 0
}: AutocompleteProps) => {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const meetsMinLength = inputValue.length >= minLength

  const filteredOptions = onInputChange
    ? options
    : options.filter(option =>
        option.label.toLowerCase().includes(inputValue.toLowerCase())
      )

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlighted = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`)
      highlighted?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    setIsOpen(true)
    setHighlightedIndex(-1)
    onInputChange?.(value)
  }

  const handleOptionClick = (option: AutocompleteOption) => {
    setInputValue(option.label)
    setIsOpen(false)
    setHighlightedIndex(-1)
    onSelect?.(option)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && e.key !== 'Escape') {
      setIsOpen(true)
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleOptionClick(filteredOptions[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        inputRef.current?.blur()
        break
    }
  }

  const handleBlur = (e: React.FocusEvent) => {
    // Delay to allow click events to fire
    setTimeout(() => {
      if (!e.currentTarget.contains(document.activeElement)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }, 200)
  }

  return (
    <div className={`relative w-full ${className}`} onBlur={handleBlur}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="autocomplete-listbox"
        aria-activedescendant={
          highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined
        }
      />
      {isOpen && !meetsMinLength && minLength > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
          <div className="px-4 py-2 text-gray-500 dark:text-gray-400">
            Type at least {minLength} character{minLength !== 1 ? 's' : ''} to search
          </div>
        </div>
      )}
      {isOpen && meetsMinLength && isLoading && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
          <div className="px-4 py-2 text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </div>
        </div>
      )}
      {isOpen && meetsMinLength && !isLoading && filteredOptions.length > 0 && (
        <ListBox
          ref={listRef}
          id="autocomplete-listbox"
          options={filteredOptions}
          highlightedIndex={highlightedIndex}
          onOptionClick={handleOptionClick}
        />
      )}
      {isOpen && meetsMinLength && !isLoading && filteredOptions.length === 0 && inputValue && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
          <div className="px-4 py-2 text-gray-500 dark:text-gray-400">
            No results found
          </div>
        </div>
      )}
    </div>
  )
}