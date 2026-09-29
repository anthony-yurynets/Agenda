import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export default function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{t.message}</span>
          <button className="icon-btn sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
