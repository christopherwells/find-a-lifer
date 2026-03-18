import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  /** The tooltip text to display */
  content: string
  /** Optional additional class for the trigger wrapper */
  className?: string
}

/**
 * Info icon (ⓘ) that shows a tooltip on hover (desktop) or tap (mobile).
 * Renders tooltip via portal to avoid overflow clipping.
 */
export default function Tooltip({ content, className = '' }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<number | null>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = 240 // max-w-60 = 240px
    const tooltipHeight = 80 // estimate

    // Default: above the trigger, centered
    let top = rect.top - tooltipHeight - 6
    let left = rect.left + rect.width / 2 - tooltipWidth / 2

    // If tooltip would go above viewport, show below
    if (top < 8) {
      top = rect.bottom + 6
    }

    // Clamp horizontal to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8))

    setPosition({ top, left })
  }, [])

  const open = useCallback(() => {
    updatePosition()
    setIsOpen(true)
  }, [updatePosition])

  const close = useCallback(() => {
    setIsOpen(false)
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }, [])

  // Desktop hover handlers
  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = window.setTimeout(open, 200)
  }, [open])

  const handleMouseLeave = useCallback(() => {
    close()
  }, [close])

  // Mobile tap handler
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isOpen) {
        close()
      } else {
        open()
      }
    },
    [isOpen, open, close]
  )

  // Close on outside click (mobile)
  useEffect(() => {
    if (!isOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        close()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen, close])

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return
    const handleScroll = () => close()
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [isOpen, close])

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full
          text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
          bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
          transition-colors cursor-help flex-shrink-0 ${className}`}
        aria-label="More info"
        data-testid="tooltip-trigger"
      >
        i
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            data-testid="tooltip-content"
            className="fixed z-[60] max-w-60 px-3 py-2 text-xs leading-relaxed text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-lg shadow-lg pointer-events-none animate-in fade-in duration-150"
            style={{ top: position.top, left: position.left }}
          >
            {content}
            {/* Arrow — positioned centrally below tooltip */}
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-800 dark:bg-gray-700 rotate-45" />
          </div>,
          document.body
        )}
    </>
  )
}
