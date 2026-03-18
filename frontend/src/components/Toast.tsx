import { useToast } from '../contexts/ToastContext'
import { generateMilestoneCard, shareOrDownload } from '../lib/shareUtils'
import Confetti from './Confetti'

const TYPE_STYLES: Record<string, string> = {
  success: 'bg-green-50 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200',
  muted: 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400',
  milestone: 'bg-amber-50 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-100',
  'group-complete': 'bg-purple-50 dark:bg-purple-900/40 border-purple-300 dark:border-purple-600 text-purple-800 dark:text-purple-200',
  'import-summary': 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200',
}

const TYPE_ICONS: Record<string, string> = {
  success: '+',
  muted: '-',
  milestone: '\u2605', // star
  'group-complete': '\uD83C\uDFC6', // trophy
  'import-summary': '\u2191', // up arrow
}

export default function Toast() {
  const { currentToast, dismissToast } = useToast()

  if (!currentToast) return null

  const style = TYPE_STYLES[currentToast.type] || TYPE_STYLES.success
  const icon = TYPE_ICONS[currentToast.type] || ''

  const handleShare = async () => {
    if (!currentToast.shareData) return
    const blob = await generateMilestoneCard(currentToast.shareData)
    await shareOrDownload(blob, `milestone-${currentToast.shareData.milestone}.png`)
  }

  return (
    <>
      <Confetti active={!!currentToast.confetti} />
      <div
        className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[90] animate-slide-up max-w-sm w-[calc(100%-2rem)] cursor-pointer"
        onClick={dismissToast}
        role="status"
        aria-live="polite"
      >
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg ${style}`}>
          <span className="text-lg flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{currentToast.message}</p>
            {currentToast.detail && (
              <p className="text-xs opacity-75 mt-0.5">{currentToast.detail}</p>
            )}
          </div>
          {currentToast.shareData && currentToast.shareData.milestone >= 50 && (
            <button
              onClick={(e) => { e.stopPropagation(); handleShare() }}
              className="flex-shrink-0 text-xs px-2 py-1 rounded bg-white/50 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/40 font-medium"
            >
              Share
            </button>
          )}
        </div>
      </div>
    </>
  )
}
