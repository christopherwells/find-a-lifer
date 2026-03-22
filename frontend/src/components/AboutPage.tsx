import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface AboutPageProps {
  onClose: () => void
}

export default function AboutPage({ onClose }: AboutPageProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      data-testid="about-page-overlay"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="about-page"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold text-[var(--color-brand)] dark:text-blue-300">About Find-A-Lifer</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="Close about page"
            data-testid="about-page-close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* What is Find-A-Lifer? */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">What is Find-A-Lifer?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Find-A-Lifer helps birders discover species they've never seen by combining eBird citizen science data with interactive maps.
            </p>
          </section>

          {/* Coverage */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">Coverage</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Find-A-Lifer covers <strong className="text-gray-700 dark:text-gray-300">13 countries</strong> across North America and the Caribbean, with data on over{' '}
              <strong className="text-gray-700 dark:text-gray-300">2,150+ species</strong>. The data is updated from the eBird Basic Dataset and processed into 52 weekly snapshots across three resolution levels of hexagonal map cells.
            </p>
          </section>

          {/* How the data works */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">How the Data Works</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Bird sightings from millions of eBird checklists are aggregated into hexagonal map cells for each week of the year.
              The heatmap shows reporting frequency &mdash; how often each species appears in checklists from that area.
            </p>
          </section>

          {/* Responsible Birding */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Responsible Birding</h3>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-2">
                Please bird responsibly when pursuing lifers:
              </p>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1.5 ml-1">
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  Do not trespass or enter restricted areas
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  Maintain distance from nests and roosting sites
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  Keep noise levels low and stay on marked trails
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  Report rare species responsibly
                </li>
              </ul>
              <a
                href="https://www.aba.org/aba-code-of-birding-ethics/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2.5 text-sm text-[var(--color-brand)] underline hover:text-[#1a2a5e] dark:hover:text-blue-300 font-medium"
                data-testid="about-aba-link"
              >
                ABA Code of Birding Ethics
              </a>
            </div>
          </section>

          {/* Data Citation */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">Data Citation</h3>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic">
                eBird Basic Dataset. Version: EBD_relDec-2024. Cornell Lab of Ornithology, Ithaca, New York.{' '}
                <a href="https://ebird.org" target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline">ebird.org</a>
              </p>
            </div>
          </section>

          {/* Credits */}
          <section>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5">Credits</h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>
                <span className="font-medium text-gray-700 dark:text-gray-300">eBird</span> &mdash; Cornell Lab of Ornithology
              </li>
              <li>
                <span className="font-medium text-gray-700 dark:text-gray-300">IUCN Red List</span> &mdash; via Wikidata
              </li>
              <li>
                <span className="font-medium text-gray-700 dark:text-gray-300">GeoNames</span> &mdash; city data
              </li>
              <li>
                <span className="font-medium text-gray-700 dark:text-gray-300">MapLibre GL JS</span> &mdash; map rendering
              </li>
              <li>
                <span className="font-medium text-gray-700 dark:text-gray-300">H3</span> &mdash; hexagonal grid by Uber
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-center flex-shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">v0.1 Beta</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
