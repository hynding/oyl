/**
 * The token contract: the only custom-property names component CSS may reference.
 * Color values are written by the theme files; structural values by tokens.css.
 * Add a name here AND in tokens.css (or every theme file) together — the unit tests
 * in this folder fail on any mismatch.
 */
export const COLOR_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-2',
  '--color-text',
  '--color-muted',
  '--color-border',
  '--color-accent',
  '--color-accent-hover',
  '--color-on-accent',
  '--color-danger',
  '--color-warn',
  '--color-ok',
] as const

export const STRUCTURAL_TOKENS = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-6',
  '--space-8',
  '--radius-1',
  '--radius-2',
  '--radius-pill',
  '--font-sans',
  '--font-mono',
  '--step--1',
  '--step-0',
  '--step-1',
  '--step-2',
  '--focus-ring',
  '--size-control',
  '--line-1',
  '--line-2',
  '--dur-fast',
  '--dur-base',
  '--ease-out',
] as const

export const ALL_TOKENS: readonly string[] = [...COLOR_TOKENS, ...STRUCTURAL_TOKENS]

export type ColorToken = (typeof COLOR_TOKENS)[number]
export type StructuralToken = (typeof STRUCTURAL_TOKENS)[number]
