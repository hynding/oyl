import type { DailyTotals } from './types'

function barColor(p: number): string {
  if (p < 1) return 'bg-green-500'
  if (p < 1.1) return 'bg-amber-500'
  return 'bg-red-500'
}

function Metric({ name, label, value, target, progress }: { name: string; label: string; value: number; target?: number; progress?: number }) {
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="text-sm text-gray-600 dark:text-gray-300">
        {label} {Math.round(value)}{target != null && <span className="text-gray-400"> / {Math.round(target)}</span>}
      </div>
      {progress != null && (
        <div className="h-1.5 rounded bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
          <div
            role="progressbar"
            aria-label={name}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={2}
            className={`h-full ${barColor(progress)}`}
            style={{ width: `${Math.min(1, progress) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function UserNutritionTotals({ totals }: { totals: DailyTotals }) {
  return (
    <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
      <Metric name="calories" label="kcal" value={totals.calories} target={totals.targets.calories} progress={totals.progress.calories} />
      <Metric name="protein" label="P" value={totals.protein} target={totals.targets.protein} progress={totals.progress.protein} />
      <Metric name="carbs" label="C" value={totals.carbs} target={totals.targets.carbs} progress={totals.progress.carbs} />
      <Metric name="fat" label="F" value={totals.fat} target={totals.targets.fat} progress={totals.progress.fat} />
    </div>
  )
}
