import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export type ToastType = 'success' | 'muted' | 'milestone' | 'group-complete' | 'import-summary'

export interface MilestoneShareData {
  count: number
  milestone: number
  percentComplete: number
}

export interface Toast {
  id: string
  type: ToastType
  message: string
  detail?: string
  duration?: number // ms, default 3000
  confetti?: boolean
  shareData?: MilestoneShareData
}

interface ToastContextValue {
  currentToast: Toast | null
  showToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: () => void
  celebrationsEnabled: boolean
  setCelebrationsEnabled: (enabled: boolean) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([])
  const [currentToast, setCurrentToast] = useState<Toast | null>(null)
  const [celebrationsEnabled, setCelebrationsEnabledState] = useState(() => {
    return localStorage.getItem('celebrationsEnabled') !== 'false'
  })

  const setCelebrationsEnabled = useCallback((enabled: boolean) => {
    setCelebrationsEnabledState(enabled)
    localStorage.setItem('celebrationsEnabled', String(enabled))
  }, [])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const newToast: Toast = { ...toast, id: crypto.randomUUID() }
    if (currentToast) {
      // Queue it
      setQueue(prev => [...prev, newToast])
    } else {
      setCurrentToast(newToast)
    }
  }, [currentToast])

  const dismissToast = useCallback(() => {
    setCurrentToast(null)
  }, [])

  // When current toast is dismissed, show next in queue
  useEffect(() => {
    if (!currentToast && queue.length > 0) {
      const timer = setTimeout(() => {
        setCurrentToast(queue[0])
        setQueue(prev => prev.slice(1))
      }, 300) // brief gap between toasts
      return () => clearTimeout(timer)
    }
  }, [currentToast, queue])

  // Auto-dismiss timer
  useEffect(() => {
    if (!currentToast) return
    const duration = currentToast.duration ?? 3000
    const timer = setTimeout(() => {
      setCurrentToast(null)
    }, duration)
    return () => clearTimeout(timer)
  }, [currentToast])

  return (
    <ToastContext.Provider value={{ currentToast, showToast, dismissToast, celebrationsEnabled, setCelebrationsEnabled }}>
      {children}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook must co-locate with Provider
export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
