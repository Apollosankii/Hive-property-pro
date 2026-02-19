import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  title?: string
  message: string
  type?: ToastType
  duration?: number
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => string
  success: (msg: string, title?: string) => string
  error: (msg: string, title?: string) => string
  info: (msg: string, title?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const show = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const item: ToastItem = { id, duration: 7000, ...toast }
    setToasts((t) => [item, ...t])
    // Auto dismiss
    setTimeout(() => dismiss(id), item.duration)
    return id
  }, [dismiss])

  const success = useCallback((message: string, title?: string) => show({ message, title, type: 'success' }), [show])
  const error = useCallback((message: string, title?: string) => show({ message, title, type: 'error' }), [show])
  const info = useCallback((message: string, title?: string) => show({ message, title, type: 'info' }), [show])

  const value = useMemo(() => ({ show, success, error, info, dismiss }), [show, success, error, info, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toaster container - bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`w-full max-w-sm shadow-lg rounded-lg overflow-hidden transform transition-all duration-200`}>
            <div className={`px-4 py-3 flex gap-3 items-start ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-green-600 text-white' : 'bg-slate-800 text-white'}`}>
              <div className="flex-1">
                {t.title && <div className="font-semibold text-sm">{t.title}</div>}
                <div className="text-sm leading-snug mt-0.5">{t.message}</div>
              </div>
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-white opacity-80 hover:opacity-100">✕</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToastContext() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToastContext must be used within a ToastProvider')
  return ctx
}

export default ToastProvider
