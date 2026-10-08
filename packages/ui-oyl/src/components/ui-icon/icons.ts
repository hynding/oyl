/**
 * Outline glyphs on a 24×24 grid, stroke-based (currentColor, width 2, round caps/joins).
 * Paths are from Tabler Icons — MIT License, Copyright (c) 2020-2024 Paweł Kuna
 * (https://github.com/tabler/tabler-icons). Keep this map small: nav tabs, notices,
 * and a few controls. Screen-specific glyphs belong in the app.
 */
export const ICONS = {
  journal: 'M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1zM13 8l2 0M13 12l2 0M9 4v16M5 8h4M5 12h4M5 16h4',
  planner: 'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12zM16 3v4M8 3v4M4 11h16M11 15h1M12 15v3',
  nutrition: 'M12 14l0 -4M12 10a3 3 0 0 1 3 -3h1.5M7 10.5c1.5 -1.5 3.5 -1.5 5 0c1.5 -1.5 3.5 -1.5 5 0c0 5 -2.5 8.5 -5 8.5c-2.5 0 -5 -3.5 -5 -8.5z',
  finance: 'M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12M20 12v4h-4a2 2 0 0 1 0 -4h4',
  goals: 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
  vault: 'M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6zM11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0M8 11v-4a4 4 0 1 1 8 0v4',
  insights: 'M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1zM15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1zM9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1zM4 20h14',
  status: 'M3 12h4l3 8l4 -16l3 8h4',
  profile: 'M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2',
  info: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M12 9h.01M11 12h1v4h1',
  check: 'M5 12l5 5l10 -10',
  warning: 'M12 9v4M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0zM12 16h.01',
  danger: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0M12 8v4M12 16h.01',
  close: 'M18 6l-12 12M6 6l12 12',
  plus: 'M12 5l0 14M5 12l14 0',
  'chevron-left': 'M15 6l-6 6l6 6',
  'chevron-right': 'M9 6l6 6l-6 6',
  menu: 'M4 6l16 0M4 12l16 0M4 18l16 0',
} as const satisfies Record<string, string>

export type IconName = keyof typeof ICONS
export const ICON_NAMES = Object.keys(ICONS) as IconName[]
