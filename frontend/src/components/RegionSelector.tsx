import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { SUB_REGIONS } from '../lib/subRegions'

/**
 * Shared region selector with header/subheader hierarchy.
 * Major regions (Canada, US, Mexico, Caribbean, Central America) as group headers.
 * Sub-regions listed under their parent with 44px+ touch targets.
 *
 * Mobile: opens a full-screen bottom-sheet modal with grouped scrollable list.
 * Desktop: opens the same modal (consistent behavior, avoids positioning issues).
 */

// Map sub-region IDs to their major region category
const MAJOR_REGIONS: { label: string; subRegionIds: string[] }[] = [
  { label: 'Canada', subRegionIds: ['ca-west', 'ca-central', 'ca-east', 'ca-north'] },
  { label: 'United States', subRegionIds: ['us-ne', 'us-se', 'us-mw', 'us-sw', 'us-west', 'us-rockies', 'us-ak', 'us-hi'] },
  { label: 'Mexico', subRegionIds: ['mx-north', 'mx-south'] },
  { label: 'Central America', subRegionIds: ['ca-c-north', 'ca-c-south'] },
  { label: 'Caribbean', subRegionIds: ['caribbean-greater', 'caribbean-lesser', 'atlantic-west'] },
]

// Build a lookup from sub-region ID to name (module-level, stable)
const subRegionMap = new Map(SUB_REGIONS.map(sr => [sr.id, sr.name]))

// Build a flat list of all items for the modal
type ModalItem =
  | { type: 'header'; label: string }
  | { type: 'option'; id: string; name: string }

const MODAL_ITEMS: ModalItem[] = []
for (const major of MAJOR_REGIONS) {
  MODAL_ITEMS.push({ type: 'header', label: major.label })
  for (const id of major.subRegionIds) {
    const name = subRegionMap.get(id)
    if (name) {
      MODAL_ITEMS.push({ type: 'option', id, name })
    }
  }
}

interface RegionSelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  testId?: string
  placeholder?: string
}

export default function RegionSelector({
  value,
  onChange,
  className = '',
  testId = 'region-selector',
  placeholder = 'All regions',
}: RegionSelectorProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Resolve the display name for the current value
  const displayName = value ? (subRegionMap.get(value) ?? value) : placeholder

  const handleSelect = useCallback((id: string) => {
    onChange(id)
    setOpen(false)
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange('')
    setOpen(false)
  }, [onChange])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  // Prevent body scroll when modal is open on mobile
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <>
      {/* Trigger button — styled to match the existing select appearance */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`text-left truncate flex items-center justify-between gap-1 ${className || 'w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${!value ? 'text-gray-400 dark:text-gray-500' : ''}`}>
          {displayName}
        </span>
        {/* Chevron down icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Modal — portalled to body */}
      {open && createPortal(
        <RegionModal
          value={value}
          placeholder={placeholder}
          onSelect={handleSelect}
          onClear={handleClear}
          onClose={() => { setOpen(false); triggerRef.current?.focus() }}
        />,
        document.body
      )}
    </>
  )
}

/** Full-screen modal with grouped region list */
function RegionModal({
  value,
  placeholder,
  onSelect,
  onClear,
  onClose,
}: {
  value: string
  placeholder: string
  onSelect: (id: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll to the selected item on mount
  useEffect(() => {
    if (!value || !listRef.current) return
    const el = listRef.current.querySelector(`[data-region-id="${value}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center' })
    }
  }, [value])

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/40"
      onClick={onClose}
    >
      {/* Modal panel — bottom-sheet on mobile, centered card on desktop */}
      <div
        className="
          mt-auto md:mt-auto md:mb-auto md:mx-auto
          w-full md:max-w-sm md:rounded-xl
          bg-white dark:bg-gray-900
          rounded-t-2xl md:rounded-b-xl
          shadow-2xl
          flex flex-col
          max-h-[85vh] md:max-h-[70vh]
          animate-sheet-up md:animate-none
        "
        onClick={(e) => e.stopPropagation()}
        role="listbox"
        aria-label="Select a region"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Select Region</h3>
          <button
            onClick={onClose}
            className="p-1 -m-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* "All regions" option */}
        <button
          onClick={onClear}
          className={`
            w-full text-left px-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0
            min-h-[44px]
            ${!value
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }
          `}
          role="option"
          aria-selected={!value}
        >
          {!value && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className="text-sm">{placeholder}</span>
        </button>

        {/* Scrollable grouped list */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          {MODAL_ITEMS.map((item, i) => {
            if (item.type === 'header') {
              return (
                <div
                  key={`header-${i}`}
                  className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 sticky top-0 bg-white dark:bg-gray-900"
                >
                  {item.label}
                </div>
              )
            }

            const isSelected = item.id === value
            return (
              <button
                key={item.id}
                data-region-id={item.id}
                onClick={() => onSelect(item.id)}
                className={`
                  w-full text-left px-4 pl-6 flex items-center gap-2
                  min-h-[44px]
                  transition-colors
                  ${isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700'
                  }
                `}
                role="option"
                aria-selected={isSelected}
              >
                {isSelected && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-sm">{item.name}</span>
              </button>
            )
          })}
          {/* Bottom padding for safe area on mobile */}
          <div className="h-6 md:h-2" />
        </div>
      </div>
    </div>
  )
}
