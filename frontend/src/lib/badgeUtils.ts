/** Get the dot color class for a conservation status (used in SpeciesTab compact list) */
export function getConservationDotColor(status: string): string {
  switch (status) {
    case 'Near Threatened': return 'bg-yellow-400 dark:bg-yellow-500'
    case 'Vulnerable': return 'bg-orange-400 dark:bg-orange-500'
    case 'Endangered': return 'bg-red-500 dark:bg-red-400'
    case 'Critically Endangered': return 'bg-red-700 dark:bg-red-500'
    default: return ''
  }
}

/** Get the dot color class for restricted range */
export function getRestrictedRangeDotColor(): string {
  return 'bg-blue-400 dark:bg-blue-500'
}
