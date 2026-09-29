export default function Logo({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <rect x="8" y="8" width="7" height="16" rx="2" className="logo-cut" />
      <rect x="17" y="8" width="7" height="7" rx="2" className="logo-cut" opacity=".8" />
      <rect x="17" y="17" width="7" height="7" rx="2" className="logo-cut" opacity=".5" />
    </svg>
  )
}
