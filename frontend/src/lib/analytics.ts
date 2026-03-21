import { logEvent } from 'firebase/analytics'
import { getAnalyticsInstance } from './firebase'

/**
 * Track an analytics event. Silently no-ops if analytics is unavailable.
 */
export async function trackEvent(
  name: string,
  params?: Record<string, string | number>
): Promise<void> {
  try {
    const analytics = await getAnalyticsInstance()
    if (analytics) {
      logEvent(analytics, name, params)
    }
  } catch {
    // Silently fail — analytics should never break the app
  }
}
