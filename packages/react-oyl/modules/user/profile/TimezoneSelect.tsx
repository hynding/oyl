import { useMemo } from 'react'
import { Autocomplete, type AutocompleteOption } from '@oyl/storybook-oyl'
import { formatTimezoneOffset } from './timezone-utils'

function buildOptions(): AutocompleteOption[] {
  return Intl.supportedValuesOf('timeZone').map((tz) => {
    const offset = formatTimezoneOffset(tz)
    return {
      value: tz,
      label: tz,
      description: offset ? `UTC${offset}` : undefined,
    }
  })
}

export interface TimezoneSelectProps {
  value: string
  onChange: (tz: string) => void
  className?: string
}

export function TimezoneSelect({ value, onChange, className }: TimezoneSelectProps) {
  const options = useMemo(buildOptions, [])
  return (
    <Autocomplete
      options={options}
      initialValue={value}
      placeholder="Search timezone..."
      className={className}
      minLength={1}
      onSelect={(opt) => onChange(opt.value)}
    />
  )
}
