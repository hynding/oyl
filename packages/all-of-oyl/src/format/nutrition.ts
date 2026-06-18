import type { Nutrients } from '../nutrition/nutrients.js'

/** Compact summary: "150 kcal · 5g P · 27g C · 3g F" (+ water), "" when empty. */
export function formatNutrients(n: Nutrients): string {
  const parts: string[] = []
  if (n.calories !== undefined) parts.push(`${Math.round(n.calories)} kcal`)
  if (n.protein !== undefined) parts.push(`${Math.round(n.protein)}g P`)
  if (n.totalCarbohydrate !== undefined) parts.push(`${Math.round(n.totalCarbohydrate)}g C`)
  if (n.totalFat !== undefined) parts.push(`${Math.round(n.totalFat)}g F`)
  if (n.waterMl !== undefined) parts.push(`${Math.round(n.waterMl)} ml`)
  return parts.join(' · ')
}
