import { useState, useCallback } from 'react'

/**
 * Typed localStorage hook with SSR-safe initialization.
 * Replaces scattered localStorage.getItem/setItem patterns.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      if (item === null) return defaultValue
      return JSON.parse(item) as T
    } catch {
      return defaultValue
    }
  })

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Storage full or unavailable — silently fail
        }
        return next
      })
    },
    [key]
  )

  return [storedValue, setValue]
}
