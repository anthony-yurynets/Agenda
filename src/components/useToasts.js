import { useCallback, useRef, useState } from 'react'

export function useToasts() {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message, kind = 'info') => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-3), { id, message, kind }])
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 2500)
    },
    [dismiss],
  )
  return { toasts, push, dismiss }
}

