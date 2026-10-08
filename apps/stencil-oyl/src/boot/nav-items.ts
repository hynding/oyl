import type { NavItem } from '@oyl/ui-oyl'

/** The app's primary navigation: the eight screens, in OYL's order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { name: 'journal', href: '/journal', label: 'Journal', icon: 'journal' },
  { name: 'planner', href: '/planner', label: 'Planner', icon: 'planner' },
  { name: 'nutrition', href: '/nutrition', label: 'Nutrition', icon: 'nutrition' },
  { name: 'finance', href: '/finance', label: 'Finance', icon: 'finance' },
  { name: 'goals', href: '/goals', label: 'Goals', icon: 'goals' },
  { name: 'vault', href: '/vault', label: 'Vault', icon: 'vault' },
  { name: 'insights', href: '/insights', label: 'Insights', icon: 'insights' },
  { name: 'status', href: '/status', label: 'Status', icon: 'status' },
]
