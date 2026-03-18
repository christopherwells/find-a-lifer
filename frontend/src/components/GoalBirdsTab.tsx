import { useState, useEffect, useMemo } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useSpecies } from '../hooks/useSpecies'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'
import type { Species } from './types'
import { FamilyGroupSkeleton } from './Skeleton'
import SpeciesInfoCard from './SpeciesInfoCard'
import SuggestionSection from './SuggestionSection'
import { getDisplayGroup } from '../lib/familyGroups'
import { REGION_GROUPS, REGION_GROUP_CATEGORIES, GROUPED_CODES } from '../lib/regionGroups'
import {
  CONSERVATION_TEMPLATES,
  REGIONAL_TEMPLATES,
  computeConservationTemplate,
  computeRegionalTemplate,
  type ConservationTemplateType,
  type RegionalTemplateType,
} from '../lib/goalTemplates'
import { shareGoalList, getSharedWithMe, type SharedGoalList } from '../lib/sharedGoalListsService'
import { getFriends, type Friend } from '../lib/friendsService'
import {
  REGIONAL_ICONS,
  COLORFUL_CHARACTERS,
  OWLS_NIGHTBIRDS,
  RAPTORS,
  LBJS,
} from '../lib/curatedSpeciesLists'

export default function GoalBirdsTab() {
  const { isSpeciesSeen, seenSpecies } = useLifeList()
  const { user } = useAuth()
  const { showToast } = useToast()
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
  const { species: allSpecies, loading: speciesLoading } = useSpecies()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [createListError, setCreateListError] = useState('')

  // Shared goal lists
  const [sharedLists, setSharedLists] = useState<SharedGoalList[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [sharingListId, setSharingListId] = useState<string | null>(null)
  const [selectedFriendsForShare, setSelectedFriendsForShare] = useState<Set<string>>(new Set())

  // Load shared goal lists
  useEffect(() => {
    if (!user) return
    Promise.all([
      getSharedWithMe(user.uid),
      getFriends(user.uid),
    ]).then(([shared, friendsList]) => {
      setSharedLists(shared)
      setFriends(friendsList)
    }).catch(err => console.error('Failed to load shared lists:', err))
  }, [user])

  // List picker for one-tap add with multiple goal lists
  const [listPickerSpecies, setListPickerSpecies] = useState<Species | null>(null)

  // Filter within current list
  const [listFilterTerm, setListFilterTerm] = useState('')

  // Suggestions section expand/collapse state — single Set replaces 11 booleans
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['rarest','easyWins','hardest','migrants','regionalIcons','seasonal','colorful','owls','raptors','lbjs','almostComplete']))
  const toggleSection = (id: string) => setExpandedSections(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  // Conservation & regional template state
  const [showTemplateSection, setShowTemplateSection] = useState(false)
  const [templateRegion, setTemplateRegion] = useState<string>('')
  const [conservTemplateType, setConservTemplateType] = useState<ConservationTemplateType>('threatened')
  const [regionalTemplateType, setRegionalTemplateType] = useState<RegionalTemplateType>('regional-specialties')
  const [templateCreating, setTemplateCreating] = useState(false)

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

  // Save active list ID to localStorage and reset filter when switching lists
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

  // Region dropdown data — derived from species metadata (same pattern as SpeciesTab)
  const regionDropdownData = useMemo(() => {
    const allCodes = Array.from(new Set(allSpecies.flatMap(s => s.regions ?? [])))
    const individualCodes = allCodes
      .filter(c => !GROUPED_CODES.has(c))
      .sort()
    const activeGroups = Object.entries(REGION_GROUPS)
      .filter(([, codes]) => codes.some(c => allCodes.includes(c)))
      .map(([name]) => name)
    const groupsByCategory = activeGroups.reduce<Record<string, string[]>>((acc, name) => {
      const cat = REGION_GROUP_CATEGORIES[name] ?? 'Other'
      ;(acc[cat] ??= []).push(name)
      return acc
    }, {})
    return { individualCodes, groupsByCategory }
  }, [allSpecies])

  // Computed conservation template preview
  const conservTemplatePreview = useMemo(() => {
    if (!showTemplateSection || allSpecies.length === 0) return []
    const selectedTemplate = CONSERVATION_TEMPLATES.find(t => t.id === conservTemplateType)
    if (selectedTemplate?.requiresRegion && !templateRegion) return []
    return computeConservationTemplate(conservTemplateType, allSpecies, templateRegion, seenSpecies)
  }, [showTemplateSection, allSpecies, conservTemplateType, templateRegion, seenSpecies])

  // Computed regional template preview
  const regionalTemplatePreview = useMemo(() => {
    if (!showTemplateSection || allSpecies.length === 0 || !templateRegion) return []
    return computeRegionalTemplate(regionalTemplateType, allSpecies, templateRegion, seenSpecies)
  }, [showTemplateSection, allSpecies, regionalTemplateType, templateRegion, seenSpecies])

  // Create a goal list from template results
  const handleCreateFromTemplate = async (species: Species[], templateLabel: string) => {
    if (species.length === 0) return
    setTemplateCreating(true)
    try {
      const regionSuffix = templateRegion ? ` — ${templateRegion}` : ''
      let name = `${templateLabel}${regionSuffix}`

      // Avoid duplicate names
      const existingNames = new Set(goalLists.map(l => l.name.toLowerCase()))
      let counter = 2
      while (existingNames.has(name.toLowerCase())) {
        name = `${templateLabel}${regionSuffix} (${counter})`
        counter++
      }

      const newList: GoalList = {
        id: crypto.randomUUID(),
        name,
        speciesCodes: species.map(s => s.speciesCode),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await goalListsDB.saveList(newList)
      setGoalLists(prev => [...prev, newList])
      setActiveListId(newList.id)
      showToast({ type: 'success', message: `Created "${name}" with ${species.length} species` })
    } catch (error) {
      console.error('Failed to create template goal list:', error)
    } finally {
      setTemplateCreating(false)
    }
  }

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

  // Export goal list as JSON file download
  const handleExportList = (list: GoalList) => {
    const exportData = {
      app: 'find-a-lifer',
      version: 1,
      type: 'goal-list',
      name: list.name,
      speciesCodes: list.speciesCodes,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${list.name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast({ type: 'success', message: `Exported "${list.name}"` })
  }

  // Import goal list from JSON file
  const handleImportList = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        // Validate the imported data
        if (data.app !== 'find-a-lifer' || data.type !== 'goal-list') {
          showToast({ type: 'muted', message: 'Invalid file: not a Find-A-Lifer goal list' })
          return
        }
        if (!data.name || !Array.isArray(data.speciesCodes)) {
          showToast({ type: 'muted', message: 'Invalid file: missing name or species codes' })
          return
        }

        // Generate unique name
        let name = data.name
        const existingNames = new Set(goalLists.map(l => l.name.toLowerCase()))
        if (existingNames.has(name.toLowerCase())) {
          name = `${name} (imported)`
          let counter = 2
          while (existingNames.has(name.toLowerCase())) {
            name = `${data.name} (imported ${counter})`
            counter++
          }
        }

        const newList: GoalList = {
          id: crypto.randomUUID(),
          name,
          speciesCodes: data.speciesCodes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await goalListsDB.saveList(newList)
        setGoalLists(prev => [...prev, newList])
        setActiveListId(newList.id)
        showToast({ type: 'success', message: `Imported "${name}" with ${data.speciesCodes.length} species` })
      } catch {
        showToast({ type: 'muted', message: 'Failed to import: invalid JSON file' })
      }
    }
    input.click()
  }

  // Copy goal list to clipboard as JSON
  const handleCopyToClipboard = async (list: GoalList) => {
    const exportData = {
      app: 'find-a-lifer',
      version: 1,
      type: 'goal-list',
      name: list.name,
      speciesCodes: list.speciesCodes,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
      showToast({ type: 'success', message: 'Copied to clipboard!' })
    } catch {
      showToast({ type: 'muted', message: 'Failed to copy to clipboard' })
    }
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
        showToast({ type: 'muted', message: `${species.comName} is already in ${targetList.name}` })
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
      showToast({ type: 'success', message: `Added ${species.comName} to ${targetList.name}` })

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
      showToast({ type: 'success', message: `Removed ${speciesName} from ${activeList.name}` })
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
              <>
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
                    <button
                      onClick={() => handleExportList(activeList)}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
                      title="Export list as JSON"
                      data-testid="export-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => void handleCopyToClipboard(activeList)}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
                      title="Copy list to clipboard"
                      data-testid="copy-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              {/* Import button — always visible, even without active list */}
              <button
                onClick={() => void handleImportList()}
                className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                data-testid="import-list-btn"
              >
                Import Goal List from JSON
              </button>
              </>
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
                .slice(0, 20)

              return (
                <SuggestionSection
                  id="rarest"
                  emoji="📍"
                  title="Rarest in North America"
                  species={rarestSuggestions}
                  activeListCodes={activeListCodes}
                  isExpanded={expandedSections.has('rarest')}
                  onToggle={() => toggleSection('rarest')}
                  onAddSpecies={handleAddSpecies}
                  onSpeciesClick={(sp) => setSelectedSpeciesCard(sp)}
                  colorTheme={{
                    bg: 'bg-amber-50',
                    border: 'border-amber-200',
                    hover: 'hover:bg-amber-100',
                    icon: 'text-amber-600',
                    title: 'text-amber-800',
                    badge: 'bg-amber-200 text-amber-800',
                    tag: 'bg-amber-100 text-amber-700',
                  }}
                  tagText="📍 Rare"
                />
              )
            })()}

            {/* Easy Wins Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const easyWinsSuggestions = allSpecies
                .filter((sp) => sp.difficultyScore < 0.25 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => a.difficultyScore - b.difficultyScore)
                .slice(0, 20)

              if (easyWinsSuggestions.length === 0) return null

              const getEasyBadgeStyle = (score: number) => {
                if (score < 0.10) return { bg: 'bg-green-100', text: 'text-green-800', label: 'Very Easy' }
                if (score < 0.18) return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Easy' }
                return { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Fairly Easy' }
              }

              return (
                <div className="mt-4" data-testid="easy-wins-suggestions-section">
                  <button
                    onClick={() => toggleSection('easyWins')}
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
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-green-600 transition-transform ${expandedSections.has('easyWins') ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {expandedSections.has('easyWins') && (
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
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">{sp.comName}</span>
                                <span className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`} data-testid={`easy-wins-probability-badge-${sp.speciesCode}`}>
                                  ⭐ {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`easy-wins-in-list-badge-${sp.speciesCode}`}>✓ In list</span>
                                )}
                              </div>
                            </div>
                            {alreadyInList ? (
                              <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list" data-testid={`easy-wins-already-added-${sp.speciesCode}`}>✓</div>
                            ) : (
                              <button onClick={() => handleAddSpecies(sp)} className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors" title={`Add ${sp.comName} to goal list`} data-testid={`easy-wins-add-btn-${sp.speciesCode}`}>+</button>
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
              const hardestSuggestions = allSpecies
                .filter((sp) => sp.difficultyScore >= 0.75 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => b.difficultyScore - a.difficultyScore)
                .slice(0, 20)

              if (hardestSuggestions.length === 0) return null

              const getDifficultyBadgeStyle = (score: number) => {
                if (score >= 0.90) return { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Extremely Hard' }
                if (score >= 0.75) return { bg: 'bg-red-100', text: 'text-red-800', label: 'Very Hard' }
                return { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Hard' }
              }

              return (
                <div className="mt-4" data-testid="hardest-suggestions-section">
                  <button
                    onClick={() => toggleSection('hardest')}
                    className="w-full flex items-center justify-between py-2 px-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    data-testid="hardest-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-purple-600 font-bold text-sm">🔭</span>
                      <span className="text-sm font-semibold text-purple-800">Hardest to Find</span>
                      <span className="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full font-medium">{hardestSuggestions.length}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-purple-600 transition-transform ${expandedSections.has('hardest') ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {expandedSections.has('hardest') && (
                    <div className="mt-1 space-y-1" data-testid="hardest-suggestions-list">
                      {hardestSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getDifficultyBadgeStyle(sp.difficultyScore)
                        return (
                          <div key={sp.speciesCode} className={`flex items-center justify-between px-2 py-1 rounded ${alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`} data-testid={`hardest-suggestion-${sp.speciesCode}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">{sp.comName}</span>
                                <span className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`} data-testid={`hardest-difficulty-badge-${sp.speciesCode}`}>🔭 {badgeStyle.label}</span>
                                {alreadyInList && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`hardest-in-list-badge-${sp.speciesCode}`}>✓ In list</span>
                                )}
                              </div>
                            </div>
                            {alreadyInList ? (
                              <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list" data-testid={`hardest-already-added-${sp.speciesCode}`}>✓</div>
                            ) : (
                              <button onClick={() => handleAddSpecies(sp)} className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors" title={`Add ${sp.comName} to goal list`} data-testid={`hardest-add-btn-${sp.speciesCode}`}>+</button>
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
              const migrantSuggestions = allSpecies
                .filter((sp) => (sp.rangeShiftScore ?? 0) >= 0.5 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => (b.rangeShiftScore ?? 0) - (a.rangeShiftScore ?? 0))
                .slice(0, 20)

              if (migrantSuggestions.length === 0) return null

              const getMigrantBadgeStyle = (score: number) => {
                if (score >= 0.875) return { bg: 'bg-sky-100', text: 'text-sky-800', label: 'Epic Migration' }
                if (score >= 0.75) return { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Long Range' }
                return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Migratory' }
              }

              return (
                <div className="mt-4" data-testid="migrants-suggestions-section">
                  <button
                    onClick={() => toggleSection('migrants')}
                    className="w-full flex items-center justify-between py-2 px-3 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                    data-testid="migrants-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sky-600 font-bold text-sm">🦅</span>
                      <span className="text-sm font-semibold text-sky-800">Long-Distance Migrants</span>
                      <span className="text-xs bg-sky-200 text-sky-800 px-1.5 py-0.5 rounded-full font-medium">{migrantSuggestions.length}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-sky-600 transition-transform ${expandedSections.has('migrants') ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {expandedSections.has('migrants') && (
                    <div className="mt-1 space-y-1" data-testid="migrants-suggestions-list">
                      {migrantSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getMigrantBadgeStyle(sp.rangeShiftScore ?? 0)
                        return (
                          <div key={sp.speciesCode} className={`flex items-center justify-between px-2 py-1 rounded ${alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`} data-testid={`migrants-suggestion-${sp.speciesCode}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">{sp.comName}</span>
                                <span className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`} data-testid={`migrants-shift-badge-${sp.speciesCode}`}>🦅 {badgeStyle.label}</span>
                                {alreadyInList && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`migrants-in-list-badge-${sp.speciesCode}`}>✓ In list</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 truncate mt-0.5">{sp.sciName}</p>
                            </div>
                            {alreadyInList ? (
                              <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list" data-testid={`migrants-already-added-${sp.speciesCode}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button onClick={() => handleAddSpecies(sp)} className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors" title={`Add ${sp.comName} to goal list`} data-testid={`migrants-add-btn-${sp.speciesCode}`}>+</button>
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
              interface RegionalIconEntry { speciesCode: string; comName: string; sciName: string; region: string; regionKey: string; emoji: string }
              const regionalIconEntries: RegionalIconEntry[] = []
              for (const regionGroup of REGIONAL_ICONS) {
                for (const code of regionGroup.speciesCodes) {
                  const sp = allSpecies.find((s) => s.speciesCode === code)
                  if (sp && !isSpeciesSeen(sp.speciesCode)) {
                    regionalIconEntries.push({ speciesCode: sp.speciesCode, comName: sp.comName, sciName: sp.sciName, region: regionGroup.region, regionKey: regionGroup.regionKey, emoji: regionGroup.emoji })
                  }
                }
              }
              if (regionalIconEntries.length === 0) return null
              const groupedByRegion: { [region: string]: RegionalIconEntry[] } = {}
              for (const entry of regionalIconEntries) { (groupedByRegion[entry.region] ??= []).push(entry) }
              const regionsToShow = REGIONAL_ICONS.filter((rg) => groupedByRegion[rg.region]?.length > 0)

              return (
                <div className="mt-4" data-testid="regional-icons-suggestions-section">
                  <button onClick={() => toggleSection('regionalIcons')} className="w-full flex items-center justify-between py-2 px-3 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors" data-testid="regional-icons-suggestions-toggle">
                    <div className="flex items-center gap-2">
                      <span className="text-teal-600 font-bold text-sm">🗺️</span>
                      <span className="text-sm font-semibold text-teal-800">Regional Icons</span>
                      <span className="text-xs bg-teal-200 text-teal-800 px-1.5 py-0.5 rounded-full font-medium">{regionalIconEntries.length}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-teal-600 transition-transform ${expandedSections.has('regionalIcons') ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {expandedSections.has('regionalIcons') && (
                    <div className="mt-1 space-y-3" data-testid="regional-icons-suggestions-list">
                      {regionsToShow.map((regionGroup) => {
                        const entries = groupedByRegion[regionGroup.region] || []
                        return (
                          <div key={regionGroup.regionKey} data-testid={`regional-icons-group-${regionGroup.regionKey}`}>
                            <div className="flex items-center gap-1.5 px-1 mb-1">
                              <span className="text-sm">{regionGroup.emoji}</span>
                              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">{regionGroup.region}</span>
                            </div>
                            <div className="space-y-1">
                              {entries.map((entry) => {
                                const alreadyInList = activeListCodes.has(entry.speciesCode)
                                const sp = allSpecies.find((s) => s.speciesCode === entry.speciesCode)
                                if (!sp) return null
                                return (
                                  <div key={entry.speciesCode} className={`flex items-center justify-between px-2 py-1 rounded ${alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`} data-testid={`regional-icons-suggestion-${entry.speciesCode}`}>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">{entry.comName}</span>
                                        <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`regional-icons-region-badge-${entry.speciesCode}`}>{regionGroup.emoji} {regionGroup.region}</span>
                                        {alreadyInList && (<span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`regional-icons-in-list-badge-${entry.speciesCode}`}>✓ In list</span>)}
                                      </div>
                                    </div>
                                    {alreadyInList ? (
                                      <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list" data-testid={`regional-icons-already-added-${entry.speciesCode}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                      </div>
                                    ) : (
                                      <button onClick={() => handleAddSpecies(sp)} className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors" title={`Add ${entry.comName} to goal list`} data-testid={`regional-icons-add-btn-${entry.speciesCode}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
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
              const seasonalSuggestions = allSpecies
                .filter((sp) => (sp.seasonalityScore ?? 0) >= 0.5 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => (b.seasonalityScore ?? 0) - (a.seasonalityScore ?? 0))
                .slice(0, 20)

              if (seasonalSuggestions.length === 0) return null

              const getSeasonLabel = (peakWeek: number): string => {
                if (peakWeek === 0) return 'Year-round'
                if (peakWeek <= 13) return 'Winter (Jan\u2013Mar)'
                if (peakWeek <= 26) return 'Spring (Apr\u2013Jun)'
                if (peakWeek <= 39) return 'Summer (Jul\u2013Sep)'
                return 'Fall (Oct\u2013Dec)'
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
                  <button onClick={() => toggleSection('seasonal')} className="w-full flex items-center justify-between py-2 px-3 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors" data-testid="seasonal-suggestions-toggle">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-600 font-bold text-sm">🗓️</span>
                      <span className="text-sm font-semibold text-cyan-800">Seasonal Specialties</span>
                      <span className="text-xs bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded-full font-medium">{seasonalSuggestions.length}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-cyan-600 transition-transform ${expandedSections.has('seasonal') ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {expandedSections.has('seasonal') && (
                    <div className="mt-1 space-y-1" data-testid="seasonal-suggestions-list">
                      {seasonalSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const seasonLabel = getSeasonLabel(sp.peakWeek ?? 0)
                        const seasonColor = getSeasonColor(sp.peakWeek ?? 0)
                        return (
                          <div key={sp.speciesCode} className={`flex items-center justify-between px-2 py-1 rounded ${alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`} data-testid={`seasonal-suggestion-${sp.speciesCode}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">{sp.comName}</span>
                                <span className={`text-xs ${seasonColor.bg} ${seasonColor.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`} data-testid={`seasonal-season-badge-${sp.speciesCode}`}>🗓️ {seasonLabel}</span>
                                {alreadyInList && (<span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`seasonal-in-list-badge-${sp.speciesCode}`}>✓ In list</span>)}
                              </div>
                            </div>
                            {alreadyInList ? (
                              <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list" data-testid={`seasonal-already-added-${sp.speciesCode}`}>✓</div>
                            ) : (
                              <button onClick={() => handleAddSpecies(sp)} className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors" title={`Add ${sp.comName} to goal list`} data-testid={`seasonal-add-btn-${sp.speciesCode}`}>+</button>
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
              const colorfulSuggestions = COLORFUL_CHARACTERS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              return (
                <SuggestionSection
                  id="colorful"
                  emoji="🎨"
                  title="Colorful Characters"
                  species={colorfulSuggestions}
                  activeListCodes={activeListCodes}
                  isExpanded={expandedSections.has('colorful')}
                  onToggle={() => toggleSection('colorful')}
                  onAddSpecies={handleAddSpecies}
                  onSpeciesClick={(sp) => setSelectedSpeciesCard(sp)}
                  colorTheme={{
                    bg: 'bg-fuchsia-50',
                    border: 'border-fuchsia-200',
                    hover: 'hover:bg-fuchsia-100',
                    icon: 'text-fuchsia-600',
                    title: 'text-fuchsia-800',
                    badge: 'bg-fuchsia-200 text-fuchsia-800',
                  }}
                />
              )
            })()}

            {/* Owls & Nightbirds Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const owlsNightbirdsSuggestions = OWLS_NIGHTBIRDS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              return (
                <SuggestionSection
                  id="owls"
                  emoji="🦉"
                  title="Owls & Nightbirds"
                  species={owlsNightbirdsSuggestions}
                  activeListCodes={activeListCodes}
                  isExpanded={expandedSections.has('owls')}
                  onToggle={() => toggleSection('owls')}
                  onAddSpecies={handleAddSpecies}
                  onSpeciesClick={(sp) => setSelectedSpeciesCard(sp)}
                  colorTheme={{
                    bg: 'bg-indigo-50',
                    border: 'border-indigo-200',
                    hover: 'hover:bg-indigo-100',
                    icon: 'text-indigo-600',
                    title: 'text-indigo-800',
                    badge: 'bg-indigo-200 text-indigo-800',
                  }}
                />
              )
            })()}

            {/* Raptors Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const raptorsSuggestions = RAPTORS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              return (
                <SuggestionSection
                  id="raptors"
                  emoji="🦅"
                  title="Raptors"
                  species={raptorsSuggestions}
                  activeListCodes={activeListCodes}
                  isExpanded={expandedSections.has('raptors')}
                  onToggle={() => toggleSection('raptors')}
                  onAddSpecies={handleAddSpecies}
                  onSpeciesClick={(sp) => setSelectedSpeciesCard(sp)}
                  colorTheme={{
                    bg: 'bg-amber-50',
                    border: 'border-amber-200',
                    hover: 'hover:bg-amber-100',
                    icon: 'text-amber-600',
                    title: 'text-amber-800',
                    badge: 'bg-amber-200 text-amber-800',
                  }}
                />
              )
            })()}

            {/* LBJs Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const lbjsSuggestions = LBJS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              return (
                <SuggestionSection
                  id="lbjs"
                  emoji="🐦"
                  title="LBJs (Little Brown Jobs)"
                  species={lbjsSuggestions}
                  activeListCodes={activeListCodes}
                  isExpanded={expandedSections.has('lbjs')}
                  onToggle={() => toggleSection('lbjs')}
                  onAddSpecies={handleAddSpecies}
                  onSpeciesClick={(sp) => setSelectedSpeciesCard(sp)}
                  colorTheme={{
                    bg: 'bg-stone-50',
                    border: 'border-stone-200',
                    hover: 'hover:bg-stone-100',
                    icon: 'text-stone-600',
                    title: 'text-stone-800',
                    badge: 'bg-stone-200 text-stone-800',
                  }}
                />
              )
            })()}

            {/* Almost Complete Families Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const familyMap = new Map<string, { total: number; seen: number; unseen: Species[] }>()
              for (const sp of allSpecies) {
                const family = getDisplayGroup(sp.familyComName ?? '')
                if (!family) continue
                if (!familyMap.has(family)) familyMap.set(family, { total: 0, seen: 0, unseen: [] })
                const entry = familyMap.get(family)!
                entry.total++
                if (isSpeciesSeen(sp.speciesCode)) entry.seen++
                else entry.unseen.push(sp)
              }
              const almostComplete = Array.from(familyMap.entries())
                .filter(([, data]) => data.total >= 2 && data.seen / data.total >= 0.8 && data.unseen.length > 0)
                .sort((a, b) => (b[1].seen / b[1].total) - (a[1].seen / a[1].total))

              if (almostComplete.length === 0) return null
              const totalUnseen = almostComplete.reduce((sum, [, data]) => sum + data.unseen.length, 0)

              return (
                <div className="mt-4" data-testid="almost-complete-families-section">
                  <button onClick={() => toggleSection('almostComplete')} className="w-full flex items-center justify-between py-2 px-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors" data-testid="almost-complete-families-toggle">
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold text-sm">🏆</span>
                      <span className="text-sm font-semibold text-indigo-800">Almost Complete Families</span>
                      <span className="text-xs bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium">{totalUnseen}</span>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-indigo-600 transition-transform ${expandedSections.has('almostComplete') ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {expandedSections.has('almostComplete') && (
                    <div className="mt-1 space-y-3" data-testid="almost-complete-families-list">
                      {almostComplete.map(([familyName, data]) => {
                        const pct = Math.round((data.seen / data.total) * 100)
                        return (
                          <div key={familyName} data-testid={`almost-complete-family-${familyName.replace(/\s+/g, '-').toLowerCase()}`}>
                            <div className="flex items-center justify-between px-1 mb-1">
                              <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide truncate">{familyName}</span>
                              <span className="text-[10px] text-indigo-600 font-medium whitespace-nowrap ml-2">{data.seen}/{data.total} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden mx-1 mb-1" style={{ width: 'calc(100% - 8px)' }}>
                              <div className="bg-indigo-500 h-1 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="space-y-1">
                              {data.unseen.map((sp) => {
                                const alreadyInList = activeListCodes.has(sp.speciesCode)
                                return (
                                  <div key={sp.speciesCode} className={`flex items-center justify-between px-2 py-1 rounded ${alreadyInList ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`} data-testid={`almost-complete-suggestion-${sp.speciesCode}`}>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">{sp.comName}</span>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">{data.unseen.length === 1 ? 'Last one!' : `${data.unseen.length} left`}</span>
                                        {alreadyInList && (<span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" data-testid={`almost-complete-in-list-badge-${sp.speciesCode}`}>✓ In list</span>)}
                                      </div>
                                    </div>
                                    {alreadyInList ? (
                                      <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list" data-testid={`almost-complete-already-added-${sp.speciesCode}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                      </div>
                                    ) : (
                                      <button onClick={() => handleAddSpecies(sp)} className="ml-2 flex-shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors" title={`Add ${sp.comName} to goal list`} data-testid={`almost-complete-add-btn-${sp.speciesCode}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
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

            {/* ── Goal List Templates ── */}
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
              <button
                onClick={() => setShowTemplateSection(prev => !prev)}
                className="w-full flex items-center justify-between py-2 px-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                data-testid="template-section-toggle"
              >
                <div className="flex items-center gap-2">
                  <span className="text-violet-600 font-bold text-sm">🎯</span>
                  <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">Goal List Templates</span>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-violet-600 transition-transform ${showTemplateSection ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {showTemplateSection && (
                <div className="mt-3 space-y-4">
                  {/* Region selector (shared by both template types) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Region (optional for conservation, required for regional)</label>
                    <select
                      value={templateRegion}
                      onChange={(e) => setTemplateRegion(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      data-testid="template-region-select"
                    >
                      <option value="">All Regions</option>
                      {regionDropdownData.individualCodes.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                      {Object.entries(regionDropdownData.groupsByCategory).map(([category, names]) => (
                        <optgroup key={category} label={category}>
                          {names.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Conservation Templates */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Conservation Goals</h4>
                    <div className="flex gap-1.5 flex-wrap">
                      {CONSERVATION_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => setConservTemplateType(tmpl.id)}
                          className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                            conservTemplateType === tmpl.id
                              ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-400 dark:border-violet-600 text-violet-800 dark:text-violet-200'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                          data-testid={`conservation-template-${tmpl.id}`}
                          title={tmpl.description}
                        >
                          {tmpl.emoji} {tmpl.label}
                        </button>
                      ))}
                    </div>

                    {/* Conservation preview */}
                    {(() => {
                      const selectedTemplate = CONSERVATION_TEMPLATES.find(t => t.id === conservTemplateType)
                      if (selectedTemplate?.requiresRegion && !templateRegion) {
                        return (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                            Select a region above to see {selectedTemplate.label.toLowerCase()}.
                          </p>
                        )
                      }
                      if (conservTemplatePreview.length === 0) {
                        return (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                            No unseen {selectedTemplate?.label.toLowerCase() ?? 'species'} found{templateRegion ? ` in ${templateRegion}` : ''}.
                          </p>
                        )
                      }
                      return (
                        <div data-testid="conservation-template-preview">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {conservTemplatePreview.length} unseen species
                            </span>
                            <button
                              onClick={() => void handleCreateFromTemplate(conservTemplatePreview, selectedTemplate?.label ?? 'Conservation')}
                              disabled={templateCreating}
                              className="px-2 py-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 rounded-md transition-colors"
                              data-testid="conservation-create-list-btn"
                            >
                              {templateCreating ? 'Creating...' : `Create Goal List (${conservTemplatePreview.length})`}
                            </button>
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-md border border-gray-100 dark:border-gray-700 p-1">
                            {conservTemplatePreview.slice(0, 50).map((sp) => (
                              <div
                                key={sp.speciesCode}
                                className="flex items-center justify-between px-1.5 py-0.5 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                                data-testid={`conservation-preview-${sp.speciesCode}`}
                              >
                                <span className="text-gray-700 dark:text-gray-300 truncate">{sp.comName}</span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 flex-shrink-0">
                                  {sp.conservStatus || '—'}
                                </span>
                              </div>
                            ))}
                            {conservTemplatePreview.length > 50 && (
                              <p className="text-[10px] text-gray-400 text-center py-1">
                                +{conservTemplatePreview.length - 50} more
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Regional Templates */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Regional Goals</h4>
                    <div className="flex gap-1.5 flex-wrap">
                      {REGIONAL_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => setRegionalTemplateType(tmpl.id)}
                          className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                            regionalTemplateType === tmpl.id
                              ? 'bg-teal-100 dark:bg-teal-900/40 border-teal-400 dark:border-teal-600 text-teal-800 dark:text-teal-200'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                          data-testid={`regional-template-${tmpl.id}`}
                          title={tmpl.description}
                        >
                          {tmpl.emoji} {tmpl.label}
                        </button>
                      ))}
                    </div>

                    {/* Regional preview */}
                    {!templateRegion ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                        Select a region above to see regional specialties.
                      </p>
                    ) : regionalTemplatePreview.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                        No unseen regional specialties found in {templateRegion}.
                      </p>
                    ) : (
                      <div data-testid="regional-template-preview">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {regionalTemplatePreview.length} regional species
                          </span>
                          <button
                            onClick={() => {
                              const tmpl = REGIONAL_TEMPLATES.find(t => t.id === regionalTemplateType)
                              void handleCreateFromTemplate(regionalTemplatePreview, tmpl?.label ?? 'Regional')
                            }}
                            disabled={templateCreating}
                            className="px-2 py-1 text-[11px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 rounded-md transition-colors"
                            data-testid="regional-create-list-btn"
                          >
                            {templateCreating ? 'Creating...' : `Create Goal List (${regionalTemplatePreview.length})`}
                          </button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-md border border-gray-100 dark:border-gray-700 p-1">
                          {regionalTemplatePreview.slice(0, 50).map((sp) => (
                            <div
                              key={sp.speciesCode}
                              className="flex items-center justify-between px-1.5 py-0.5 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                              data-testid={`regional-preview-${sp.speciesCode}`}
                            >
                              <span className="text-gray-700 dark:text-gray-300 truncate">{sp.comName}</span>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1 flex-shrink-0">
                                {(sp.regions ?? []).length} regions
                              </span>
                            </div>
                          ))}
                          {regionalTemplatePreview.length > 50 && (
                            <p className="text-[10px] text-gray-400 text-center py-1">
                              +{regionalTemplatePreview.length - 50} more
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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

      {/* Shared With Me */}
      {user && sharedLists.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2" data-testid="shared-goals-section">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Shared With You</h4>
          {sharedLists.map(list => (
            <div key={list.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{list.name}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">by {list.ownerName} · {list.speciesCodes.length} species</p>
                </div>
                <button
                  onClick={async () => {
                    const now = new Date().toISOString()
                    await goalListsDB.saveList({ id: crypto.randomUUID(), name: `${list.name} (shared)`, speciesCodes: list.speciesCodes, createdAt: now, updatedAt: now })
                    const updated = await goalListsDB.getAllLists()
                    setGoalLists(updated)
                  }}
                  className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-700"
                >
                  Add to My Goals
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Share Goal List Dialog */}
      {sharingListId && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSharingListId(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 m-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Share Goal List</h4>
            {friends.length === 0 ? (
              <p className="text-xs text-gray-500">Add friends first to share goal lists.</p>
            ) : (
              <div className="space-y-1.5">
                {friends.map(f => (
                  <label key={f.uid} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFriendsForShare.has(f.uid)}
                      onChange={() => {
                        setSelectedFriendsForShare(prev => {
                          const next = new Set(prev)
                          if (next.has(f.uid)) next.delete(f.uid)
                          else next.add(f.uid)
                          return next
                        })
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{f.displayName}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const list = goalLists.find(l => l.id === sharingListId)
                  if (!list || selectedFriendsForShare.size === 0) return
                  await shareGoalList(user.uid, user.displayName || 'Birder', list.name, list.speciesCodes, Array.from(selectedFriendsForShare))
                  setSharingListId(null)
                  setSelectedFriendsForShare(new Set())
                }}
                disabled={selectedFriendsForShare.size === 0}
                className="flex-1 px-3 py-1.5 bg-[#2C3E7B] text-white text-xs rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50"
              >
                Share
              </button>
              <button
                onClick={() => { setSharingListId(null); setSelectedFriendsForShare(new Set()) }}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-xs rounded-lg"
              >
                Cancel
              </button>
            </div>
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
