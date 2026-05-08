import { create } from 'zustand'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Toast) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => set(s => ({ toasts: [...s.toasts, toast] })),
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

export function useToast() {
  const { addToast, removeToast } = useToastStore()

  const toast = (type: Toast['type'], message: string, duration = 3000) => {
    const id = Math.random().toString(36).slice(2)
    addToast({ id, type, message })
    setTimeout(() => removeToast(id), duration)
  }

  return { toast }
}
