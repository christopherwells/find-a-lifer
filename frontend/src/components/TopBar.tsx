interface TopBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function TopBar({ darkMode, onToggleDarkMode }: TopBarProps) {
  return (
    <header
      data-testid="top-bar"
      className={`h-11 flex items-center justify-between px-4 z-50 shadow-md relative ${
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
          <span className="text-[10px] text-blue-200/60 font-semibold tracking-wide">NORTHEAST</span>
        </div>
      </div>

      {/* Right: Dark Mode Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleDarkMode}
          className={`p-1.5 rounded-lg transition-colors ${
            darkMode
              ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300'
              : 'bg-white/10 hover:bg-white/20 text-blue-200'
          }`}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
