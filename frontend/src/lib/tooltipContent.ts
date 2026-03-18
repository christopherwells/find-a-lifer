/**
 * Centralized glossary of jargon definitions used by Tooltip components.
 * Keys match the term identifiers used in ⓘ info icons throughout the UI.
 */
export const TOOLTIPS: Record<string, string> = {
  // View modes
  richness:
    'Number of bird species you haven\'t seen yet ("lifers") reported in each area during this week of the year.',
  frequency:
    'Combined probability of seeing at least one new lifer in each area. Higher values = better chances of finding something new.',
  range:
    'How often a single species is reported by birders in each area during this week. Select a species to see its distribution.',
  goals:
    'Number of species from your active goal list found in each area this week.',

  // Explore tab controls
  opacity:
    'Adjust the transparency of the colored map overlay so you can see the terrain underneath.',
  liferRange:
    'Filter the map to only show areas within a specific range of lifer counts. Drag the sliders to narrow the view.',
  weekSlider:
    'Bird distributions change throughout the year. Move the slider to see what species are present during each week.',
  totalRichness:
    'Toggle between showing only species you haven\'t seen (lifers) and showing all reported species.',
  goalBirdsOnly:
    'When enabled, the heatmap only counts species on your active goal list instead of all lifers.',

  // Species concepts
  reportingFrequency:
    'The percentage of eBird checklists in an area that include this species. Higher frequency means the bird is easier to find there.',
  lifeList:
    'Your personal record of every bird species you\'ve ever identified. Import from eBird or build one manually.',
  lifer:
    'A bird species you\'ve never seen before. Finding a lifer is one of the most exciting moments in birding!',
  liferDensity:
    'The number of potential lifers in a map cell — species reported there that you haven\'t seen yet.',

  // Conservation status
  leastConcern:
    'Least Concern (LC) — Population is stable and widespread. Not currently at risk of extinction.',
  nearThreatened:
    'Near Threatened (NT) — Close to qualifying as threatened. May become vulnerable if current trends continue.',
  vulnerable:
    'Vulnerable (VU) — Facing a high risk of extinction in the wild due to habitat loss, hunting, or other threats.',
  endangered:
    'Endangered (EN) — Facing a very high risk of extinction. Significant population declines observed.',
  criticallyEndangered:
    'Critically Endangered (CR) — Facing an extremely high risk of extinction. Immediate conservation action needed.',
  dataDeficient:
    'Data Deficient (DD) — Not enough information to assess extinction risk. More research is needed.',

  // Invasion status
  native:
    'Native — This species occurs naturally in this region. It evolved here or colonized without human assistance.',
  introduced:
    'Introduced — This species was brought to this region by humans, intentionally or accidentally.',
  vagrant:
    'Vagrant/Accidental — This species is not normally found here but occasionally appears far outside its usual range.',

  // Difficulty
  difficulty:
    'How hard the species is to find, based on how widespread it is and how often it\'s reported where it occurs.',
  restrictedRange:
    'This species has a very small global breeding range, making it geographically harder to encounter.',
}
