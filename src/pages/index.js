import { CalendarDays, Dumbbell, FlaskConical, LayoutDashboard, Trophy } from 'lucide-react'

/**
 * Top-level pages, shown as tabs in the top bar (in this order). To add a page:
 * add an entry here and render it in Workspace. `shareable` pages can be
 * granted to share links (Sharing → tools); the server must enforce access for
 * any data a shareable page uses (see api/share.js).
 */
export const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shareable: false },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, shareable: true },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell, shareable: false },
  { id: 'competitions', label: 'Competitions', icon: Trophy, shareable: false },
  { id: 'testing', label: 'Testing', icon: FlaskConical, shareable: false },
]

export const PAGE_IDS = PAGES.map((p) => p.id)
export const SHAREABLE_PAGES = PAGES.filter((p) => p.shareable)
