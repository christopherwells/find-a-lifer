import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLifeList } from '../contexts/LifeListContext'
import { openFilePicker, processCSVFile, type CSVImportResult } from '../lib/csvImport'
import StarterChecklist from './StarterChecklist'

interface OnboardingOverlayProps {
  onComplete: () => void
  onImportComplete?: (newCount: number) => void
}

type OverlayMode = 'slides' | 'quickstart' | 'import'

const slides = [
  {
    title: 'Welcome to Find-A-Lifer!',
    body: "Discover bird species you've never seen \u2014 your 'lifers' \u2014 and plan trips to find them.",
    icon: '\uD83D\uDD2D', // binoculars
  },
  {
    title: 'Explore the Map',
    body: 'The heatmap shows bird diversity across North America by week. Brighter colors mean more lifers to find. Use the week slider to see how species distributions change throughout the year.',
    icon: '\uD83D\uDDFA\uFE0F', // map
  },
  {
    title: 'Get Started',
    body: 'Choose how you want to start:',
    icon: null,
  },
]

export default function OnboardingOverlay({ onComplete, onImportComplete }: OnboardingOverlayProps) {
  const [mode, setMode] = useState<OverlayMode>('slides')
  const [currentSlide, setCurrentSlide] = useState(0)
  const touchStartRef = useRef<number | null>(null)

  // Import state
  const { importSpeciesList } = useLifeList()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((s) => s + 1)
    }
  }, [currentSlide])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onComplete])

  // Touch swipe support (slides mode only)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== 'slides') return
    touchStartRef.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (mode !== 'slides') return
    if (touchStartRef.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current
    touchStartRef.current = null

    if (Math.abs(dx) < 50) return
    if (dx < 0 && currentSlide < slides.length - 1) {
      setCurrentSlide((s) => s + 1)
    } else if (dx > 0 && currentSlide > 0) {
      setCurrentSlide((s) => s - 1)
    }
  }

  const handleImportClick = async () => {
    if (importing) return
    const file = await openFilePicker()
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      const result = await processCSVFile(file, importSpeciesList)
      setImportResult(result)
      if (result.newCount > 0 && onImportComplete) onImportComplete(result.newCount)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // --- Quick Start mode ---
  if (mode === 'quickstart') {
    return createPortal(
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4"
        onClick={onComplete}
        data-testid="onboarding-overlay"
      >
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          data-testid="onboarding-card"
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setMode('slides')}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              data-testid="onboarding-back"
              aria-label="Back to slides"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <h2 className="text-base font-bold text-[#2C3E7B] dark:text-blue-300">Quick Start</h2>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <StarterChecklist onDismiss={onComplete} />
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // --- Import mode ---
  if (mode === 'import') {
    return createPortal(
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4"
        onClick={onComplete}
        data-testid="onboarding-overlay"
      >
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          data-testid="onboarding-card"
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <button
              onClick={() => { setMode('slides'); setImportResult(null); setImportError(null) }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              data-testid="onboarding-back"
              aria-label="Back to slides"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <h2 className="text-base font-bold text-[#2C3E7B] dark:text-blue-300">Import from eBird</h2>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-4">
            {!importResult ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    How to download your life list:
                  </p>
                  <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 ml-1">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-[#2C3E7B] dark:text-blue-400 flex-shrink-0">1.</span>
                      <span>
                        Go to{' '}
                        <a
                          href="https://ebird.org/lifelist"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2C3E7B] dark:text-blue-400 underline font-medium"
                          data-testid="onboarding-ebird-link"
                        >
                          ebird.org/lifelist
                        </a>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-[#2C3E7B] dark:text-blue-400 flex-shrink-0">2.</span>
                      <span>Click <span className="font-medium">&quot;Download (CSV)&quot;</span> at the top of the page</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-[#2C3E7B] dark:text-blue-400 flex-shrink-0">3.</span>
                      <span>Save the file, then select it below</span>
                    </li>
                  </ol>
                </div>

                <button
                  onClick={handleImportClick}
                  disabled={importing}
                  className={`w-full py-2.5 px-4 font-semibold text-sm rounded-lg transition-colors ${
                    importing
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                      : 'bg-[#2C3E7B] hover:bg-[#243267] text-white'
                  }`}
                  data-testid="onboarding-import-csv"
                >
                  {importing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Importing...
                    </span>
                  ) : (
                    'Select CSV File'
                  )}
                </button>

                {importError && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-700 dark:text-red-400">
                      <span className="font-medium">Error:</span> {importError}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center space-y-3" data-testid="onboarding-import-success">
                <div className="text-3xl">🎉</div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Import complete!
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {importResult.matched} of {importResult.total} species matched.
                  {importResult.newCount > 0 && (
                    <span className="block mt-1 font-medium text-green-700 dark:text-green-400">
                      {importResult.newCount} new species added to your life list.
                    </span>
                  )}
                  {importResult.existingCount > 0 && (
                    <span className="block text-gray-500 dark:text-gray-400">
                      {importResult.existingCount} already in your list.
                    </span>
                  )}
                </p>
                <button
                  onClick={onComplete}
                  className="w-full py-2.5 px-4 bg-[#2C3E7B] hover:bg-[#243267] text-white font-semibold text-sm rounded-lg transition-colors"
                  data-testid="onboarding-import-done"
                >
                  Start Exploring
                </button>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // --- Slides mode (default) ---
  const slide = slides[currentSlide]

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4"
      onClick={onComplete}
      data-testid="onboarding-overlay"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-testid="onboarding-card"
      >
        {/* Slide content */}
        <div className="px-6 pt-8 pb-4 text-center">
          {slide.icon && (
            <div className="text-5xl mb-4" aria-hidden="true">{slide.icon}</div>
          )}
          <h2 className="text-xl font-bold text-[#2C3E7B] dark:text-blue-300 mb-3">
            {slide.title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {slide.body}
          </p>
        </div>

        {/* CTAs for final slide */}
        {currentSlide === slides.length - 1 && (
          <div className="px-6 pb-2 flex flex-col gap-2.5">
            <button
              onClick={() => setMode('quickstart')}
              className="w-full py-2.5 px-4 bg-[#2C3E7B] hover:bg-[#243267] text-white font-semibold text-sm rounded-lg transition-colors"
              data-testid="onboarding-quick-start"
            >
              Quick Start Checklist
            </button>
            <button
              onClick={() => setMode('import')}
              className="w-full py-2.5 px-4 border border-[#2C3E7B] dark:border-blue-500 text-[#2C3E7B] dark:text-blue-400 hover:bg-[#2C3E7B]/10 dark:hover:bg-blue-500/10 font-semibold text-sm rounded-lg transition-colors"
              data-testid="onboarding-import-life-list"
            >
              Import from eBird
            </button>
            <button
              onClick={onComplete}
              className="w-full py-2 px-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors"
              data-testid="onboarding-just-explore"
            >
              Just Explore
            </button>
          </div>
        )}

        {/* Bottom controls */}
        <div className="px-6 py-4 flex items-center justify-between">
          {/* Skip button */}
          <button
            onClick={onComplete}
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            data-testid="onboarding-skip"
          >
            Skip
          </button>

          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentSlide
                    ? 'bg-[#2C3E7B] dark:bg-blue-400 w-4'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                aria-label={`Go to slide ${i + 1}`}
                data-testid={`onboarding-dot-${i}`}
              />
            ))}
          </div>

          {/* Next button (only on slides 0 and 1) */}
          {currentSlide < slides.length - 1 ? (
            <button
              onClick={handleNext}
              className="text-sm font-semibold text-[#2C3E7B] dark:text-blue-400 hover:text-[#1a2a5e] dark:hover:text-blue-300 transition-colors"
              data-testid="onboarding-next"
            >
              Next
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
