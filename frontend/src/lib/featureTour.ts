import type { Config, DriveStep } from 'driver.js'

const TOUR_COMPLETE_KEY = 'tourComplete'

/** Check whether the tour has already been completed */
export function isTourComplete(): boolean {
  return localStorage.getItem(TOUR_COMPLETE_KEY) === 'true'
}

/** Mark the tour as complete */
export function markTourComplete(): void {
  localStorage.setItem(TOUR_COMPLETE_KEY, 'true')
}

/** Clear the tour completion flag so it replays on next load */
export function resetTour(): void {
  localStorage.removeItem(TOUR_COMPLETE_KEY)
}

/**
 * Build tour steps, adapting selectors for mobile vs desktop.
 * On mobile (<768px), the bottom tab bar is used; on desktop, the side panel tab nav.
 */
function buildSteps(): DriveStep[] {
  const isMobile = window.innerWidth < 768

  return [
    {
      element: '#main-content',
      popover: {
        title: 'Your Birding Map',
        description:
          'Hexagonal cells show species data across North America and the Caribbean. Brighter colors mean more lifers to find.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: isMobile
        ? '[data-testid="mc-view-mode-density"]'
        : '[data-testid="view-mode-density"]',
      popover: {
        title: 'View Modes',
        description:
          'Switch between Count (species numbers), Chance (probability of seeing a lifer), Range (single species), and Goals views.',
        side: isMobile ? 'bottom' : 'bottom',
        align: 'center',
      },
    },
    {
      element: isMobile
        ? '[data-testid="mc-week-slider"]'
        : '[data-testid="week-slider"]',
      popover: {
        title: 'Week Slider',
        description:
          'Slide to see how bird distributions change throughout the year. Birds migrate, so the map updates weekly.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#main-content',
      popover: {
        title: 'Explore Cells',
        description:
          'Tap any hex cell on the map to see which species are found there and their reporting frequencies.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: isMobile
        ? '[data-testid="mobile-tab-bar"] button:nth-child(2)'
        : '#tab-species',
      popover: {
        title: 'Species Tab',
        description:
          'Browse all 2,100+ species, search by name, and mark ones you\'ve seen to build your life list.',
        side: isMobile ? 'top' : 'bottom',
        align: 'center',
      },
    },
    {
      element: isMobile
        ? '[data-testid="mobile-tab-bar"] button:nth-child(3)'
        : '#tab-goals',
      popover: {
        title: 'Goals Tab',
        description:
          'Create goal lists to track species you want to find. The map highlights cells where your goal birds occur.',
        side: isMobile ? 'top' : 'bottom',
        align: 'center',
      },
    },
    {
      element: isMobile
        ? '[data-testid="mobile-tab-bar"] button:nth-child(4)'
        : '#tab-trip',
      popover: {
        title: 'Plan Tab',
        description:
          'Find the best hotspots for lifers and plan your birding trips with location comparisons and timing windows.',
        side: isMobile ? 'top' : 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-testid="topbar-menu-button"]',
      popover: {
        title: 'Menu',
        description:
          'Import your eBird life list, toggle dark mode, replay this tutorial, or learn more about Find-A-Lifer.',
        side: 'bottom',
        align: 'end',
      },
    },
  ]
}

/**
 * Lazy-load driver.js and start the feature tour.
 * Returns a promise that resolves when the tour finishes or is dismissed.
 */
export async function startTour(): Promise<void> {
  const { driver } = await import('driver.js')
  await import('driver.js/dist/driver.css')

  return new Promise<void>((resolve) => {
    const steps = buildSteps()

    const config: Config = {
      steps,
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: 'var(--color-brand-dark)',
      overlayOpacity: 0.6,
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'fal-tour-popover',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it!',
      progressText: '{{current}} of {{total}}',
      onDestroyed: () => {
        markTourComplete()
        // Force cleanup of any lingering driver.js overlay elements on iOS
        // which can hide the TopBar after early dismissal
        document.querySelectorAll('.driver-overlay, .driver-popover, .driver-active-element').forEach(el => el.remove())
        document.body.classList.remove('driver-active')
        resolve()
      },
    }

    const driverInstance = driver(config)
    driverInstance.drive()
  })
}
