export interface MilestoneCardData {
  count: number
  milestone: number
  percentComplete: number
}

const BRAND_PRIMARY = '#2C3E7B'
const BRAND_ACCENT = '#27AE60'
const CARD_BG = '#FFFFFF'
const CARD_WIDTH = 400
const CARD_HEIGHT = 250

export async function generateMilestoneCard(data: MilestoneCardData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = CARD_BG
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // Header bar
  ctx.fillStyle = BRAND_PRIMARY
  ctx.fillRect(0, 0, CARD_WIDTH, 60)

  // App name
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Find-A-Lifer', CARD_WIDTH / 2, 38)

  // Milestone number
  ctx.fillStyle = BRAND_PRIMARY
  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif'
  ctx.fillText(String(data.milestone), CARD_WIDTH / 2, 140)

  // "Species" label
  ctx.fillStyle = '#666666'
  ctx.font = '18px system-ui, -apple-system, sans-serif'
  ctx.fillText('Species Milestone', CARD_WIDTH / 2, 165)

  // Progress bar
  const barX = 40
  const barY = 185
  const barWidth = CARD_WIDTH - 80
  const barHeight = 16
  const progressWidth = Math.min(1, data.percentComplete / 100) * barWidth

  // Bar background
  ctx.fillStyle = '#E5E7EB'
  ctx.beginPath()
  ctx.roundRect(barX, barY, barWidth, barHeight, 8)
  ctx.fill()

  // Bar fill
  ctx.fillStyle = BRAND_ACCENT
  ctx.beginPath()
  ctx.roundRect(barX, barY, Math.max(16, progressWidth), barHeight, 8)
  ctx.fill()

  // Progress text
  ctx.fillStyle = '#374151'
  ctx.font = '14px system-ui, -apple-system, sans-serif'
  ctx.fillText(`${data.count} species (${data.percentComplete.toFixed(1)}%)`, CARD_WIDTH / 2, 225)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png')
  })
}

export async function shareOrDownload(blob: Blob, fileName: string = 'milestone.png'): Promise<void> {
  const file = new File([blob], fileName, { type: 'image/png' })

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Find-A-Lifer Milestone',
        text: 'Check out my birding milestone!',
      })
      return
    } catch {
      // User cancelled or share failed — fall through to download
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
