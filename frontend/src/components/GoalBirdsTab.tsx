import { useState, useEffect } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'
import type { Species } from './types'
import { FamilyGroupSkeleton } from './Skeleton'
import SpeciesInfoCard from './SpeciesInfoCard'

export default function GoalBirdsTab() {
  const { isSpeciesSeen } = useLifeList()
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [loading, setLoading] = useState(true)
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingListId, setDeletingListId] = useState<string | null>(null)

  // Species search/add state
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState('')
  const [showDuplicateToast, setShowDuplicateToast] = useState('')
  const [createListError, setCreateListError] = useState('')

  // Auto-clear toast messages after 3 seconds
  useEffect(() => {
    if (!showSuccessToast) return
    const timer = setTimeout(() => setShowSuccessToast(''), 3000)
    return () => clearTimeout(timer)
  }, [showSuccessToast])

  useEffect(() => {
    if (!showDuplicateToast) return
    const timer = setTimeout(() => setShowDuplicateToast(''), 3000)
    return () => clearTimeout(timer)
  }, [showDuplicateToast])

  // List picker for one-tap add with multiple goal lists
  const [listPickerSpecies, setListPickerSpecies] = useState<Species | null>(null)

  // Filter within current list
  const [listFilterTerm, setListFilterTerm] = useState('')

  // Suggestions section state
  const [showRarestSuggestions, setShowRarestSuggestions] = useState(true)
  const [showHardestSuggestions, setShowHardestSuggestions] = useState(true)
  const [showEasyWinsSuggestions, setShowEasyWinsSuggestions] = useState(true)
  const [showMigrantSuggestions, setShowMigrantSuggestions] = useState(true)
  const [showRegionalIconsSuggestions, setShowRegionalIconsSuggestions] = useState(true)
  const [showSeasonalSpecialtiesSuggestions, setShowSeasonalSpecialtiesSuggestions] = useState(true)
  const [showColorfulCharactersSuggestions, setShowColorfulCharactersSuggestions] = useState(true)
  const [showOwlsNightbirdsSuggestions, setShowOwlsNightbirdsSuggestions] = useState(true)
  const [showRaptorsSuggestions, setShowRaptorsSuggestions] = useState(true)
  const [showLBJsSuggestions, setShowLBJsSuggestions] = useState(true)
  const [showAlmostCompleteFamiliesSuggestions, setShowAlmostCompleteFamiliesSuggestions] = useState(true)

  // Curated Regional Icons — signature/must-see birds for each North American region
  // Derived from pipeline config curated data
  const REGIONAL_ICONS: Array<{ region: string; regionKey: string; emoji: string; speciesCodes: string[] }> = [
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
  const COLORFUL_CHARACTERS: string[] = [
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
  const OWLS_NIGHTBIRDS: string[] = [
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
  const RAPTORS: string[] = [
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
  const LBJS: string[] = [
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

  // Species info card state
  const [selectedSpeciesCard, setSelectedSpeciesCard] = useState<Species | null>(null)

  // Load goal lists from IndexedDB on mount
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        setLoading(true)
        const lists = await goalListsDB.getAllLists()
        setGoalLists(lists)

        // Restore previously active list from localStorage, or use first list
        const savedActiveListId = localStorage.getItem('activeGoalListId')
        if (lists.length > 0) {
          // If saved ID exists and is in the list, use it; otherwise use first list
          const validSavedId = savedActiveListId && lists.some((list) => list.id === savedActiveListId)
          setActiveListId(validSavedId ? savedActiveListId : lists[0].id)
          console.log(`Restored active goal list: ${validSavedId ? savedActiveListId : lists[0].id}`)
        }
        setLoading(false)
      } catch (error) {
        console.error('Failed to load goal lists:', error)
        setLoading(false)
      }
    }

    loadGoalLists()
  }, [])

  // Save active list ID to localStorage whenever it changes, and reset list filter
  useEffect(() => {
    if (activeListId) {
      localStorage.setItem('activeGoalListId', activeListId)
      console.log(`Saved active goal list ID to localStorage: ${activeListId}`)
    } else {
      localStorage.removeItem('activeGoalListId')
    }
    // Reset the within-list filter when switching lists
    setListFilterTerm('')
  }, [activeListId])

  // Load species metadata for search/add functionality
  useEffect(() => {
    const loadSpecies = async () => {
      try {
        const response = await fetch('/api/species')
        if (!response.ok) return
        const data: Species[] = await response.json()
        setAllSpecies(data)
        console.log('Goal Birds: Loaded species metadata', data.length)
      } catch (error) {
        console.error('Failed to load species for Goal Birds:', error)
      }
    }
    loadSpecies()
  }, [])

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      setCreateListError('Please enter a list name')
      return
    }

    // Check for duplicate list names
    const trimmedName = newListName.trim()
    const duplicateExists = goalLists.some(
      (list) => list.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (duplicateExists) {
      setCreateListError(`A list named "${trimmedName}" already exists`)
      return
    }

    try {
      const newList: GoalList = {
        id: crypto.randomUUID(),
        name: trimmedName,
        speciesCodes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await goalListsDB.saveList(newList)

      // Update state
      setGoalLists((prev) => [...prev, newList])
      setActiveListId(newList.id)

      // Reset form
      setShowCreateDialog(false)
      setNewListName('')
      setCreateListError('')
    } catch (error) {
      console.error('Failed to create goal list:', error)
    }
  }

  const handleStartRename = (list: GoalList) => {
    setRenamingListId(list.id)
    setRenameValue(list.name)
  }

  const handleConfirmRename = async () => {
    if (!renamingListId || !renameValue.trim()) {
      return
    }

    try {
      const updatedList = await goalListsDB.renameList(renamingListId, renameValue.trim())
      console.log(`Renamed goal list to "${updatedList.name}"`)

      // Update state
      setGoalLists((prev) =>
        prev.map((list) =>
          list.id === renamingListId
            ? { ...list, name: updatedList.name, updatedAt: updatedList.updatedAt }
            : list
        )
      )

      // Reset rename state
      setRenamingListId(null)
      setRenameValue('')
    } catch (error) {
      console.error('Failed to rename goal list:', error)
    }
  }

  const handleCancelRename = () => {
    setRenamingListId(null)
    setRenameValue('')
  }

  const handleStartDelete = (list: GoalList) => {
    setDeletingListId(list.id)
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingListId) {
      return
    }

    try {
      await goalListsDB.deleteList(deletingListId)
      console.log(`Deleted goal list: ${deletingListId}`)

      // Update state: remove the deleted list
      const remainingLists = goalLists.filter((list) => list.id !== deletingListId)
      setGoalLists(remainingLists)

      // If the deleted list was the active list, switch to another or set to null
      if (deletingListId === activeListId) {
        if (remainingLists.length > 0) {
          setActiveListId(remainingLists[0].id)
        } else {
          setActiveListId(null)
        }
      }

      // Reset delete state
      setShowDeleteDialog(false)
      setDeletingListId(null)
    } catch (error) {
      console.error('Failed to delete goal list:', error)
    }
  }

  const handleCancelDelete = () => {
    setShowDeleteDialog(false)
    setDeletingListId(null)
  }

  // Handle species search and add — shows list picker if multiple lists exist
  const handleAddSpecies = (species: Species) => {
    if (!activeListId) return

    if (goalLists.length > 1) {
      // Multiple lists: show quick list selector (no confirmation dialog)
      setListPickerSpecies(species)
    } else {
      // Single list: add directly, no picker needed
      void handleAddSpeciesToList(species, activeListId)
    }
  }

  // Performs the actual add to a specific list (called from list picker or directly)
  const handleAddSpeciesToList = async (species: Species, listId: string) => {
    // Close picker immediately (instant UX)
    setListPickerSpecies(null)

    try {
      const targetList = goalLists.find((list) => list.id === listId)
      if (!targetList) return

      // Check for duplicates
      if (targetList.speciesCodes.includes(species.speciesCode)) {
        setShowDuplicateToast(`${species.comName} is already in ${targetList.name}`)
        setSearchQuery('')
        setShowSuggestions(false)
        return
      }

      // Add species to the list
      await goalListsDB.addSpeciesToList(listId, species.speciesCode)
      console.log(`Added ${species.comName} (${species.speciesCode}) to goal list "${targetList.name}"`)

      // Update state
      setGoalLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? { ...list, speciesCodes: [...list.speciesCodes, species.speciesCode] }
            : list
        )
      )

      // Show success toast
      setShowSuccessToast(`Added ${species.comName} to ${targetList.name}`)

      // Clear search
      setSearchQuery('')
      setShowSuggestions(false)
    } catch (error) {
      console.error('Failed to add species to goal list:', error)
    }
  }

  // Handle species removal
  const handleRemoveSpecies = async (speciesCode: string, speciesName: string) => {
    if (!activeListId) return

    try {
      const activeList = goalLists.find((list) => list.id === activeListId)
      if (!activeList) return

      // Remove species from the list
      await goalListsDB.removeSpeciesFromList(activeListId, speciesCode)
      console.log(`Removed ${speciesName} (${speciesCode}) from goal list`)

      // Update state
      setGoalLists((prev) =>
        prev.map((list) =>
          list.id === activeListId
            ? { ...list, speciesCodes: list.speciesCodes.filter((code) => code !== speciesCode) }
            : list
        )
      )

      // Show success toast
      setShowSuccessToast(`Removed ${speciesName} from ${activeList.name}`)
    } catch (error) {
      console.error('Failed to remove species from goal list:', error)
    }
  }

  // Filter species based on search query
  const filteredSpecies = searchQuery.trim()
    ? allSpecies.filter((species) => {
        const query = searchQuery.toLowerCase()
        return (
          species.comName.toLowerCase().includes(query) ||
          species.sciName.toLowerCase().includes(query) ||
          species.speciesCode.toLowerCase().includes(query)
        )
      }).slice(0, 10) // Limit to 10 suggestions
    : []

  const activeList = goalLists.find((list) => list.id === activeListId)
  const deletingList = goalLists.find((list) => list.id === deletingListId)

  // Filter the species codes in the current active list by listFilterTerm
  const filteredListCodes: string[] = (() => {
    if (!activeList) return []
    if (!listFilterTerm.trim()) return activeList.speciesCodes
    const q = listFilterTerm.toLowerCase()
    return activeList.speciesCodes.filter((code) => {
      const species = allSpecies.find((s) => s.speciesCode === code)
      if (!species) return code.toLowerCase().includes(q)
      return (
        species.comName.toLowerCase().includes(q) ||
        species.sciName.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q)
      )
    })
  })()

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Goal Birds</h3>
        <FamilyGroupSkeleton itemCount={3} />
        <FamilyGroupSkeleton itemCount={2} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Goal Birds</h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-2 py-1 bg-[#2C3E7B] text-white text-[11px] font-medium rounded-md hover:bg-[#1f2d5a] transition-colors"
          >
            + New List
          </button>
        </div>

        {/* List selector */}
        {goalLists.length > 0 && (
          <div className="space-y-2">
            {renamingListId === activeListId ? (
              /* Inline rename input */
              <div className="flex gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename()
                    if (e.key === 'Escape') handleCancelRename()
                  }}
                  placeholder="Enter new name..."
                  className="flex-1 px-3 py-2 text-sm border border-[#2C3E7B] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                  autoFocus
                  data-testid="rename-input"
                />
                <button
                  onClick={handleConfirmRename}
                  disabled={!renameValue.trim()}
                  className="px-3 py-2 text-sm text-white bg-[#2C3E7B] rounded-lg hover:bg-[#1f2d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Save new name"
                  data-testid="rename-save-btn"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelRename}
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Cancel rename"
                  data-testid="rename-cancel-btn"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Normal list selector with rename button */
              <div className="flex gap-2">
                <select
                  value={activeListId || ''}
                  onChange={(e) => setActiveListId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                  data-testid="goal-list-selector"
                >
                  {goalLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.speciesCodes.length} birds)
                    </option>
                  ))}
                </select>
                {activeList && (
                  <>
                    <button
                      onClick={() => handleStartRename(activeList)}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
                      title="Rename list"
                      data-testid="rename-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleStartDelete(activeList)}
                      className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                      title="Delete list"
                      data-testid="delete-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100 mb-4">Create New Goal List</h4>

            <div className="space-y-4">
              <div>
                <label htmlFor="list-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  List Name
                </label>
                <input
                  id="list-name"
                  type="text"
                  value={newListName}
                  onChange={(e) => {
                    setNewListName(e.target.value)
                    if (createListError) setCreateListError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                  placeholder="e.g., Dream Birds"
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent bg-white dark:bg-gray-700 dark:text-gray-200 ${
                    createListError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  autoFocus
                />
                {createListError && (
                  <p className="text-xs text-red-600 mt-1" data-testid="create-list-error">
                    {createListError}
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCreateDialog(false)
                    setNewListName('')
                    setCreateListError('')
                  }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateList}
                  disabled={!newListName.trim()}
                  className="px-4 py-2 text-sm text-white bg-[#2C3E7B] rounded-lg hover:bg-[#1f2d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && deletingList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCancelDelete}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100 mb-4">Delete Goal List?</h4>

            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-300">
                  <span className="font-semibold">Warning:</span> You are about to delete the goal list{' '}
                  <span className="font-semibold">"{deletingList.name}"</span>
                  {deletingList.speciesCodes.length > 0 && (
                    <>
                      {' '}which contains <span className="font-semibold">{deletingList.speciesCodes.length} bird{deletingList.speciesCodes.length !== 1 ? 's' : ''}</span>
                    </>
                  )}.
                </p>
                <p className="text-sm text-red-800 dark:text-red-300 mt-2">
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelDelete}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  data-testid="delete-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                  data-testid="delete-confirm-btn"
                >
                  Delete List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List content or empty state */}
      <div className="flex-1 overflow-y-auto mt-3">
        {goalLists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <h4 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100 mb-2">No Goal Lists Yet</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Create your first goal list to start tracking birds you want to see.
            </p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-2 bg-[#2C3E7B] text-white text-sm font-medium rounded-lg hover:bg-[#1f2d5a] transition-colors"
            >
              Create Your First List
            </button>
          </div>
        ) : activeList ? (
          <div className="space-y-3">
            {/* Search/Add Species Interface */}
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Search species to add..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                  data-testid="species-search-input"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 dark:text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && searchQuery.trim() && filteredSpecies.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredSpecies.map((species) => (
                    <button
                      key={species.speciesCode}
                      onClick={() => handleAddSpecies(species)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                      data-testid={`species-suggestion-${species.speciesCode}`}
                    >
                      <div className="text-sm font-medium text-[#2C3E50] dark:text-gray-200">
                        {species.comName}
                      </div>
                      <div className="text-xs italic text-gray-600 dark:text-gray-400">
                        {species.sciName}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showSuggestions && searchQuery.trim() && filteredSpecies.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">No species found matching "{searchQuery}"</p>
                </div>
              )}
            </div>

            {/* Species in List */}
            {activeList.speciesCodes.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700">
                  <span className="font-medium">This list is empty.</span>
                  <br />
                  Search and add species above, or add from the Species tab.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Filter within list search bar */}
                <div className="relative">
                  <input
                    type="text"
                    value={listFilterTerm}
                    onChange={(e) => setListFilterTerm(e.target.value)}
                    placeholder="Filter list by name..."
                    className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                    data-testid="goal-list-filter-input"
                  />
                  {listFilterTerm ? (
                    <button
                      onClick={() => setListFilterTerm('')}
                      className="absolute right-2 top-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                      title="Clear filter"
                      data-testid="goal-list-filter-clear"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-2 top-1.5 h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </div>

                {/* Progress Summary */}
                {(() => {
                  const total = activeList.speciesCodes.length
                  const seenCount = activeList.speciesCodes.filter((code) => isSpeciesSeen(code)).length
                  const progressPct = total > 0 ? Math.round((seenCount / total) * 100) : 0
                  return (
                    <div className="space-y-1" data-testid="goal-list-progress-summary">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide" data-testid="goal-list-count">
                          {listFilterTerm.trim()
                            ? `${filteredListCodes.length} of ${activeList.speciesCodes.length} bird${activeList.speciesCodes.length !== 1 ? 's' : ''}`
                            : `${activeList.speciesCodes.length} bird${activeList.speciesCodes.length !== 1 ? 's' : ''} in list`}
                        </div>
                        <div
                          className="text-xs font-semibold text-green-700 dark:text-green-400"
                          data-testid="goal-list-seen-count"
                        >
                          {seenCount} of {total} seen
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div
                        className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden"
                        data-testid="goal-list-progress-bar"
                        title={`${progressPct}% complete`}
                      >
                        <div
                          className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                          data-testid="goal-list-progress-fill"
                        />
                      </div>
                    </div>
                  )
                })()}

                {filteredListCodes.length === 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No species match "{listFilterTerm}"</p>
                  </div>
                ) : (
                  filteredListCodes.map((code) => {
                    const species = allSpecies.find((s) => s.speciesCode === code)
                    const seen = isSpeciesSeen(code)
                    return (
                      <div
                        key={code}
                        className={`px-2 py-1 rounded flex items-center justify-between transition-colors group ${
                          seen
                            ? 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                            : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        data-testid={`goal-species-${code}`}
                      >
                        {/* Clickable species info area */}
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => species && setSelectedSpeciesCard(species)}
                          title={species ? `View ${species.comName} info` : code}
                          data-testid={`goal-species-info-btn-${code}`}
                        >
                          <div
                            className={`text-sm font-medium truncate ${
                              seen
                                ? 'line-through text-gray-400 dark:text-gray-500'
                                : 'text-[#2C3E50] dark:text-gray-200 hover:text-[#2C3E7B] dark:hover:text-blue-400'
                            }`}
                            data-testid={seen ? `goal-species-seen-${code}` : `goal-species-unseen-${code}`}
                          >
                            {species ? species.comName : code}
                          </div>
                          {species && (
                            <div className={`text-xs italic truncate ${seen ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}>
                              {species.sciName}
                            </div>
                          )}
                          {seen && (
                            <div className="text-xs text-green-600 font-medium mt-0.5">
                              ✓ Seen
                            </div>
                          )}
                        </button>
                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {/* Info button */}
                          {species && (
                            <button
                              onClick={() => setSelectedSpeciesCard(species)}
                              className="p-1 text-[#2C3E7B] hover:bg-[#2C3E7B] hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100"
                              title="View species info"
                              data-testid={`goal-species-info-icon-${code}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveSpecies(code, species?.comName || code)}
                            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove from list"
                            data-testid={`remove-species-${code}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Rarest in North America Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const rarestSuggestions = allSpecies
                .filter((sp) => sp.isRestrictedRange && !isSpeciesSeen(sp.speciesCode))
                .slice(0, 20) // Take up to 20 unseen restricted-range species

              if (rarestSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowRarestSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                    data-testid="rarest-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-bold text-sm">📍</span>
                      <span className="text-sm font-semibold text-amber-800">Rarest in North America</span>
                      <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                        {rarestSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-amber-600 transition-transform ${showRarestSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showRarestSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="rarest-suggestions-list">
                      {/* Restricted-range species not yet on your life list */}
                      {rarestSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`rarest-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                                  📍 Rare
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`rarest-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`rarest-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`rarest-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Easy Wins Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with Easy difficulty (score < 0.25), sorted by score ascending (easiest/highest probability first)
              const easyWinsSuggestions = allSpecies
                .filter((sp) => sp.difficultyScore < 0.25 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => a.difficultyScore - b.difficultyScore)
                .slice(0, 20) // Top 20 easiest unseen species

              if (easyWinsSuggestions.length === 0) return null

              const getEasyBadgeStyle = (score: number) => {
                if (score < 0.10) return { bg: 'bg-green-100', text: 'text-green-800', label: 'Very Easy' }
                if (score < 0.18) return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Easy' }
                return { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Fairly Easy' }
              }

              return (
                <div className="mt-4" data-testid="easy-wins-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowEasyWinsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                    data-testid="easy-wins-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 font-bold text-sm">⭐</span>
                      <span className="text-sm font-semibold text-green-800">Easy Wins</span>
                      <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-medium">
                        {easyWinsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-green-600 transition-transform ${showEasyWinsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showEasyWinsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="easy-wins-suggestions-list">
                      {easyWinsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getEasyBadgeStyle(sp.difficultyScore)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`easy-wins-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`easy-wins-probability-badge-${sp.speciesCode}`}
                                >
                                  ⭐ {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`easy-wins-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`easy-wins-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`easy-wins-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Hardest to Find Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with Very Hard difficulty, sorted by score descending (hardest first)
              const hardestSuggestions = allSpecies
                .filter((sp) => sp.difficultyScore >= 0.75 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => b.difficultyScore - a.difficultyScore)
                .slice(0, 20) // Top 20 hardest unseen species

              if (hardestSuggestions.length === 0) return null

              const getDifficultyBadgeStyle = (score: number) => {
                if (score >= 0.90) return { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Extremely Hard' }
                if (score >= 0.75) return { bg: 'bg-red-100', text: 'text-red-800', label: 'Very Hard' }
                return { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Hard' }
              }

              return (
                <div className="mt-4" data-testid="hardest-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowHardestSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    data-testid="hardest-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-purple-600 font-bold text-sm">🔭</span>
                      <span className="text-sm font-semibold text-purple-800">Hardest to Find</span>
                      <span className="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full font-medium">
                        {hardestSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-purple-600 transition-transform ${showHardestSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showHardestSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="hardest-suggestions-list">
                      {/* Species with the lowest average occurrence probability */}
                      {hardestSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getDifficultyBadgeStyle(sp.difficultyScore)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`hardest-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`hardest-difficulty-badge-${sp.speciesCode}`}
                                >
                                  🔭 {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`hardest-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`hardest-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`hardest-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Long-Distance Migrants Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with rangeShiftScore >= 0.5, sorted by score descending (biggest migrants first)
              const migrantSuggestions = allSpecies
                .filter((sp) => (sp.rangeShiftScore ?? 0) >= 0.5 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => (b.rangeShiftScore ?? 0) - (a.rangeShiftScore ?? 0))
                .slice(0, 20) // Top 20 most dramatic long-distance migrants

              if (migrantSuggestions.length === 0) return null

              const getMigrantBadgeStyle = (score: number) => {
                if (score >= 0.875) return { bg: 'bg-sky-100', text: 'text-sky-800', label: 'Epic Migration' }
                if (score >= 0.75) return { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Long Range' }
                return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Migratory' }
              }

              return (
                <div className="mt-4" data-testid="migrants-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowMigrantSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                    data-testid="migrants-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sky-600 font-bold text-sm">🦅</span>
                      <span className="text-sm font-semibold text-sky-800">Long-Distance Migrants</span>
                      <span className="text-xs bg-sky-200 text-sky-800 px-1.5 py-0.5 rounded-full font-medium">
                        {migrantSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-sky-600 transition-transform ${showMigrantSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showMigrantSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="migrants-suggestions-list">
                      {migrantSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getMigrantBadgeStyle(sp.rangeShiftScore ?? 0)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`migrants-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`migrants-shift-badge-${sp.speciesCode}`}
                                >
                                  🦅 {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`migrants-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 truncate mt-0.5">{sp.sciName}</p>
                            </div>
                            {/* Add / already-added button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`migrants-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`migrants-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Regional Icons Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)

              // Build flat list of regional icon species that are unseen
              // Each entry includes region info for grouping/labeling
              interface RegionalIconEntry {
                speciesCode: string
                comName: string
                sciName: string
                region: string
                regionKey: string
                emoji: string
              }

              const regionalIconEntries: RegionalIconEntry[] = []
              for (const regionGroup of REGIONAL_ICONS) {
                for (const code of regionGroup.speciesCodes) {
                  const sp = allSpecies.find((s) => s.speciesCode === code)
                  if (sp && !isSpeciesSeen(sp.speciesCode)) {
                    regionalIconEntries.push({
                      speciesCode: sp.speciesCode,
                      comName: sp.comName,
                      sciName: sp.sciName,
                      region: regionGroup.region,
                      regionKey: regionGroup.regionKey,
                      emoji: regionGroup.emoji,
                    })
                  }
                }
              }

              if (regionalIconEntries.length === 0) return null

              // Group entries by region for display
              const groupedByRegion: { [region: string]: RegionalIconEntry[] } = {}
              for (const entry of regionalIconEntries) {
                if (!groupedByRegion[entry.region]) groupedByRegion[entry.region] = []
                groupedByRegion[entry.region].push(entry)
              }

              // Only show regions that have at least one unseen species
              const regionsToShow = REGIONAL_ICONS.filter((rg) => groupedByRegion[rg.region]?.length > 0)

              return (
                <div className="mt-4" data-testid="regional-icons-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowRegionalIconsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                    data-testid="regional-icons-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-teal-600 font-bold text-sm">🗺️</span>
                      <span className="text-sm font-semibold text-teal-800">Regional Icons</span>
                      <span className="text-xs bg-teal-200 text-teal-800 px-1.5 py-0.5 rounded-full font-medium">
                        {regionalIconEntries.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-teal-600 transition-transform ${showRegionalIconsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showRegionalIconsSuggestions && (
                    <div className="mt-1 space-y-3" data-testid="regional-icons-suggestions-list">
                      {regionsToShow.map((regionGroup) => {
                        const entries = groupedByRegion[regionGroup.region] || []
                        return (
                          <div key={regionGroup.regionKey} data-testid={`regional-icons-group-${regionGroup.regionKey}`}>
                            {/* Region label */}
                            <div className="flex items-center gap-1.5 px-1 mb-1">
                              <span className="text-sm">{regionGroup.emoji}</span>
                              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                                {regionGroup.region}
                              </span>
                            </div>
                            {/* Species in this region */}
                            <div className="space-y-1">
                              {entries.map((entry) => {
                                const alreadyInList = activeListCodes.has(entry.speciesCode)
                                const sp = allSpecies.find((s) => s.speciesCode === entry.speciesCode)
                                if (!sp) return null
                                return (
                                  <div
                                    key={entry.speciesCode}
                                    className={`flex items-center justify-between px-2 py-1 rounded ${
                                      alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                    data-testid={`regional-icons-suggestion-${entry.speciesCode}`}
                                  >
                                    {/* Species info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                          {entry.comName}
                                        </span>
                                        <span
                                          className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                          data-testid={`regional-icons-region-badge-${entry.speciesCode}`}
                                        >
                                          {regionGroup.emoji} {regionGroup.region}
                                        </span>
                                        {alreadyInList && (
                                          <span
                                            className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                            data-testid={`regional-icons-in-list-badge-${entry.speciesCode}`}
                                          >
                                            ✓ In list
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Add button */}
                                    {alreadyInList ? (
                                      <div
                                        className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                        title="Already in this goal list"
                                        data-testid={`regional-icons-already-added-${entry.speciesCode}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleAddSpecies(sp)}
                                        className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                        title={`Add ${entry.comName} to goal list`}
                                        data-testid={`regional-icons-add-btn-${entry.speciesCode}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Seasonal Specialties Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with high seasonality score (>= 0.5), sorted by score descending
              const seasonalSuggestions = allSpecies
                .filter((sp) => (sp.seasonalityScore ?? 0) >= 0.5 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => (b.seasonalityScore ?? 0) - (a.seasonalityScore ?? 0))
                .slice(0, 20) // Top 20 most seasonal unseen species

              if (seasonalSuggestions.length === 0) return null

              const getSeasonLabel = (peakWeek: number): string => {
                if (peakWeek === 0) return 'Year-round'
                if (peakWeek <= 13) return 'Winter (Jan–Mar)'
                if (peakWeek <= 26) return 'Spring (Apr–Jun)'
                if (peakWeek <= 39) return 'Summer (Jul–Sep)'
                return 'Fall (Oct–Dec)'
              }

              const getSeasonColor = (peakWeek: number) => {
                if (peakWeek === 0) return { bg: 'bg-gray-100', text: 'text-gray-700' }
                if (peakWeek <= 13) return { bg: 'bg-blue-100', text: 'text-blue-800' }
                if (peakWeek <= 26) return { bg: 'bg-pink-100', text: 'text-pink-800' }
                if (peakWeek <= 39) return { bg: 'bg-yellow-100', text: 'text-yellow-800' }
                return { bg: 'bg-orange-100', text: 'text-orange-800' }
              }

              return (
                <div className="mt-4" data-testid="seasonal-specialties-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowSeasonalSpecialtiesSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
                    data-testid="seasonal-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-600 font-bold text-sm">🗓️</span>
                      <span className="text-sm font-semibold text-cyan-800">Seasonal Specialties</span>
                      <span className="text-xs bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded-full font-medium">
                        {seasonalSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-cyan-600 transition-transform ${showSeasonalSpecialtiesSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showSeasonalSpecialtiesSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="seasonal-suggestions-list">
                      {seasonalSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const seasonLabel = getSeasonLabel(sp.peakWeek ?? 0)
                        const seasonColor = getSeasonColor(sp.peakWeek ?? 0)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`seasonal-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${seasonColor.bg} ${seasonColor.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`seasonal-season-badge-${sp.speciesCode}`}
                                >
                                  🗓️ {seasonLabel}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`seasonal-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`seasonal-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`seasonal-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Colorful Characters Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated colorful species that are unseen — curated show-stoppers
              const colorfulSuggestions = COLORFUL_CHARACTERS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (colorfulSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="colorful-characters-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowColorfulCharactersSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-fuchsia-50 border border-fuchsia-200 rounded-lg hover:bg-fuchsia-100 transition-colors"
                    data-testid="colorful-characters-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-fuchsia-600 font-bold text-sm">🎨</span>
                      <span className="text-sm font-semibold text-fuchsia-800">Colorful Characters</span>
                      <span className="text-xs bg-fuchsia-200 text-fuchsia-800 px-1.5 py-0.5 rounded-full font-medium">
                        {colorfulSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-fuchsia-600 transition-transform ${showColorfulCharactersSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showColorfulCharactersSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="colorful-characters-list">
                      {colorfulSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`colorful-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`colorful-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-fuchsia-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`colorful-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🎨</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`colorful-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`colorful-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`colorful-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Owls & Nightbirds Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated nocturnal species that are unseen
              const owlsNightbirdsSuggestions = OWLS_NIGHTBIRDS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (owlsNightbirdsSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="owls-nightbirds-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowOwlsNightbirdsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                    data-testid="owls-nightbirds-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold text-sm">🦉</span>
                      <span className="text-sm font-semibold text-indigo-800">Owls &amp; Nightbirds</span>
                      <span className="text-xs bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium">
                        {owlsNightbirdsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-indigo-600 transition-transform ${showOwlsNightbirdsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showOwlsNightbirdsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="owls-nightbirds-list">
                      {owlsNightbirdsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`owls-nightbirds-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`owls-nightbirds-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`owls-nightbirds-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🦉</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`owls-nightbirds-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`owls-nightbirds-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`owls-nightbirds-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Raptors Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated raptor species that are unseen
              const raptorsSuggestions = RAPTORS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (raptorsSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="raptors-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowRaptorsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                    data-testid="raptors-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-bold text-sm">🦅</span>
                      <span className="text-sm font-semibold text-amber-800">Raptors</span>
                      <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                        {raptorsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-amber-600 transition-transform ${showRaptorsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showRaptorsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="raptors-list">
                      {raptorsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`raptors-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`raptors-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`raptors-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🦅</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`raptors-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`raptors-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`raptors-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* LBJs Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated LBJ species that are unseen
              const lbjsSuggestions = LBJS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (lbjsSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="lbjs-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowLBJsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors"
                    data-testid="lbjs-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-stone-600 font-bold text-sm">🐦</span>
                      <span className="text-sm font-semibold text-stone-800">LBJs (Little Brown Jobs)</span>
                      <span className="text-xs bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full font-medium">
                        {lbjsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-stone-600 transition-transform ${showLBJsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showLBJsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="lbjs-list">
                      {lbjsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            data-testid={`lbjs-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`lbjs-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`lbjs-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🐦</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`lbjs-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`lbjs-already-added-${sp.speciesCode}`}
                              >
                                ✓
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`lbjs-add-btn-${sp.speciesCode}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Almost Complete Families Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)

              // Group all species by family
              const familyMap = new Map<string, { total: number; seen: number; unseen: Species[] }>()
              for (const sp of allSpecies) {
                const family = sp.familyComName
                if (!family) continue
                if (!familyMap.has(family)) {
                  familyMap.set(family, { total: 0, seen: 0, unseen: [] })
                }
                const entry = familyMap.get(family)!
                entry.total++
                if (isSpeciesSeen(sp.speciesCode)) {
                  entry.seen++
                } else {
                  entry.unseen.push(sp)
                }
              }

              // Find families where user has seen >= 80% and at least 1 unseen
              const almostComplete = Array.from(familyMap.entries())
                .filter(([, data]) => {
                  if (data.total < 2) return false // Skip single-species families
                  const pct = data.seen / data.total
                  return pct >= 0.8 && data.unseen.length > 0
                })
                .sort((a, b) => {
                  // Sort by completion percentage descending
                  const pctA = a[1].seen / a[1].total
                  const pctB = b[1].seen / b[1].total
                  return pctB - pctA
                })

              if (almostComplete.length === 0) return null

              // Count total unseen species across all almost-complete families
              const totalUnseen = almostComplete.reduce((sum, [, data]) => sum + data.unseen.length, 0)

              return (
                <div className="mt-4" data-testid="almost-complete-families-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowAlmostCompleteFamiliesSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                    data-testid="almost-complete-families-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold text-sm">🏆</span>
                      <span className="text-sm font-semibold text-indigo-800">Almost Complete Families</span>
                      <span className="text-xs bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium">
                        {totalUnseen}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-indigo-600 transition-transform ${showAlmostCompleteFamiliesSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showAlmostCompleteFamiliesSuggestions && (
                    <div className="mt-1 space-y-3" data-testid="almost-complete-families-list">
                      {almostComplete.map(([familyName, data]) => {
                        const pct = Math.round((data.seen / data.total) * 100)
                        return (
                          <div key={familyName} data-testid={`almost-complete-family-${familyName.replace(/\s+/g, '-').toLowerCase()}`}>
                            {/* Family label with progress */}
                            <div className="flex items-center justify-between px-1 mb-1">
                              <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide truncate">
                                {familyName}
                              </span>
                              <span className="text-[10px] text-indigo-600 font-medium whitespace-nowrap ml-2">
                                {data.seen}/{data.total} ({pct}%)
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden mx-1 mb-1" style={{ width: 'calc(100% - 8px)' }}>
                              <div
                                className="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {/* Unseen species in this family */}
                            <div className="space-y-1">
                              {data.unseen.map((sp) => {
                                const alreadyInList = activeListCodes.has(sp.speciesCode)
                                return (
                                  <div
                                    key={sp.speciesCode}
                                    className={`flex items-center justify-between px-2 py-1 rounded ${
                                      alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                    data-testid={`almost-complete-suggestion-${sp.speciesCode}`}
                                  >
                                    {/* Species info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                                          {sp.comName}
                                        </span>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                                          {data.unseen.length === 1 ? 'Last one!' : `${data.unseen.length} left`}
                                        </span>
                                        {alreadyInList && (
                                          <span
                                            className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                            data-testid={`almost-complete-in-list-badge-${sp.speciesCode}`}
                                          >
                                            ✓ In list
                                          </span>
                                        )}
                                      </div>
                                            </div>

                                    {/* Add button */}
                                    {alreadyInList ? (
                                      <div
                                        className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                        title="Already in this goal list"
                                        data-testid={`almost-complete-already-added-${sp.speciesCode}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleAddSpecies(sp)}
                                        className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                                        title={`Add ${sp.comName} to goal list`}
                                        data-testid={`almost-complete-add-btn-${sp.speciesCode}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        ) : null}
      </div>

      {/* List Picker — quick selector when multiple goal lists exist */}
      {listPickerSpecies && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          data-testid="list-picker-overlay"
          onClick={() => setListPickerSpecies(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 w-72 mx-4"
            data-testid="list-picker-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100 truncate">Add to which list?</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{listPickerSpecies.comName}</p>
            </div>
            <div className="flex flex-col gap-2" data-testid="list-picker-options">
              {goalLists.map((list) => {
                const alreadyIn = list.speciesCodes.includes(listPickerSpecies.speciesCode)
                return (
                  <button
                    key={list.id}
                    onClick={() => {
                      if (!alreadyIn) void handleAddSpeciesToList(listPickerSpecies, list.id)
                      else setListPickerSpecies(null)
                    }}
                    disabled={alreadyIn}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      alreadyIn
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-[#f4f6fa] dark:bg-gray-700 hover:bg-[#e8ecf5] dark:hover:bg-gray-600 text-[#2C3E50] dark:text-gray-200 cursor-pointer'
                    }`}
                    data-testid={`list-picker-option-${list.id}`}
                    title={alreadyIn ? `${listPickerSpecies.comName} is already in ${list.name}` : `Add to ${list.name}`}
                  >
                    <span className="truncate block">{list.name}</span>
                    {alreadyIn && (
                      <span className="text-xs text-green-600 font-normal">✓ Already added</span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setListPickerSpecies(null)}
              className="mt-3 w-full text-center text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 py-1"
              data-testid="list-picker-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">{showSuccessToast}</span>
          </div>
        </div>
      )}

      {/* Duplicate Toast */}
      {showDuplicateToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">{showDuplicateToast}</span>
          </div>
        </div>
      )}

      {/* Species Info Card Modal */}
      {selectedSpeciesCard && (
        <SpeciesInfoCard
          species={selectedSpeciesCard}
          onClose={() => setSelectedSpeciesCard(null)}
        />
      )}
    </div>
  )
}
