// Curated species lists extracted from GoalBirdsTab for reuse

// Curated Regional Icons — signature/must-see birds for each North American region
// Derived from pipeline config curated data
export const REGIONAL_ICONS: Array<{ region: string; regionKey: string; emoji: string; speciesCodes: string[] }> = [
  {
    region: 'Southwest',
    regionKey: 'southwest',
    emoji: '🌵',
    speciesCodes: ['greroa', 'gamqua', 'phaino', 'paired', 'gilfli'],
  },
  {
    region: 'Southeast',
    regionKey: 'southeast',
    emoji: '🌿',
    speciesCodes: ['swtkit', 'flsjay', 'prowar', 'recwoo', 'bnhnut'],
  },
  {
    region: 'Northeast',
    regionKey: 'northeast',
    emoji: '🍂',
    speciesCodes: ['bicthr', 'atlpuf', 'comeid', 'amewoo'],
  },
  {
    region: 'Midwest',
    regionKey: 'midwest',
    emoji: '🌾',
    speciesCodes: ['henspa', 'dickci', 'belvir', 'grpchi', 'sancra'],
  },
  {
    region: 'Rockies',
    regionKey: 'rockies',
    emoji: '⛰️',
    speciesCodes: ['whtpta1', 'bkrfin', 'clanut', 'amedip', 'stejay'],
  },
  {
    region: 'West Coast',
    regionKey: 'westcoast',
    emoji: '🌊',
    speciesCodes: ['tufpuf', 'spoowl', 'marmur', 'blkoys'],
  },
  {
    region: 'Alaska',
    regionKey: 'alaska',
    emoji: '❄️',
    speciesCodes: ['speeid', 'gyrfal', 'brtcur', 'snoowl1', 'yebloo'],
  },
  {
    region: 'Hawaii',
    regionKey: 'hawaii',
    emoji: '🌺',
    speciesCodes: ['hawgoo', 'apapan', 'iiwi'],
  },
]

// Curated Colorful Characters — show-stopper birds known for striking, vivid plumage
// Derived from curated species tags in pipeline config
export const COLORFUL_CHARACTERS: string[] = [
  'paibun',   // Painted Bunting — arguably North America's most colorful bird
  'scatan',   // Scarlet Tanager — brilliant red with jet-black wings
  'verfly',   // Vermilion Flycatcher — electric red male
  'rosspo1',  // Roseate Spoonbill — hot pink wading bird
  'wooduc',   // Wood Duck — intricate iridescent plumage
  'purgal2',  // Purple Gallinule — vivid purple, blue, and green
  'westan',   // Western Tanager — yellow, orange, and black
  'lazbun',   // Lazuli Bunting — turquoise and cinnamon
  'indbun',   // Indigo Bunting — deep blue male
  'norcar',   // Northern Cardinal — brilliant red
  'bkhgro',   // Black-headed Grosbeak — rich orange and black
  'amegfi',   // American Goldfinch — canary yellow
  'harduc',   // Harlequin Duck — bold harlequin pattern
  'grefla2',  // American Flamingo — vivid pink
  'varthr',   // Varied Thrush — striking orange and slate
  'bkbwar',   // Blackburnian Warbler — brilliant orange throat
  'amered',   // American Redstart — bright orange patches
  'bulori',   // Bullock's Oriole — vivid orange and black
  'vigswa',   // Violet-green Swallow — iridescent green and violet
  'cedwax',   // Cedar Waxwing — sleek with red/yellow wax-tips
]

// Curated Owls & Nightbirds — nocturnal species requiring special effort to find
// Owls, nightjars, nighthawks, poorwills, and other nightbirds of North America
// NOTE: Could be made dynamic using familyGroups display groups "Owls" + "Nightjars and Allies"
// via getDisplayGroup(). Hardcoded list is curated to highlight the most-wanted species only.
export const OWLS_NIGHTBIRDS: string[] = [
  'grhowl',    // Great Horned Owl — iconic large owl, widespread
  'snoowl1',   // Snowy Owl — spectacular Arctic visitor, beloved irruptive species
  'brdowl',    // Barred Owl — distinctive hooting owl of eastern forests
  'grgowl',    // Great Gray Owl — massive boreal owl, highly sought after
  'brnowl',    // American Barn Owl — ghostly pale barn owl
  'easowl1',   // Eastern Screech-Owl — small cryptic owl of eastern woodlands
  'wesowl1',   // Western Screech-Owl — western counterpart of Eastern Screech
  'nohowl',    // Northern Hawk Owl — diurnal boreal owl, hunts like a hawk
  'sheowl',    // Short-eared Owl — open-country owl, crepuscular hunter
  'loeowl',    // Long-eared Owl — secretive roosting owl, rare to find
  'borowl',    // Boreal Owl — elusive northern forest specialist
  'nswowl',    // Northern Saw-whet Owl — tiny and endearing, migrates in large numbers
  'burowl',    // Burrowing Owl — unique ground-nesting owl, often diurnal
  'nopowl',    // Northern Pygmy-Owl — tiny but fierce predator of western forests
  'elfowl',    // Elf Owl — world's smallest owl, nests in cacti
  'flaowl',    // Flammulated Owl — tiny insectivorous mountain owl
  'fepowl',    // Ferruginous Pygmy-Owl — small owl of southern borderlands
  'spoowl',    // Spotted Owl — old-growth forest specialist, conservation icon
  'easwpw1',   // Eastern Whip-poor-will — haunting song of eastern summer nights
  'souwpw1',   // Mexican Whip-poor-will — western whip-poor-will of pine forests
  'chwwid',    // Chuck-will's-widow — largest North American nightjar
  'compoo',    // Common Poorwill — smallest North American nightjar, hibernates!
  'comnig',    // Common Nighthawk — aerial insectivore of open skies
  'lesnig',    // Lesser Nighthawk — southwestern nighthawk
  'compau',    // Common Pauraque — tropical nightjar of southern Texas
]

// Curated Raptors — hawks, eagles, falcons, ospreys, kites, harriers, and vultures
// NOTE: Could be made dynamic using familyGroups display groups "Vultures, Hawks, and Allies" + "Falcons"
// via getDisplayGroup(). Hardcoded list is curated to highlight the most-wanted species only.
export const RAPTORS: string[] = [
  'osprey',    // Osprey — fish-hunting raptor, dramatic dives
  'baleag',    // Bald Eagle — national symbol, unmistakable adult plumage
  'goleag',    // Golden Eagle — majestic mountain and cliff hunter
  'swahaw',    // Swainson's Hawk — long-distance migrant, spectacular kettles
  'rethaw',    // Red-tailed Hawk — quintessential North American hawk
  'coohaw',    // Cooper's Hawk — agile accipiter of woodland edges
  'shshaw',    // Sharp-shinned Hawk — smallest North American accipiter
  'norhar2',   // Northern Harrier — low-coursing marsh hawk, buoyant flight
  'miskit',    // Mississippi Kite — graceful kite of southern river bottoms
  'swtkit',    // Swallow-tailed Kite — spectacular fork-tailed kite of SE US
  'whtkit',    // White-tailed Kite — pale hovering kite of western grasslands
  'snakit',    // Snail Kite — specialist on apple snails, Florida wetlands
  'brwhaw',    // Broad-winged Hawk — spring/fall migration kettle spectacle
  'reshaw',    // Red-shouldered Hawk — riparian forest hawk of eastern US
  'ferhaw',    // Ferruginous Hawk — largest North American buteo, prairie specialist
  'rolhaw',    // Rough-legged Hawk — Arctic breeder, winter visitor to grasslands
  'prafal',    // Prairie Falcon — pale falcon of open western landscapes
  'merlin',    // Merlin — compact, fast falcon of boreal forests and coasts
  'amekes',    // American Kestrel — colorful smallest falcon, hovers in place
  'perfal',    // Peregrine Falcon — fastest animal on Earth, stoops at prey
  'gyrfal',    // Gyrfalcon — massive Arctic falcon, rare and thrilling winter visitor
  'turvul',    // Turkey Vulture — widespread soaring scavenger, wobbling flight
  'blkvul',    // Black Vulture — short-tailed vulture, flapping flight style
  'calcon',    // California Condor — largest North American land bird, conservation story
  'y00678',    // Crested Caracara — unusual raptor with carrion and insect diet
]

// Curated LBJs — Little Brown Jobs: the notoriously tricky small brown birds
// Sparrows, wrens, pipits, juncos, and related species that challenge even experienced birders
export const LBJS: string[] = [
  'sonspa',    // Song Sparrow — quintessential LBJ, streaked brown, ubiquitous
  'swaspa',    // Swamp Sparrow — rusty-winged marsh sparrow
  'savspa',    // Savannah Sparrow — grassland sparrow, fine breast streaking
  'whtspa',    // White-throated Sparrow — bold white throat, tan or white morph
  'whcspa',    // White-crowned Sparrow — crisp black-and-white head stripes
  'chispa',    // Chipping Sparrow — red cap, black eye line, tidy suburban sparrow
  'fiespa',    // Field Sparrow — plain face, pink bill, bouncing-ball song
  'foxspa',    // Fox Sparrow — largest sparrow, thick-billed, rich rufous
  'larspa',    // Lark Sparrow — harlequin face pattern, central breast spot
  'daejun',    // Dark-eyed Junco — the "snowbird", slate-gray with white outer tail
  'amtspa',    // American Tree Sparrow — bicolored bill, rusty cap, winter visitor
  'graspa',    // Grasshopper Sparrow — flat-headed, flat-backed, flat-sounding
  'henspa',    // Henslow's Sparrow — olive-headed, secretive grass dweller
  'lecspa',    // LeConte's Sparrow — buffy-orange, extremely secretive marsh sparrow
  'linspa',    // Lincoln's Sparrow — buffy-washed breast, fine streaking
  'amepip',    // American Pipit — long-tailed ground bird, bobs tail incessantly
  'carwre',    // Carolina Wren — loud voice for small body, rufous with white supercilium
  'bewwre',    // Bewick's Wren — long tail, bold white eyebrow, western counterpart
  'houwre',    // Northern House Wren — plain brown, chattering song, cavity nester
  'marwre',    // Marsh Wren — bold white eyebrow, woven nest over water
  'rocwre',    // Rock Wren — pale gray-brown, bobbing behavior on rocky slopes
  'cacwre',    // Cactus Wren — largest North American wren, spotted chest
  'spotow',    // Spotted Towhee — rufous sides, bold spotting on wings
  'eastow',    // Eastern Towhee — classic "drink-your-teeeea" eastern counterpart
  'laplon',    // Lapland Longspur — Arctic breeder, abundant winter grassland bird
]
