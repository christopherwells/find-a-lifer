/**
 * Display group mapping for the Species Checklist.
 *
 * Maps eBird familyComName → a broader display group name.
 * Groups follow taxonomic order (waterfowl first, finches last).
 * Species within each group retain their original taxonomic order,
 * which naturally keeps original families together.
 *
 * Families NOT listed here keep their original familyComName as the group.
 */

const FAMILY_TO_GROUP: Record<string, string> = {
  // Game Birds
  'Screamers': 'Game Birds',
  'Guineafowl': 'Game Birds',
  'Tinamous': 'Game Birds',
  'Guans, Chachalacas, and Curassows': 'Game Birds',
  'Pheasants, Grouse, and Allies': 'Game Birds',
  'New World Quail': 'Game Birds',

  // Flamingos, Grebes, and Loons
  'Flamingos': 'Flamingos, Grebes, and Loons',
  'Grebes': 'Flamingos, Grebes, and Loons',
  'Loons': 'Flamingos, Grebes, and Loons',

  // Nightjars and Allies
  'Nightjars and Allies': 'Nightjars and Allies',
  'Potoos': 'Nightjars and Allies',
  'Oilbird': 'Nightjars and Allies',

  // Rails, Cranes, and Allies
  'Rails, Gallinules, and Coots': 'Rails, Cranes, and Allies',
  'Finfoots': 'Rails, Cranes, and Allies',
  'Limpkin': 'Rails, Cranes, and Allies',
  'Cranes': 'Rails, Cranes, and Allies',
  'Storks': 'Rails, Cranes, and Allies',
  'Sunbittern': 'Rails, Cranes, and Allies',

  // Shorebirds
  'Thick-knees': 'Shorebirds',
  'Stilts and Avocets': 'Shorebirds',
  'Oystercatchers': 'Shorebirds',
  'Plovers and Lapwings': 'Shorebirds',
  'Jacanas': 'Shorebirds',
  'Sandpipers and Allies': 'Shorebirds',

  // Gulls, Terns, and Skuas
  'Skuas and Jaegers': 'Gulls, Terns, and Skuas',
  'Gulls, Terns, and Skimmers': 'Gulls, Terns, and Skuas',

  // Auks
  'Auks, Murres, and Puffins': 'Auks',

  // Tubenoses
  'Albatrosses': 'Tubenoses',
  'Southern Storm-Petrels': 'Tubenoses',
  'Northern Storm-Petrels': 'Tubenoses',
  'Shearwaters and Petrels': 'Tubenoses',

  // Pelicans, Cormorants, and Allies
  'Tropicbirds': 'Pelicans, Cormorants, and Allies',
  'Frigatebirds': 'Pelicans, Cormorants, and Allies',
  'Boobies and Gannets': 'Pelicans, Cormorants, and Allies',
  'Anhingas': 'Pelicans, Cormorants, and Allies',
  'Cormorants and Shags': 'Pelicans, Cormorants, and Allies',
  'Pelicans': 'Pelicans, Cormorants, and Allies',

  // Herons and Allies
  'Ibises and Spoonbills': 'Herons and Allies',
  'Herons, Egrets, and Bitterns': 'Herons and Allies',

  // Vultures, Hawks, and Allies
  'New World Vultures': 'Vultures, Hawks, and Allies',
  'Osprey': 'Vultures, Hawks, and Allies',
  'Hawks, Eagles, and Kites': 'Vultures, Hawks, and Allies',

  // Falcons — kept separate (Falcons and Caracaras → Falcons)
  'Falcons and Caracaras': 'Falcons',

  // Owls
  'Barn-Owls': 'Owls',
  'Owls': 'Owls',

  // Kingfishers, Motmots, and Allies
  'Kingfishers': 'Kingfishers, Motmots, and Allies',
  'Motmots': 'Kingfishers, Motmots, and Allies',
  'Bee-eaters': 'Kingfishers, Motmots, and Allies',

  // Toucans, Barbets, and Allies
  'Toucans': 'Toucans, Barbets, and Allies',
  'New World Barbets': 'Toucans, Barbets, and Allies',
  'Toucan-Barbets': 'Toucans, Barbets, and Allies',
  'Jacamars': 'Toucans, Barbets, and Allies',
  'Puffbirds': 'Toucans, Barbets, and Allies',

  // Parrots
  'New World and African Parrots': 'Parrots',
  'Old World Parrots': 'Parrots',
  'Cockatoos': 'Parrots',

  // Antbirds and Allies
  'Gnateaters': 'Antbirds and Allies',
  'Antpittas': 'Antbirds and Allies',
  'Antthrushes': 'Antbirds and Allies',
  'Tapaculos': 'Antbirds and Allies',
  'Typical Antbirds': 'Antbirds and Allies',

  // Cotingas, Manakins, and Allies
  'Cotingas': 'Cotingas, Manakins, and Allies',
  'Manakins': 'Cotingas, Manakins, and Allies',
  'Tityras and Allies': 'Cotingas, Manakins, and Allies',
  'Royal Flycatchers and Allies': 'Cotingas, Manakins, and Allies',
  'Sapayoa': 'Cotingas, Manakins, and Allies',
  'Sharpbill': 'Cotingas, Manakins, and Allies',

  // Shrikes and Vireos
  'Shrikes': 'Shrikes and Vireos',
  'Vireos, Shrike-Babblers, and Erpornis': 'Shrikes and Vireos',

  // Crows and Jays
  'Crows, Jays, and Magpies': 'Crows and Jays',

  // Chickadees, Nuthatches, and Allies
  'Tits, Chickadees, and Titmice': 'Chickadees, Nuthatches, and Allies',
  'Long-tailed Tits': 'Chickadees, Nuthatches, and Allies',
  'Nuthatches': 'Chickadees, Nuthatches, and Allies',
  'Treecreepers': 'Chickadees, Nuthatches, and Allies',
  'Kinglets': 'Chickadees, Nuthatches, and Allies',

  // Wrens and Gnatcatchers
  'Wrens': 'Wrens and Gnatcatchers',
  'Gnatcatchers': 'Wrens and Gnatcatchers',
  'Donacobius': 'Wrens and Gnatcatchers',

  // Pipits and Larks
  'Wagtails and Pipits': 'Pipits and Larks',
  'Larks': 'Pipits and Larks',
  'Accentors': 'Pipits and Larks',

  // Thrushes, Mockingbirds, and Allies
  'Thrushes and Allies': 'Thrushes, Mockingbirds, and Allies',
  'Mockingbirds and Thrashers': 'Thrushes, Mockingbirds, and Allies',
  'Starlings': 'Thrushes, Mockingbirds, and Allies',
  'Old World Flycatchers': 'Thrushes, Mockingbirds, and Allies',
  'Bulbuls': 'Thrushes, Mockingbirds, and Allies',

  // Waxwings, Dippers, and Allies
  'Waxwings': 'Waxwings, Dippers, and Allies',
  'Silky-flycatchers': 'Waxwings, Dippers, and Allies',
  'Dippers': 'Waxwings, Dippers, and Allies',

  // Warblers
  'New World Warblers': 'Warblers',
  'Yellow-breasted Chat': 'Warblers',
  'Wrenthrush': 'Warblers',
  'Leaf Warblers': 'Warblers',

  // Sparrows and Allies
  'New World Sparrows': 'Sparrows and Allies',
  'Longspurs and Snow Buntings': 'Sparrows and Allies',
  'Old World Sparrows': 'Sparrows and Allies',
  'Old World Buntings': 'Sparrows and Allies',

  // Tanagers and Allies
  'Tanagers and Allies': 'Tanagers and Allies',
  'Thrush-Tanager': 'Tanagers and Allies',
  'Greater Antillean Tanagers': 'Tanagers and Allies',
  'Mitrospingid Tanagers': 'Tanagers and Allies',

  // Blackbirds and Orioles
  'Troupials and Allies': 'Blackbirds and Orioles',

  // Finches and Allies
  'Finches, Euphonias, and Allies': 'Finches and Allies',
  'Waxbills and Allies': 'Finches and Allies',
  'Whydahs and Indigobirds': 'Finches and Allies',
  'Weavers and Allies': 'Finches and Allies',

  // Swifts and Swallows combined
  'Swifts': 'Swifts and Swallows',
  'Swallows': 'Swifts and Swallows',

  // Cuckoos and Allies
  'Cuckoos': 'Cuckoos and Allies',
  'Turacos': 'Cuckoos and Allies',

  // Caribbean and tropical families
  'Todies': 'Kingfishers, Motmots, and Allies',
  'Palmchat': 'Waxwings, Dippers, and Allies',
  'Chat-Tanagers': 'Tanagers and Allies',
  'Cuban Warblers': 'Warblers',
  'Olive Warbler': 'Warblers',
  'Reed Warblers and Allies': 'Warblers',
  'Bush Warblers and Allies': 'Warblers',

  // Exotic/introduced families
  'Cassowaries and Emu': 'Game Birds',
  'Rheas': 'Game Birds',
  'Magpie Goose': 'Ducks, Geese, and Waterfowl',
  'Sandgrouse': 'Game Birds',
  'Hornbills': 'Kingfishers, Motmots, and Allies',
  'Tyrant Flycatchers': 'Flycatchers',
  'Monarch Flycatchers': 'Flycatchers',
  'Grassbirds and Allies': 'Warblers',
  'Laughingthrushes and Allies': 'Thrushes, Mockingbirds, and Allies',
  'White-eyes, Yuhinas, and Allies': 'Warblers',
  'Penduline-Tits': 'Chickadees, Nuthatches, and Allies',
  'Parrotbills': 'Chickadees, Nuthatches, and Allies',
}

/**
 * Get the display group name for a given eBird family name.
 * Returns the original family name if no mapping exists.
 */
export function getDisplayGroup(familyComName: string): string {
  return FAMILY_TO_GROUP[familyComName] ?? familyComName
}

/**
 * Ecological display order for groups.
 *
 * Mostly follows taxonomic order but with targeted adjustments
 * for beginner-friendliness:
 * - Water-associated groups consolidated near the top
 * - Raptors grouped: Hawks → Falcons → Owls
 * - Swifts moved next to Swallows (ecological lookalikes)
 *
 * Groups not in this list are sorted after all listed groups,
 * ordered by their minimum taxonOrder.
 */
const ECOLOGICAL_GROUP_ORDER: string[] = [
  // Water birds
  'Ducks, Geese, and Waterfowl',
  'Flamingos, Grebes, and Loons',
  'Gulls, Terns, and Skuas',
  'Auks',
  'Tubenoses',
  'Pelicans, Cormorants, and Allies',
  'Herons and Allies',
  'Shorebirds',
  'Rails, Cranes, and Allies',
  'Game Birds',
  // Land non-passerines
  'Pigeons and Doves',
  'Cuckoos and Allies',
  'Hummingbirds',
  'Nightjars and Allies',
  'Vultures, Hawks, and Allies',
  'Falcons',
  'Owls',
  'Trogons',
  'Kingfishers, Motmots, and Allies',
  'Toucans, Barbets, and Allies',
  'Woodpeckers',
  'Parrots',
  // Suboscine passerines
  'Antbirds and Allies',
  'Ovenbirds and Woodcreepers',
  'Flycatchers',
  'Cotingas, Manakins, and Allies',
  // Oscine passerines
  'Shrikes and Vireos',
  'Crows and Jays',
  'Swifts and Swallows',
  'Chickadees, Nuthatches, and Allies',
  'Wrens and Gnatcatchers',
  'Waxwings, Dippers, and Allies',
  'Warblers',
  'Pipits and Larks',
  'Sparrows and Allies',
  'Finches and Allies',
  'Tanagers and Allies',
  'Thrushes, Mockingbirds, and Allies',
  'Cardinals and Allies',
  'Blackbirds and Orioles',
]

/** Pre-computed index map for O(1) lookups */
const GROUP_ORDER_INDEX = new Map<string, number>(
  ECOLOGICAL_GROUP_ORDER.map((name, i) => [name, i])
)

/**
 * Get the ecological sort key for a display group.
 * Groups in the ecological order get their index (0-based).
 * Unknown groups get a high value so they sort after known groups,
 * with fallbackTaxonOrder used to order among unknowns.
 */
export function getGroupSortKey(groupName: string, fallbackTaxonOrder: number): number {
  const idx = GROUP_ORDER_INDEX.get(groupName)
  if (idx !== undefined) return idx
  // Unknown groups go after all known groups, sorted by taxon order
  return ECOLOGICAL_GROUP_ORDER.length + fallbackTaxonOrder / 100000
}
