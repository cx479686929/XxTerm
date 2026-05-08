import { useToastStore } from '../hooks/useToast'

const TOAST_ICONS: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
          <span>{TOAST_ICONS[t.type]}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <span style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}>✕</span>
        </div>
      ))}
    </div>
  )
}
