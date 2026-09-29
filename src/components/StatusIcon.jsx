import { CircleCheck, CircleDashed, CircleX, Clock } from 'lucide-react'

// 'none' (no status) renders nothing.

const ICONS = { planned: Clock, in_progress: CircleDashed, done: CircleCheck, canceled: CircleX }

export default function StatusIcon({ status, size = 14, className }) {
  if (status === 'none') return null
  const Icon = ICONS[status] ?? Clock
  return <Icon size={size} className={className} aria-hidden="true" />
}
