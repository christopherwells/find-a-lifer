export interface MilestoneInfo {
  tier: 'small' | 'medium' | 'large'
  message: string
  confetti: boolean
}

const SMALL_MILESTONES = [5, 10, 25]
const MEDIUM_MILESTONES = [50, 100, 250]
const LARGE_MILESTONES = [500, 750, 1000, 1500, 2000, 2500, 3000]

const SMALL_MESSAGES: Record<number, string> = {
  5: "You're off to a great start!",
  10: 'Double digits! Keep exploring!',
  25: 'A quarter century of species!',
}

const MEDIUM_MESSAGES: Record<number, string> = {
  50: 'Half a hundred! Impressive dedication.',
  100: 'Triple digits! You\'re a serious birder.',
  250: 'A massive milestone. Well done!',
}

export function getMilestoneInfo(count: number): MilestoneInfo | null {
  if (SMALL_MILESTONES.includes(count)) {
    return { tier: 'small', message: SMALL_MESSAGES[count] || `${count} species!`, confetti: false }
  }
  if (MEDIUM_MILESTONES.includes(count)) {
    return { tier: 'medium', message: MEDIUM_MESSAGES[count] || `${count} species!`, confetti: true }
  }
  if (LARGE_MILESTONES.includes(count)) {
    return { tier: 'large', message: `${count} species! Incredible achievement.`, confetti: true }
  }
  return null
}

export function getAddMessage(comName: string, totalCount: number): string {
  return `${comName} added to your life list! (#${totalCount})`
}

export function getRemoveMessage(comName: string): string {
  return `${comName} removed from your life list`
}

export function getGroupCompleteMessage(groupName: string, groupTotal: number): string {
  return `All ${groupTotal} ${groupName} seen!`
}

export function getAlmostThereMessage(groupName: string, seen: number, total: number): string {
  const remaining = total - seen
  return `${groupName}: ${seen} of ${total} — just ${remaining} to go!`
}
