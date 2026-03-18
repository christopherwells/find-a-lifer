/**
 * Unified badge component for conservation status, difficulty, restricted range, and invasion status.
 * Replaces duplicated inline badge styles across SpeciesInfoCard, MapView popups, and SpeciesTab.
 *
 * Three sizes:
 * - 'dot': tiny colored circle (SpeciesTab compact list)
 * - 'icon': small square with single character (MapView lifer popup)
 * - 'pill': full pill with emoji + label (SpeciesInfoCard, goal popup)
 */

interface BadgeProps {
  variant: 'conservation' | 'difficulty' | 'restricted-range' | 'invasion' | 'habitat'
  value: string
  size?: 'dot' | 'icon' | 'pill'
  className?: string
}

// --- Color mappings ---

const CONSERVATION_COLORS: Record<string, { bg: string; text: string; emoji: string; char: string }> = {
  'Least Concern':        { bg: 'bg-green-100 dark:bg-green-900/40',   text: 'text-green-800 dark:text-green-300',   emoji: '\u{1F33F}', char: '' },
  'Near Threatened':      { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-800 dark:text-yellow-300', emoji: '\u{1F33F}', char: '!' },
  'Vulnerable':           { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-800 dark:text-orange-300', emoji: '\u{1F33F}', char: '!' },
  'Endangered':           { bg: 'bg-red-100 dark:bg-red-900/40',       text: 'text-red-800 dark:text-red-300',       emoji: '\u{1F33F}', char: '!' },
  'Critically Endangered':{ bg: 'bg-red-200 dark:bg-red-900/60',       text: 'text-red-900 dark:text-red-200',       emoji: '\u{1F33F}', char: '!' },
  'Data Deficient':       { bg: 'bg-gray-100 dark:bg-gray-700',        text: 'text-gray-600 dark:text-gray-400',     emoji: '\u{1F33F}', char: '?' },
}

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string; emoji: string; char: string }> = {
  'Easy':            { bg: 'bg-green-100 dark:bg-green-900/40',   text: 'text-green-800 dark:text-green-300',   emoji: '\u{1F52D}', char: '' },
  'Moderate':        { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-800 dark:text-yellow-300', emoji: '\u{1F52D}', char: '' },
  'Hard':            { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-800 dark:text-orange-300', emoji: '\u{1F52D}', char: 'H' },
  'Very Hard':       { bg: 'bg-red-100 dark:bg-red-900/40',       text: 'text-red-800 dark:text-red-300',       emoji: '\u{1F52D}', char: 'H' },
  'Extremely Hard':  { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-800 dark:text-purple-300', emoji: '\u{1F52D}', char: 'H' },
}

const RESTRICTED_RANGE_STYLE = {
  bg: 'bg-blue-100 dark:bg-blue-900/40',
  text: 'text-blue-800 dark:text-blue-300',
  emoji: '\u{1F4CD}',
  char: 'R',
}

const INVASION_STYLE: Record<string, { bg: string; text: string; emoji: string }> = {
  'Introduced':          { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', emoji: '\u{26A0}\u{FE0F}' },
  'Vagrant/Accidental':  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', emoji: '\u{26A0}\u{FE0F}' },
}

const HABITAT_STYLE: Record<string, { bg: string; text: string; emoji: string }> = {
  'Forest':            { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-300', emoji: '\u{1F332}' },
  'Conifer Forest':    { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-300', emoji: '\u{1F332}' },
  'Tropical Forest':   { bg: 'bg-green-100 dark:bg-green-900/40',    text: 'text-green-800 dark:text-green-300',     emoji: '\u{1F334}' },
  'Deciduous Forest':  { bg: 'bg-lime-100 dark:bg-lime-900/40',      text: 'text-lime-800 dark:text-lime-300',       emoji: '\u{1F333}' },
  'Mixed Forest':      { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-300', emoji: '\u{1F343}' },
  'Aquatic':           { bg: 'bg-sky-100 dark:bg-sky-900/40',         text: 'text-sky-800 dark:text-sky-300',         emoji: '\u{1F4A7}' },  // legacy
  'Freshwater':        { bg: 'bg-sky-100 dark:bg-sky-900/40',         text: 'text-sky-800 dark:text-sky-300',         emoji: '\u{1F4A7}' },
  'Ocean':             { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-800 dark:text-blue-300',       emoji: '\u{1F30A}' },
  'Wetland':           { bg: 'bg-teal-100 dark:bg-teal-900/40',       text: 'text-teal-800 dark:text-teal-300',       emoji: '\u{1F3DE}\u{FE0F}' },
  'Grassland':         { bg: 'bg-lime-100 dark:bg-lime-900/40',       text: 'text-lime-800 dark:text-lime-300',       emoji: '\u{1F33F}' },
  'Agricultural':      { bg: 'bg-yellow-100 dark:bg-yellow-900/40',   text: 'text-yellow-800 dark:text-yellow-300',   emoji: '\u{1F33E}' },
  'Urban-tolerant':    { bg: 'bg-stone-100 dark:bg-stone-700/40',     text: 'text-stone-700 dark:text-stone-300',     emoji: '\u{1F3D9}\u{FE0F}' },
  'Scrubland':         { bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-800 dark:text-amber-300',     emoji: '\u{1FAB4}' },
  'Habitat Generalist': { bg: 'bg-gray-100 dark:bg-gray-700/40',     text: 'text-gray-700 dark:text-gray-300',       emoji: '\u{1F30D}' },
}

function getStyle(variant: BadgeProps['variant'], value: string) {
  switch (variant) {
    case 'conservation':
      return CONSERVATION_COLORS[value] ?? { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', emoji: '\u{1F33F}', char: '?' }
    case 'difficulty':
      return DIFFICULTY_COLORS[value] ?? { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', emoji: '\u{1F52D}', char: '' }
    case 'restricted-range':
      return RESTRICTED_RANGE_STYLE
    case 'invasion': {
      // Value may be "Introduced (US-FL, US-CA)" or just "Introduced"
      const baseStatus = value.startsWith('Introduced') ? 'Introduced' : 'Vagrant/Accidental'
      return INVASION_STYLE[baseStatus] ?? { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', emoji: '\u{26A0}\u{FE0F}' }
    }
    case 'habitat':
      return HABITAT_STYLE[value] ?? { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', emoji: '\u{1F30D}' }
  }
}

export default function Badge({ variant, value, size = 'pill', className = '' }: BadgeProps) {
  const style = getStyle(variant, value)

  if (size === 'dot') {
    return (
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.bg} ${className}`}
        title={value}
        data-testid={`badge-${variant}-dot`}
      />
    )
  }

  if (size === 'icon') {
    const char: string = 'char' in style ? (style as { char: string }).char : ''
    if (!char) return null // Don't show icon badge for Easy/Moderate/Least Concern
    return (
      <span
        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-medium flex-shrink-0 ${style.bg} ${style.text} ${className}`}
        title={value}
        data-testid={`badge-${variant}-icon`}
      >
        {char}
      </span>
    )
  }

  // size === 'pill'
  const emoji: string = 'emoji' in style ? (style as { emoji: string }).emoji : ''
  const label = variant === 'restricted-range' ? 'Restricted Range' : value
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text} ${className}`}
      data-testid={`badge-${variant}-pill`}
    >
      {emoji} {label}
    </span>
  )
}
