import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
// SUB_REGIONS/SUPER_REGIONS no longer needed — region options are hardcoded in the dropdown for geographic ordering

interface TopBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
  onShowAbout?: () => void
  onShowOnboarding?: () => void
  onImportClick?: () => void
  onShowProfile?: () => void
}

export default function TopBar({ darkMode, onToggleDarkMode, onShowAbout, onShowOnboarding, onImportClick, onShowProfile }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [homeRegion, setHomeRegion] = useState(() => localStorage.getItem('homeRegion') || '')
  const menuRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const menuItemClass = `w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
    darkMode
      ? 'text-gray-200 hover:bg-gray-700'
      : 'text-gray-700 hover:bg-gray-50'
  }`

  const menuDividerClass = `border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`

  const iconClass = `h-4 w-4 flex-shrink-0 ${darkMode ? 'text-blue-400' : 'text-[var(--color-brand)]'}`

  return (
    <header
      data-testid="top-bar"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      className={`flex items-center justify-between px-4 z-50 shadow-md relative min-h-[44px] ${
        darkMode
          ? 'bg-[#1A1A2E] text-white'
          : 'bg-gradient-to-r from-[#2C3E7B] to-[#1a2a5e] text-white'
      }`}
    >
      {/* Left: Logo and Title */}
      <div className="flex items-center gap-2">
        {/* Bird binoculars icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#E87722]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="17" r="3"/>
          <circle cx="17" cy="17" r="3"/>
          <path d="M7 14V6a2 2 0 0 1 2-2h.5"/>
          <path d="M17 14V6a2 2 0 0 0-2-2h-.5"/>
          <path d="M10 4h4"/>
        </svg>
        <div className="flex items-baseline gap-1.5">
          <h1 className="text-[15px] font-bold tracking-tight">
            Find-A-Lifer
          </h1>
          <span className="text-xs lg:text-xs text-blue-200/60 font-semibold tracking-wide">BETA</span>
        </div>
      </div>

      {/* Right: Menu */}
      <div className="flex items-center">
        {/* Menu button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={`p-1.5 rounded-lg transition-colors ${
              menuOpen
                ? 'bg-white/25 text-white'
                : 'bg-white/10 hover:bg-white/20 text-blue-200'
            }`}
            title="Menu"
            aria-label="Menu"
            aria-expanded={menuOpen}
            data-testid="topbar-menu-button"
          >
            {/* Three-dot vertical (kebab) icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div
              className={`absolute right-0 top-full mt-1 w-52 rounded-lg shadow-xl border overflow-hidden ${
                darkMode
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}
              data-testid="topbar-menu"
            >
              {/* Import Life List */}
              <button
                onClick={() => { setMenuOpen(false); onImportClick?.() }}
                className={menuItemClass}
                data-testid="topbar-import-button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Import Life List
              </button>

              {/* Account / Sign In */}
              <button
                onClick={() => { setMenuOpen(false); onShowProfile?.() }}
                className={`${menuItemClass} ${menuDividerClass}`}
                data-testid="topbar-account-button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                {user ? (user.displayName || 'Account') : 'Sign In'}
              </button>

              {/* Home Region */}
              <div className={`${menuItemClass} ${menuDividerClass}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <select
                  value={homeRegion}
                  onChange={(e) => {
                    const val = e.target.value
                    setHomeRegion(val)
                    if (val) localStorage.setItem('homeRegion', val)
                    else localStorage.removeItem('homeRegion')
                    window.dispatchEvent(new Event('homeRegionChange'))
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`flex-1 min-w-0 text-xs py-0.5 bg-transparent border-none outline-none ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  <option value="">Home Region: All</option>
                  <optgroup label="Northern (Canada &amp; Alaska)">
                    <option value="northern">All Northern</option>
                    <option value="ca-west">Western Canada &amp; Alaska</option>
                    <option value="ca-central">Central Canada</option>
                    <option value="ca-east">Eastern Canada &amp; N. Atlantic</option>
                  </optgroup>
                  <optgroup label="Continental US">
                    <option value="continental-us">All Continental US</option>
                    <option value="us-ne">Northeastern US</option>
                    <option value="us-se">Southeastern US</option>
                    <option value="us-mw">Midwestern US</option>
                    <option value="us-sw">Southwestern US</option>
                    <option value="us-west">Western US</option>
                    <option value="us-rockies">US Rockies</option>
                  </optgroup>
                  <optgroup label="Hawaii">
                    <option value="hawaii">Hawaii</option>
                  </optgroup>
                  <optgroup label="Mexico &amp; Central America">
                    <option value="mex-central">All Mex/CA</option>
                    <option value="mx-north">Northern Mexico</option>
                    <option value="mx-south">Southern Mexico</option>
                    <option value="ca-c-north">Upper Central America</option>
                    <option value="ca-c-south">Southern Central America</option>
                  </optgroup>
                  <optgroup label="Caribbean">
                    <option value="caribbean">All Caribbean</option>
                    <option value="atlantic-west">Western Atlantic Islands</option>
                    <option value="caribbean-greater">Greater Antilles</option>
                    <option value="caribbean-lesser">Lesser Antilles</option>
                  </optgroup>
                </select>
              </div>

              {/* Dark Mode toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleDarkMode() }}
                className={`${menuItemClass} ${menuDividerClass}`}
              >
                {darkMode ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
                <span className="flex-1">Dark Mode</span>
                <span className={`inline-block w-8 h-4 rounded-full relative transition-colors ${darkMode ? 'bg-[var(--color-brand)]' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${darkMode ? 'left-4' : 'left-0.5'}`} />
                </span>
              </button>

              {/* Tutorial */}
              <button
                onClick={() => { setMenuOpen(false); onShowOnboarding?.() }}
                className={`${menuItemClass} ${menuDividerClass}`}
                data-testid="topbar-help-button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Tutorial
              </button>

              {/* About */}
              <button
                onClick={() => { setMenuOpen(false); onShowAbout?.() }}
                className={`${menuItemClass} ${menuDividerClass}`}
                data-testid="topbar-about-button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                About Find-A-Lifer
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
