import { useEffect, useState } from 'react'

interface TopBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function TopBar({ darkMode, onToggleDarkMode }: TopBarProps) {
  const [serverStatus, setServerStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(() => setServerStatus('connected'))
      .catch(() => setServerStatus('error'))
  }, [])

  return (
    <header
      data-testid="top-bar"
      className={`h-14 flex items-center justify-between px-4 shadow-md z-10 ${
        darkMode
          ? 'bg-[#1A1A2E] text-white'
          : 'bg-[#2C3E7B] text-white'
      }`}
    >
      {/* Left: Logo and Title */}
      <div className="flex items-center gap-3">
        <span className="text-2xl" role="img" aria-label="bird">
          {'\u{1F426}'}
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight leading-tight">
            Find-A-Lifer
          </h1>
          <p className="text-xs text-blue-200 leading-tight">
            Discover your next life bird
          </p>
        </div>
      </div>

      {/* Right: Status + Dark Mode Toggle */}
      <div className="flex items-center gap-4">
        {/* Server Status Indicator */}
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full inline-block ${
              serverStatus === 'connected'
                ? 'bg-green-400 animate-pulse'
                : serverStatus === 'connecting'
                ? 'bg-yellow-400 animate-pulse'
                : 'bg-red-400'
            }`}
          />
          <span className="text-blue-200 text-xs hidden sm:inline">
            {serverStatus === 'connected'
              ? 'Connected'
              : serverStatus === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
          </span>
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleDarkMode}
          className={`p-2 rounded-lg transition-colors ${
            darkMode
              ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300'
              : 'bg-white/10 hover:bg-white/20 text-blue-200'
          }`}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            // Sun icon for dark mode (switch to light)
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
            </svg>
          ) : (
            // Moon icon for light mode (switch to dark)
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
