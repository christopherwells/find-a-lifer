import { useState, useCallback } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import FriendsSection from './FriendsSection'
import { fetchSpecies } from '../lib/dataCache'
import { resetTour } from '../lib/featureTour'
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

interface ProfileTabProps {
  onShowAbout?: () => void
  onShowOnboarding?: () => void
}

export default function ProfileTab({ onShowAbout, onShowOnboarding }: ProfileTabProps = {}) {
  const {
    clearAllSpecies, getTotalSeen, isSpeciesSeen,
  } = useLifeList()
  const { showToast } = useToast()
  const [exporting, setExporting] = useState(false)
  const [updating, setUpdating] = useState(false)
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
        showToast({ type: 'muted', message: 'Life list cleared' })
      } catch (error) {
        console.error('Error clearing life list:', error)
      }
    }
  }

  const handleResetTour = () => {
    resetTour()
    onShowOnboarding?.()
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-[var(--color-brand-text)]">Profile & Data</h3>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Account, export, and settings. Import your life list from the menu above.
      </p>

      {/* Account Section */}
      <AccountSection />

      {/* Friends Section (only when signed in) */}
      <FriendsSection />

      {/* Stats Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <h4 className="text-sm font-medium text-[var(--color-brand-text)] mb-1.5">Your Life List</h4>
        <p className="text-2xl font-bold text-[var(--color-brand)]" data-testid="total-seen-count">
          {getTotalSeen()} species
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">marked as seen</p>
        {getTotalSeen() > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="mt-3 w-full px-4 py-2 border border-[var(--color-brand)] dark:border-blue-500 text-[var(--color-brand)] rounded-lg hover:bg-[var(--color-brand)]/10 dark:hover:bg-blue-500/10 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            data-testid="export-csv-button"
          >
            {exporting ? 'Exporting...' : 'Export Life List as CSV'}
          </button>
        )}
      </div>

      {/* App Updates Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <h4 className="text-sm font-medium text-[var(--color-brand-text)] mb-1.5">App Updates</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Clear cached data and reload to get the latest version.
        </p>
        <button
          onClick={handleCheckForUpdates}
          disabled={updating}
          className="w-full px-4 py-2 border border-[var(--color-brand)] dark:border-blue-500 text-[var(--color-brand)] rounded-lg hover:bg-[var(--color-brand)]/10 dark:hover:bg-blue-500/10 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          {updating ? 'Updating...' : 'Check for Updates'}
        </button>
      </div>

      {/* Preferences Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
        <h4 className="text-sm font-medium text-[var(--color-brand-text)] mb-1">Preferences</h4>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-700 dark:text-gray-300">Celebration animations</span>
          <CelebrationToggle />
        </label>
      </div>

      {/* Mobile-only: Tutorial & About (hidden on desktop where TopBar has these) */}
      {(onShowOnboarding || onShowAbout) && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2 md:hidden">
          {onShowOnboarding && (
            <button
              onClick={onShowOnboarding}
              className="w-full flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-[var(--color-brand)]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Tutorial
            </button>
          )}
          {onShowAbout && (
            <button
              onClick={onShowAbout}
              className="w-full flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-[var(--color-brand)]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              About Find-A-Lifer
            </button>
          )}
        </div>
      )}

      {/* Reset Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
        <h4 className="text-sm font-medium text-[var(--color-brand-text)] mb-1">Reset</h4>
        <button
          onClick={handleResetTour}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          data-testid="reset-tour-button"
        >
          Replay Feature Tour
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
  const { user, loading, error, signIn, signUp, signOut, resetPassword, clearError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      </div>
    )
  }

  if (user) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
      <h4 className="text-sm font-medium text-[var(--color-brand-text)]">
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
          className="w-full px-4 py-2 bg-[var(--color-brand)] text-white text-sm rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {mode === 'signin' && (
        <div className="text-center">
          {resetSent ? (
            <p className="text-xs text-green-600 dark:text-green-400">Reset email sent! Check your inbox.</p>
          ) : (
            <button
              onClick={async () => {
                if (!email.trim()) { clearError(); return }
                try {
                  await resetPassword(email.trim())
                  setResetSent(true)
                } catch { /* error shown via context */ }
              }}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-[var(--color-brand)] dark:hover:text-blue-400 underline"
            >
              Forgot password?
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        {mode === 'signin' ? (
          <>No account? <button onClick={() => { setMode('signup'); clearError() }} className="text-[var(--color-brand)] underline">Create one</button></>
        ) : (
          <>Already have an account? <button onClick={() => { setMode('signin'); clearError() }} className="text-[var(--color-brand)] underline">Sign in</button></>
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
        celebrationsEnabled ? 'bg-[var(--color-success)]' : 'bg-gray-300 dark:bg-gray-600'
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
