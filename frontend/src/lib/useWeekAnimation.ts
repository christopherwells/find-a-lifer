import { useState, useEffect, useRef, useCallback } from 'react'

export function useWeekAnimation(currentWeek: number, onWeekChange?: (week: number) => void) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [showWrapIndicator, setShowWrapIndicator] = useState(false)
  const animationIntervalRef = useRef<number | null>(null)
  const currentWeekRef = useRef(currentWeek)

  useEffect(() => {
    currentWeekRef.current = currentWeek
  }, [currentWeek])

  const startAnimation = useCallback(() => {
    if (animationIntervalRef.current !== null) return
    setIsAnimating(true)
    const step = () => {
      const current = currentWeekRef.current
      const nextWeek = current >= 52 ? 1 : current + 1
      const isWrapping = current >= 52
      onWeekChange?.(nextWeek)
      if (isWrapping) setShowWrapIndicator(true)
      animationIntervalRef.current = window.setTimeout(() => {
        if (isWrapping) setShowWrapIndicator(false)
        step()
      }, isWrapping ? 1500 : 1000)
    }
    step()
  }, [onWeekChange])

  const stopAnimation = useCallback(() => {
    if (animationIntervalRef.current !== null) {
      clearTimeout(animationIntervalRef.current)
      animationIntervalRef.current = null
    }
    setIsAnimating(false)
    setShowWrapIndicator(false)
  }, [])

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current !== null) {
        clearTimeout(animationIntervalRef.current)
      }
    }
  }, [])

  return { isAnimating, showWrapIndicator, startAnimation, stopAnimation }
}
