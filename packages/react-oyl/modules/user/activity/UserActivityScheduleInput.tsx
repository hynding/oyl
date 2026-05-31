// packages/react-oyl/modules/user/activity/UserActivityScheduleInput.tsx
import { useState } from 'react'
import type { TSchedule } from '@oyl/all-of-oyl/modules'
import { describeSchedule } from '@oyl/all-of-oyl/modules'

type Props = {
  value: TSchedule | undefined
  onChange: (next: TSchedule | undefined) => void
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/**
 * Ensures every emitted rrule string has a DTSTART anchor.
 * Without DTSTART the `rrule` library defaults dtstart to "now", which makes
 * rule.between(startOfDay, endOfDay) return zero matches for past dates and
 * silently breaks the daily orchestrator.
 */
function withDtStart(rrule: string): string {
  if (rrule.includes('DTSTART=')) return rrule
  return `DTSTART=20200101T000000Z;${rrule}`
}

export default function UserActivityScheduleInput({ value, onChange }: Props) {
  const [mode, setMode] = useState<'preset' | 'raw'>('preset')
  const [days, setDays] = useState<string[]>(['MO', 'TU', 'WE', 'TH', 'FR'])
  const [raw, setRaw] = useState(value?.rrule ?? '')

  const apply = (rrule: string) => onChange(rrule ? { rrule: withDtStart(rrule) } : undefined)
  const toggleDay = (d: string) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d]
    setDays(next)
    apply(`FREQ=WEEKLY;BYDAY=${next.join(',')}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-sm">
        <button type="button" className={`px-2 py-1 rounded ${mode === 'preset' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setMode('preset')}>Presets</button>
        <button type="button" className={`px-2 py-1 rounded ${mode === 'raw' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setMode('raw')}>Raw RRULE</button>
      </div>

      {mode === 'preset' && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="px-2 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700" onClick={() => apply('FREQ=DAILY')}>Daily</button>
            <button type="button" className="px-2 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700" onClick={() => { setDays(['MO','TU','WE','TH','FR']); apply('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') }}>Weekdays</button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {DAYS.map(d => (
              <button key={d} type="button"
                className={`w-9 h-9 rounded text-sm ${days.includes(d) ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                onClick={() => toggleDay(d)}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {mode === 'raw' && (
        <input
          type="text"
          value={raw}
          onChange={e => { setRaw(e.target.value); apply(e.target.value) }}
          placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 text-sm font-mono"
        />
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">{describeSchedule(value)}</p>
    </div>
  )
}
