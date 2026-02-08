import { useState, useEffect } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'

export type MapViewMode = 'density' | 'probability' | 'species'

export interface SelectedLocation {
  cellId: number
  coordinates: [number, number] // [lng, lat]
  name?: string
}

type TabId = 'explore' | 'species' | 'goals' | 'trip' | 'progress' | 'profile'

interface SidePanelProps {
  collapsed: boolean
  onToggle: () => void
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
  selectedLocation?: SelectedLocation | null
}

interface Tab {
  id: TabId
  label: string
  icon: string
}

const tabs: Tab[] = [
  { id: 'explore', label: 'Explore', icon: '\u{1F5FA}' },   // world map emoji
  { id: 'species', label: 'Species', icon: '\u{1F426}' },    // bird emoji
  { id: 'goals', label: 'Goal Birds', icon: '\u{1F3AF}' },   // target emoji
  { id: 'trip', label: 'Trip Plan', icon: '\u{2708}' },      // airplane emoji
  { id: 'progress', label: 'Progress', icon: '\u{1F4CA}' },  // chart emoji
  { id: 'profile', label: 'Profile', icon: '\u{1F464}' },    // person emoji
]

export default function SidePanel({
  collapsed,
  onToggle,
  currentWeek = 26,
  onWeekChange,
  viewMode = 'density',
  onViewModeChange,
  selectedLocation
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('explore')

  // Auto-switch to Trip Plan tab when a location is selected on the map
  useEffect(() => {
    if (selectedLocation) {
      setActiveTab('trip')
    }
  }, [selectedLocation])

  return (
    <div
      data-testid="side-panel"
      className={`h-full bg-white shadow-lg flex flex-col transition-all duration-300 ${
        collapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Tab Navigation */}
      <nav
        data-testid="tab-navigation"
        className="flex border-b border-gray-200 bg-gray-50"
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-12 h-12 flex items-center justify-center text-[#2C3E7B] hover:bg-gray-100"
            title="Expand panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-1 text-xs font-medium text-center transition-colors ${
                  activeTab === tab.id
                    ? 'text-[#2C3E7B] border-b-2 border-[#2C3E7B] bg-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={tab.label}
              >
                <span className="block text-base mb-0.5">{tab.icon}</span>
                <span className="block truncate">{tab.label}</span>
              </button>
            ))}
            <button
              onClick={onToggle}
              className="px-2 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Collapse panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}
      </nav>

      {/* Tab Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'explore' && (
            <ExploreTab
              currentWeek={currentWeek}
              onWeekChange={onWeekChange}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
            />
          )}
          {activeTab === 'species' && <SpeciesTab />}
          {activeTab === 'goals' && <GoalBirdsTab />}
          {activeTab === 'trip' && (
            <TripPlanTab
              selectedLocation={selectedLocation}
              currentWeek={currentWeek}
              onWeekChange={onWeekChange}
            />
          )}
          {activeTab === 'progress' && <ProgressTab />}
          {activeTab === 'profile' && <ProfileTab />}
        </div>
      )}
    </div>
  )
}

interface ExploreTabProps {
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
}

function ExploreTab({
  currentWeek = 26,
  onWeekChange,
  viewMode = 'density',
  onViewModeChange
}: ExploreTabProps) {
  // Convert week number to approximate date label
  const getWeekLabel = (week: number): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    // Approximate: week 1 = early January, week 52 = late December
    const dayOfYear = week * 7 - 3 // Approximate day of year
    const date = new Date(2024, 0, dayOfYear) // Use 2024 as a reference year (leap year)
    const monthIndex = date.getMonth()
    const day = date.getDate()
    return `Week ${week} (~${monthNames[monthIndex]} ${day})`
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">Explore Map</h3>
      <p className="text-sm text-gray-600">
        Use the map controls to explore where bird species can be found. Adjust the week slider to see seasonal changes.
      </p>

      {/* View Mode Toggle */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#2C3E50]">
          View Mode
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => onViewModeChange?.('density')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'density'
                ? 'bg-[#2C3E7B] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Density
          </button>
          <button
            onClick={() => onViewModeChange?.('probability')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'probability'
                ? 'bg-[#2C3E7B] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Probability
          </button>
          <button
            onClick={() => onViewModeChange?.('species')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'species'
                ? 'bg-[#2C3E7B] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Species
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {viewMode === 'density' && 'Show number of species per area'}
          {viewMode === 'probability' && 'Show occurrence probability intensity'}
          {viewMode === 'species' && 'Show single species range (coming soon)'}
        </p>
      </div>

      {/* Week Slider */}
      <div className="space-y-2">
        <label htmlFor="week-slider" className="block text-sm font-medium text-[#2C3E50]">
          Select Week
        </label>
        <div className="space-y-1">
          <input
            id="week-slider"
            type="range"
            min="1"
            max="52"
            value={currentWeek}
            onChange={(e) => onWeekChange?.(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
          />
          <div className="text-sm text-center font-medium text-[#2C3E7B]">
            {getWeekLabel(currentWeek)}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700">
          <span className="font-medium">Tip:</span> Click on the map to see available lifers in that area.
        </p>
      </div>
    </div>
  )
}

interface Species {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName: string
  taxonOrder: number
  invasionStatus: string
  conservStatus: string
  difficultyScore: number
  difficultyLabel: string
  isRestrictedRange: boolean
  ebirdUrl: string
  photoUrl: string
}

interface SpeciesByFamily {
  [familyName: string]: Species[]
}

function SpeciesTab() {
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [speciesByFamily, setSpeciesByFamily] = useState<SpeciesByFamily>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const { isSpeciesSeen, toggleSpecies, getTotalSeen } = useLifeList()

  // Goal list management for adding species to goal lists
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [addingSpecies, setAddingSpecies] = useState<{ code: string; name: string } | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(null)

  // Fetch species data from API
  useEffect(() => {
    const fetchSpecies = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/species')
        if (!response.ok) {
          throw new Error(`Failed to fetch species: ${response.status}`)
        }
        const data: Species[] = await response.json()

        // Sort by taxonomic order
        const sorted = data.sort((a, b) => a.taxonOrder - b.taxonOrder)
        setAllSpecies(sorted)

        // Group by family
        const byFamily: SpeciesByFamily = {}
        sorted.forEach((species) => {
          const family = species.familyComName
          if (!byFamily[family]) {
            byFamily[family] = []
          }
          byFamily[family].push(species)
        })
        setSpeciesByFamily(byFamily)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    fetchSpecies()
  }, [])

  // Load goal lists on mount
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        const lists = await goalListsDB.getAllLists()
        setGoalLists(lists)
      } catch (error) {
        console.error('Failed to load goal lists:', error)
      }
    }

    loadGoalLists()
  }, [])

  const toggleFamily = (familyName: string) => {
    setCollapsedFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(familyName)) {
        next.delete(familyName)
      } else {
        next.add(familyName)
      }
      return next
    })
  }

  const handleStartAddToGoalList = (speciesCode: string, comName: string) => {
    setAddingSpecies({ code: speciesCode, name: comName })
  }

  const handleCancelAddToGoalList = () => {
    setAddingSpecies(null)
  }

  const handleAddToGoalList = async (listId: string) => {
    if (!addingSpecies) return

    try {
      await goalListsDB.addSpeciesToList(listId, addingSpecies.code)
      const list = goalLists.find((l) => l.id === listId)
      console.log(`Added ${addingSpecies.name} (${addingSpecies.code}) to goal list: ${list?.name}`)

      // Show success message
      setShowSuccessMessage(`Added ${addingSpecies.name} to ${list?.name}`)
      setTimeout(() => setShowSuccessMessage(null), 3000)

      // Close dialog
      setAddingSpecies(null)

      // Refresh goal lists to show updated counts
      const lists = await goalListsDB.getAllLists()
      setGoalLists(lists)
    } catch (error) {
      console.error('Failed to add species to goal list:', error)
      alert('Failed to add species to goal list. Please try again.')
    }
  }

  // Filter species by search term
  const filteredFamilies = Object.keys(speciesByFamily).reduce((acc, familyName) => {
    const familySpecies = speciesByFamily[familyName]
    const filtered = familySpecies.filter((species) => {
      const search = searchTerm.toLowerCase()
      return (
        species.comName.toLowerCase().includes(search) ||
        species.sciName.toLowerCase().includes(search) ||
        familyName.toLowerCase().includes(search)
      )
    })
    if (filtered.length > 0) {
      acc[familyName] = filtered
    }
    return acc
  }, {} as SpeciesByFamily)

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">
            <span className="font-medium">Error:</span> {error}
          </p>
        </div>
      </div>
    )
  }

  const totalSpecies = allSpecies.length
  const seenSpecies = getTotalSeen()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>

        {/* Species count */}
        <div className="text-sm text-gray-600">
          <span className="font-medium text-[#2C3E7B]">{seenSpecies}</span> of{' '}
          <span className="font-medium">{totalSpecies}</span> species seen
        </div>

        {/* Search box */}
        <input
          type="text"
          placeholder="Search species or family..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
        />
      </div>

      {/* Species list by family */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-1">
        {Object.keys(filteredFamilies).length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">
            No species found matching "{searchTerm}"
          </div>
        ) : (
          Object.keys(filteredFamilies).map((familyName) => {
            const familySpecies = filteredFamilies[familyName]
            const isCollapsed = collapsedFamilies.has(familyName)

            return (
              <div key={familyName} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Family header */}
                <button
                  onClick={() => toggleFamily(familyName)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-gray-500 transition-transform ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-[#2C3E50]">{familyName}</span>
                  </div>
                  <span className="text-xs text-gray-500">{familySpecies.length}</span>
                </button>

                {/* Species in family */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {familySpecies.map((species) => (
                      <div
                        key={species.species_id}
                        className="px-3 py-2 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          {/* Functional checkbox with IndexedDB persistence */}
                          <input
                            type="checkbox"
                            checked={isSpeciesSeen(species.speciesCode)}
                            onChange={() => toggleSpecies(species.speciesCode, species.comName)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#2C3E7B] focus:ring-[#2C3E7B] cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            {/* Common name */}
                            <div className="text-sm font-medium text-[#2C3E50] truncate">
                              {species.comName}
                            </div>
                            {/* Scientific name */}
                            <div className="text-xs italic text-gray-600 truncate">
                              {species.sciName}
                            </div>
                          </div>
                          {/* Add to goal list button */}
                          <button
                            onClick={() => handleStartAddToGoalList(species.speciesCode, species.comName)}
                            className="flex-shrink-0 p-1 text-[#2C3E7B] hover:bg-[#2C3E7B] hover:text-white rounded transition-colors"
                            title="Add to goal list"
                            data-testid={`add-to-goal-${species.speciesCode}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add to Goal List Dialog */}
      {addingSpecies && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCancelAddToGoalList}
        >
          <div
            className="bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
              Add to Goal List
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Select a goal list to add <span className="font-medium">{addingSpecies.name}</span>:
            </p>

            {goalLists.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-700">
                  You don't have any goal lists yet. Create one in the Goal Birds tab first.
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {goalLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleAddToGoalList(list.id)}
                    className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:border-[#2C3E7B] hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-[#2C3E50]">{list.name}</div>
                    <div className="text-xs text-gray-500">
                      {list.speciesCodes.length} bird{list.speciesCodes.length !== 1 ? 's' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleCancelAddToGoalList}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message Toast */}
      {showSuccessMessage && (
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
            <span className="text-sm font-medium">{showSuccessMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function GoalBirdsTab() {
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [loading, setLoading] = useState(true)
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingListId, setDeletingListId] = useState<string | null>(null)

  // Load goal lists from IndexedDB on mount
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        setLoading(true)
        const lists = await goalListsDB.getAllLists()
        setGoalLists(lists)

        // Set active list (first list or none if empty)
        if (lists.length > 0) {
          setActiveListId(lists[0].id)
        }
        setLoading(false)
      } catch (error) {
        console.error('Failed to load goal lists:', error)
        setLoading(false)
      }
    }

    loadGoalLists()
  }, [])

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      return
    }

    try {
      const newList: GoalList = {
        id: crypto.randomUUID(),
        name: newListName.trim(),
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

      // Set new active list (first remaining list, or null if none)
      if (remainingLists.length > 0) {
        setActiveListId(remainingLists[0].id)
      } else {
        setActiveListId(null)
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

  const activeList = goalLists.find((list) => list.id === activeListId)
  const deletingList = goalLists.find((list) => list.id === deletingListId)

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Goal Birds</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#2C3E50]">Goal Birds</h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-3 py-1.5 bg-[#2C3E7B] text-white text-xs font-medium rounded-lg hover:bg-[#1f2d5a] transition-colors"
          >
            + New List
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Create and manage lists of birds you want to see.
        </p>

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
                  className="flex-1 px-3 py-2 text-sm border border-[#2C3E7B] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
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
                  className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
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
                      className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 hover:text-gray-800 transition-colors"
                      title="Rename list"
                      data-testid="rename-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleStartDelete(activeList)}
                      className="px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors"
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
          <div className="bg-white rounded-lg p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-[#2C3E50] mb-4">Create New Goal List</h4>

            <div className="space-y-4">
              <div>
                <label htmlFor="list-name" className="block text-sm font-medium text-gray-700 mb-1">
                  List Name
                </label>
                <input
                  id="list-name"
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                  placeholder="e.g., Dream Birds"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCreateDialog(false)
                    setNewListName('')
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-[#2C3E50] mb-4">Delete Goal List?</h4>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <span className="font-semibold">Warning:</span> You are about to delete the goal list{' '}
                  <span className="font-semibold">"{deletingList.name}"</span>
                  {deletingList.speciesCodes.length > 0 && (
                    <>
                      {' '}which contains <span className="font-semibold">{deletingList.speciesCodes.length} bird{deletingList.speciesCodes.length !== 1 ? 's' : ''}</span>
                    </>
                  )}.
                </p>
                <p className="text-sm text-red-800 mt-2">
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelDelete}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
            <h4 className="text-lg font-semibold text-[#2C3E50] mb-2">No Goal Lists Yet</h4>
            <p className="text-sm text-gray-600 mb-4">
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
          <div>
            {activeList.speciesCodes.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700">
                  <span className="font-medium">This list is empty.</span>
                  <br />
                  Add species from the Species tab to build your goal list.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeList.speciesCodes.map((code) => (
                  <div key={code} className="px-3 py-2 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium text-[#2C3E50]">{code}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface TripPlanTabProps {
  selectedLocation?: SelectedLocation | null
  currentWeek?: number
  onWeekChange?: (week: number) => void
}

interface TripLifer {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName: string
  probability: number
  difficultyLabel: string
}

function TripPlanTab({
  selectedLocation,
  currentWeek = 26,
}: TripPlanTabProps) {
  const [startWeek, setStartWeek] = useState(currentWeek)
  const [endWeek, setEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [lifers, setLifers] = useState<TripLifer[]>([])
  const [loading, setLoading] = useState(false)
  const [speciesData, setSpeciesData] = useState<Species[]>([])
  const [speciesLoaded, setSpeciesLoaded] = useState(false)
  const { seenSpecies } = useLifeList()

  const getWeekLabel = (week: number): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dayOfYear = week * 7 - 3
    const date = new Date(2024, 0, dayOfYear)
    return `${monthNames[date.getMonth()]} ${date.getDate()}`
  }

  // Load species metadata once
  useEffect(() => {
    const fetchSpecies = async () => {
      try {
        const response = await fetch('/api/species')
        if (!response.ok) return
        const data: Species[] = await response.json()
        setSpeciesData(data)
        setSpeciesLoaded(true)
        console.log('Trip Plan: loaded species metadata', data.length)
      } catch (error) {
        console.error('Trip Plan: failed to load species', error)
      }
    }
    fetchSpecies()
  }, [])

  // Sync start/end weeks with currentWeek from Explore tab
  useEffect(() => {
    setStartWeek(currentWeek)
    setEndWeek(Math.min(currentWeek + 2, 52))
  }, [currentWeek])

  // Load occurrence data when location or week range changes
  useEffect(() => {
    if (!selectedLocation || !speciesLoaded) {
      setLifers([])
      return
    }

    const loadTripData = async () => {
      setLoading(true)
      try {
        // Build species lookup map
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        // Determine weeks to load
        const weeksToLoad: number[] = []
        for (let w = startWeek; w <= endWeek; w++) {
          weeksToLoad.push(w)
        }

        // Accumulate probabilities for species in the selected cell
        const speciesProbabilities = new Map<number, { total: number; count: number }>()

        for (const week of weeksToLoad) {
          try {
            const response = await fetch(`/api/weeks/${week}`)
            if (!response.ok) continue
            const weekData: { cell_id: number; species_id: number; probability: number }[] = await response.json()
            const cellRecords = weekData.filter(r => r.cell_id === selectedLocation.cellId)
            cellRecords.forEach(record => {
              const existing = speciesProbabilities.get(record.species_id) || { total: 0, count: 0 }
              speciesProbabilities.set(record.species_id, {
                total: existing.total + record.probability,
                count: existing.count + 1
              })
            })
          } catch (err) {
            console.error(`Trip Plan: failed to load week ${week}`, err)
          }
        }

        // Build ranked lifer list (unseen species only)
        const liferList: TripLifer[] = []
        speciesProbabilities.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species) return
          if (seenSpecies.has(species.speciesCode)) return

          liferList.push({
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          })
        })

        // Sort by occurrence probability (highest first)
        liferList.sort((a, b) => b.probability - a.probability)
        setLifers(liferList)
        console.log(`Trip Plan: found ${liferList.length} lifers at cell ${selectedLocation.cellId} for weeks ${startWeek}-${endWeek}`)
      } catch (error) {
        console.error('Trip Plan: error loading data', error)
      } finally {
        setLoading(false)
      }
    }

    loadTripData()
  }, [selectedLocation, startWeek, endWeek, speciesLoaded, speciesData, seenSpecies])

  const formatProbability = (prob: number): string => {
    return (prob * 100).toFixed(1) + '%'
  }

  const getProbabilityColor = (prob: number): string => {
    if (prob >= 0.5) return 'text-green-700 bg-green-50'
    if (prob >= 0.2) return 'text-yellow-700 bg-yellow-50'
    if (prob >= 0.05) return 'text-orange-700 bg-orange-50'
    return 'text-red-700 bg-red-50'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Trip Planning</h3>
        <p className="text-sm text-gray-600">
          Click a location on the map, then set your date range to see ranked lifers.
        </p>
      </div>

      {/* Location Display */}
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] mb-1">
            Selected Location
          </label>
          {selectedLocation ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-800">
                Cell #{selectedLocation.cellId}
              </div>
              <div className="text-xs text-blue-600">
                {selectedLocation.coordinates[1].toFixed(2)}°N, {Math.abs(selectedLocation.coordinates[0]).toFixed(2)}°W
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-500 italic">
                Click on the map to select a location
              </p>
            </div>
          )}
        </div>

        {/* Date Range (Week Range) Picker */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] mb-1">
            Date Range
          </label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Start Week</label>
              <input
                type="range"
                min="1"
                max="52"
                value={startWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setStartWeek(val)
                  if (val > endWeek) setEndWeek(val)
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              />
              <div className="text-xs text-center text-[#2C3E7B] font-medium">
                Week {startWeek} (~{getWeekLabel(startWeek)})
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">End Week</label>
              <input
                type="range"
                min="1"
                max="52"
                value={endWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setEndWeek(val)
                  if (val < startWeek) setStartWeek(val)
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              />
              <div className="text-xs text-center text-[#2C3E7B] font-medium">
                Week {endWeek} (~{getWeekLabel(endWeek)})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ranked Lifer List */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {!selectedLocation ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-700">
              <span className="font-medium">Select a location</span> on the map to see lifers you could find there.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
          </div>
        ) : lifers.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-sm text-green-700">
              <span className="font-medium">No lifers found!</span> You have already seen all species recorded in this area during this period.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-[#2C3E50]">
                Potential Lifers ({lifers.length})
              </h4>
              <span className="text-xs text-gray-500">
                Sorted by probability
              </span>
            </div>
            <div className="space-y-1">
              {lifers.map((lifer, index) => (
                <div
                  key={lifer.speciesCode}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <div className="text-xs text-gray-400 w-6 text-right font-mono">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#2C3E50] truncate">
                      {lifer.comName}
                    </div>
                    <div className="text-xs italic text-gray-500 truncate">
                      {lifer.sciName}
                    </div>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getProbabilityColor(lifer.probability)}`}>
                    {formatProbability(lifer.probability)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProgressTab() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">My Progress</h3>
      <p className="text-sm text-gray-600">
        Track your birding progress with stats and visual breakdowns by family and region.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          <span className="font-medium">Coming soon:</span> Progress dashboard with charts.
        </p>
      </div>
    </div>
  )
}

function ProfileTab() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">Profile & Data</h3>
      <p className="text-sm text-gray-600">
        Manage your life list data. Import from eBird, export as CSV, or reset your list.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          <span className="font-medium">Coming soon:</span> eBird CSV import and data management.
        </p>
      </div>
    </div>
  )
}
