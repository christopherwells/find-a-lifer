import { useState, useCallback } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import FriendsSection from './FriendsSection'
import { fetchSpecies } from '../lib/dataCache'
import { openFilePicker, processCSVFile, type CSVImportResult } from '../lib/csvImport'

async function handleImport(
  importFn: (codes: string[], names: string[]) => Promise<{ newCount: number; existingCount: number }>,
  setImporting: (v: boolean) => void,
  setResult: (v: CSVImportResult | null) => void,
  setError?: (v: string | null) => void,
) {
  const file = await openFilePicker()
  if (!file) return
  setImporting(true)
  setResult(null)
  if (setError) setError(null)
  try {
    const result = await processCSVFile(file, importFn)
    setResult(result)
  } catch (error) {
    if (setError) setError(error instanceof Error ? error.message : 'Import failed')
    else console.error('Import error:', error)
  } finally {
    setImporting(false)
  }
}

async function clearAppCaches(): Promise<boolean> {
  try {
    // Clear Cache API (service worker runtime caches)
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map(name => caches.delete(name)))
    // Unregister service workers so fresh one installs
    const registrations = await navigator.serviceWorker?.getRegistrations()
    if (registrations) {
      await Promise.all(registrations.map(r => r.unregister()))
    }
    // Clear cached data from IndexedDB (but preserve user's life list and goal lists)
    indexedDB.deleteDatabase('find-a-lifer-grid-cache')
    return true
  } catch {
    return false
  }
}

export default function ProfileTab() {
  const {
    importSpeciesList, clearAllSpecies, getTotalSeen, isSpeciesSeen,
    importPartnerList, clearPartnerList, hasPartnerList, partnerSeenSpecies,
    activeListMode, setActiveListMode,
    yearLists, importYearList, deleteYearList, listScope, setListScope,
    setActiveYearListId,
  } = useLifeList()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [partnerImporting, setPartnerImporting] = useState(false)
  const [partnerImportResult, setPartnerImportResult] = useState<CSVImportResult | null>(null)
  const [yearImporting, setYearImporting] = useState(false)
  const [yearImportYear, setYearImportYear] = useState(() => new Date().getFullYear())
  const [yearImportResult, setYearImportResult] = useState<CSVImportResult | null>(null)
  const handleCheckForUpdates = useCallback(async () => {
    setUpdating(true)
    const success = await clearAppCaches()
    if (success) {
      window.location.reload()
    } else {
      setUpdating(false)
      alert('Could not clear caches. Try manually clearing browser data.')
    }
  }, [])

  const handleImportClick = () => {
    if (importing) return
    handleImport(importSpeciesList, setImporting, setImportResult, setImportError)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const allSpecies = await fetchSpecies()

      const seenSpecies = allSpecies.filter(s => isSpeciesSeen(s.speciesCode))

      const csvHeader = 'Common Name,Scientific Name,Species Code,Family'
      const csvRows = seenSpecies.map(s => {
        // Escape fields that might contain commas
        const comName = s.comName.includes(',') ? `"${s.comName}"` : s.comName
        const sciName = s.sciName.includes(',') ? `"${s.sciName}"` : s.sciName
        const familyName = s.familyComName.includes(',') ? `"${s.familyComName}"` : s.familyComName
        return `${comName},${sciName},${s.speciesCode},${familyName}`
      })

      const csvContent = [csvHeader, ...csvRows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = 'life-list-export.csv'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting CSV:', error)
    } finally {
      setExporting(false)
    }
  }

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear your entire life list? This cannot be undone.')) {
      try {
        await clearAllSpecies()
        setImportResult(null)
      } catch (error) {
        console.error('Error clearing life list:', error)
      }
    }
  }

  const handleResetOnboarding = () => {
    localStorage.removeItem('hasSeenOnboarding')
    localStorage.removeItem('starterChecklistDismissed')
    localStorage.removeItem('sessionCount')
    localStorage.removeItem('beginnerMode')
    window.location.reload()
  }

  const handlePartnerImportClick = () => {
    if (partnerImporting) return
    handleImport(importPartnerList, setPartnerImporting, setPartnerImportResult)
  }

  const handleClearPartner = async () => {
    if (window.confirm('Are you sure you want to remove the partner life list?')) {
      try {
        await clearPartnerList()
        setPartnerImportResult(null)
      } catch (error) {
        console.error('Error clearing partner list:', error)
      }
    }
  }

  const handleYearImportClick = () => {
    if (yearImporting) return
    const yearImportFn = async (speciesCodes: string[]) => {
      await importYearList(yearImportYear, speciesCodes)
      return { newCount: speciesCodes.length, existingCount: 0 }
    }
    handleImport(yearImportFn, setYearImporting, setYearImportResult)
  }

  const handleDeleteYearList = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this year list?')) {
      try {
        await deleteYearList(id)
      } catch (error) {
        console.error('Error deleting year list:', error)
      }
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100">Profile & Data</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Manage your life list data. Import from eBird, export as CSV, or reset your list.
      </p>

      {/* Account Section */}
      <AccountSection />

      {/* Friends Section (only when signed in) */}
      <FriendsSection />

      {/* Import Section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Import eBird Life List</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Download your life list from{' '}
          <a
            href="https://ebird.org/lifelist"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2C3E7B] dark:text-blue-400 underline"
          >
            ebird.org/lifelist
          </a>
          {' '}as CSV, then import it here.
        </p>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={importing}
          className={`block w-full px-4 py-2 text-center rounded-lg transition-colors ${
            importing
              ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500'
              : 'bg-[#2C3E7B] text-white hover:bg-[#1e2a54] active:bg-[#162044]'
          }`}
          data-testid="import-csv-button"
        >
          {importing ? 'Importing...' : 'Import CSV'}
        </button>

        {/* Import Progress/Results */}
        {importing && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3" data-testid="import-progress">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <span className="font-medium">Importing...</span> Please wait while we process your file.
            </p>
          </div>
        )}

        {importResult && !importing && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3" data-testid="import-success">
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium">Import complete!</span>
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {importResult.matched} of {importResult.total} species matched.
              {importResult.unmatched > 0 && ` ${importResult.unmatched} could not be matched.`}
            </p>
            {importResult.matched > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1" data-testid="import-merge-stats">
                {importResult.newCount > 0 && <span className="font-medium">{importResult.newCount} new</span>}
                {importResult.newCount > 0 && importResult.existingCount > 0 && ', '}
                {importResult.existingCount > 0 && <span>{importResult.existingCount} already in your list</span>}
              </p>
            )}
          </div>
        )}

        {importError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3" data-testid="import-error">
            <p className="text-sm text-red-700 dark:text-red-400">
              <span className="font-medium">Import failed:</span> {importError}
            </p>
          </div>
        )}
      </div>

      {/* Stats Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Your Life List</h4>
        <p className="text-2xl font-bold text-[#2C3E7B] dark:text-blue-400" data-testid="total-seen-count">
          {getTotalSeen()} species
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">marked as seen</p>
        {getTotalSeen() > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="mt-3 w-full px-4 py-2 border border-[#2C3E7B] dark:border-blue-500 text-[#2C3E7B] dark:text-blue-400 rounded-lg hover:bg-[#2C3E7B]/10 dark:hover:bg-blue-500/10 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            data-testid="export-csv-button"
          >
            {exporting ? 'Exporting...' : 'Export Life List as CSV'}
          </button>
        )}
      </div>

      {/* Partner Life List Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Partner Life List</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Import a birding partner's life list to plan trips together. The map will show lifers for both of you.
        </p>

        {hasPartnerList ? (
          <div className="space-y-3">
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3">
              <p className="text-sm font-medium text-violet-800 dark:text-violet-200">
                {partnerSeenSpecies.size} species loaded
              </p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                Partner life list is active
              </p>
            </div>

            {/* Show lifers for toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Show lifers for:</label>
              <div className="grid grid-cols-3 gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5" data-testid="list-mode-toggle">
                {(['me', 'partner', 'both'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setActiveListMode(mode)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeListMode === mode
                        ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    data-testid={`list-mode-${mode}`}
                  >
                    {mode === 'me' ? 'Me' : mode === 'partner' ? 'Partner' : 'Both'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePartnerImportClick}
                disabled={partnerImporting}
                className="flex-1 px-3 py-1.5 text-xs font-medium border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 disabled:opacity-50 transition-colors"
                data-testid="partner-reimport-btn"
              >
                {partnerImporting ? 'Importing...' : 'Re-import'}
              </button>
              <button
                onClick={handleClearPartner}
                className="flex-1 px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                data-testid="partner-clear-btn"
              >
                Remove Partner List
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handlePartnerImportClick}
              disabled={partnerImporting}
              className={`w-full px-4 py-2 text-center rounded-lg transition-colors ${
                partnerImporting
                  ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500'
                  : 'bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800'
              }`}
              data-testid="partner-import-btn"
            >
              {partnerImporting ? 'Importing...' : 'Import Partner\'s eBird CSV'}
            </button>
          </div>
        )}

        {partnerImportResult && !partnerImporting && (
          <div className="mt-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium">Partner import complete!</span>
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {partnerImportResult.matched} of {partnerImportResult.total} species matched.
            </p>
          </div>
        )}
      </div>

      {/* Year Lists Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Year Lists</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Import a year list from{' '}
          <a
            href="https://ebird.org/lifelist"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2C3E7B] dark:text-blue-400 underline"
          >
            eBird
          </a>
          {' '}to track your yearly progress and see year-specific lifers on the map.
        </p>

        {/* Year selector + import button */}
        <div className="flex gap-2 items-end mb-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Year</label>
            <input
              type="number"
              min={2000}
              max={new Date().getFullYear()}
              value={yearImportYear}
              onChange={(e) => setYearImportYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#2C3E7B] dark:focus:ring-blue-500 focus:border-transparent"
              data-testid="year-list-year-input"
            />
          </div>
          <button
            onClick={handleYearImportClick}
            disabled={yearImporting}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              yearImporting
                ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500'
                : 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800'
            }`}
            data-testid="year-list-import-btn"
          >
            {yearImporting ? 'Importing...' : 'Import Year List'}
          </button>
        </div>

        {/* Year import result */}
        {yearImportResult && !yearImporting && (
          <div className="mb-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium">Year list imported!</span>
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {yearImportResult.matched} of {yearImportResult.total} species matched.
            </p>
          </div>
        )}

        {/* Existing year lists */}
        {yearLists.length > 0 && (
          <div className="space-y-2">
            {yearLists
              .sort((a, b) => b.year - a.year)
              .map((yl) => (
              <div
                key={yl.id}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                data-testid={`year-list-${yl.year}`}
              >
                <div>
                  <p className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">{yl.year}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {yl.speciesCodes.length} species · imported {new Date(yl.importedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveYearListId(yl.id)
                      setListScope('year')
                    }}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      listScope === 'year' && yearLists.find(l => l.id === yl.id)
                        ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                        : 'text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400'
                    }`}
                    data-testid={`year-list-activate-${yl.year}`}
                  >
                    Use
                  </button>
                  <button
                    onClick={() => handleDeleteYearList(yl.id)}
                    className="px-2 py-1 text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                    data-testid={`year-list-delete-${yl.year}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {/* Scope toggle */}
            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Map shows lifers for:</label>
              <div className="grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5" data-testid="list-scope-toggle">
                {(['lifetime', 'year'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setListScope(scope)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      listScope === scope
                        ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    data-testid={`list-scope-${scope}`}
                  >
                    {scope === 'lifetime' ? 'Lifetime' : 'Year'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* App Updates Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">App Updates</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Clear cached data and reload to get the latest version.
        </p>
        <button
          onClick={handleCheckForUpdates}
          disabled={updating}
          className="w-full px-4 py-2 border border-[#2C3E7B] dark:border-blue-500 text-[#2C3E7B] dark:text-blue-400 rounded-lg hover:bg-[#2C3E7B]/10 dark:hover:bg-blue-500/10 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          {updating ? 'Updating...' : 'Check for Updates'}
        </button>
      </div>

      {/* Preferences Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Preferences</h4>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-700 dark:text-gray-300">Celebration animations</span>
          <CelebrationToggle />
        </label>
      </div>

      {/* Reset Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Reset</h4>
        <button
          onClick={handleResetOnboarding}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          data-testid="reset-onboarding-button"
        >
          Replay Onboarding Tutorial
        </button>
        <button
          onClick={handleClearAll}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          data-testid="clear-all-button"
        >
          Clear All Species
        </button>
      </div>
    </div>
  )
}

function AccountSection() {
  const { user, loading, error, signIn, signUp, signOut, clearError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      </div>
    )
  }

  if (user) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.displayName || 'Birder'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUp(email, password, displayName)
      } else {
        await signIn(email, password)
      }
      setEmail('')
      setPassword('')
      setDisplayName('')
    } catch {
      // Error is handled in AuthContext
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">
        {mode === 'signin' ? 'Sign In' : 'Create Account'}
      </h4>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Sign in to sync stats, see leaderboards, and connect with friends.
      </p>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
          <button onClick={clearError} className="text-xs text-red-500 underline mt-1">Dismiss</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {mode === 'signup' && (
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            required
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 bg-[#2C3E7B] text-white text-sm rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        {mode === 'signin' ? (
          <>No account? <button onClick={() => { setMode('signup'); clearError() }} className="text-[#2C3E7B] dark:text-blue-400 underline">Create one</button></>
        ) : (
          <>Already have an account? <button onClick={() => { setMode('signin'); clearError() }} className="text-[#2C3E7B] dark:text-blue-400 underline">Sign in</button></>
        )}
      </p>
    </div>
  )
}

function CelebrationToggle() {
  const { celebrationsEnabled, setCelebrationsEnabled } = useToast()
  return (
    <button
      onClick={() => setCelebrationsEnabled(!celebrationsEnabled)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        celebrationsEnabled ? 'bg-[#27AE60]' : 'bg-gray-300 dark:bg-gray-600'
      }`}
      role="switch"
      aria-checked={celebrationsEnabled}
      data-testid="celebrations-toggle"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          celebrationsEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
