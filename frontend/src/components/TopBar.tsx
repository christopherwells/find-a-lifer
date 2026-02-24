import { useEffect, useState } from 'react'

interface TopBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function TopBar({ darkMode, onToggleDarkMode }: TopBarProps) {
  const [serverStatus, setServerStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')

  useEffect(() => {
    let cancelled = false
    let retryTimeout: ReturnType<typeof setTimeout>

    const checkHealth = (attempt: number) => {
      fetch('/api/health')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then(() => {
          if (!cancelled) setServerStatus('connected')
        })
        .catch(() => {
          if (cancelled) return
          if (attempt < 3) {
            // Retry with exponential backoff: 2s, 4s, 8s
            const delay = Math.pow(2, attempt + 1) * 1000
            setServerStatus('connecting')
            retryTimeout = setTimeout(() => checkHealth(attempt + 1), delay)
          } else {
            setServerStatus('error')
          }
        })
    }

    checkHealth(0)
    return () => {
      cancelled = true
      clearTimeout(retryTimeout)
    }
  }, [])

  return (
    <header
      data-testid="top-bar"
      className={`h-11 flex items-center justify-between px-4 z-10 ${
        darkMode
          ? 'bg-[#1A1A2E] text-white'
          : 'bg-[#2C3E7B] text-white'
      }`}
    >
      {/* Left: Logo and Title */}
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold tracking-tight">
          Find-A-Lifer
        </h1>
      </div>

      {/* Right: Status + Dark Mode Toggle */}
      <div className="flex items-center gap-3">
        {/* Server Status — just a dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full inline-block ${
            serverStatus === 'connected'
              ? 'bg-green-400'
              : serverStatus === 'connecting'
              ? 'bg-yellow-400 animate-pulse'
              : 'bg-red-400'
          }`}
          title={serverStatus === 'connected' ? 'Connected' : serverStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        />

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
