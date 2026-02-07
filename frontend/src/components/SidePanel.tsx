import { useState, useEffect } from 'react'
import { useLifeList } from '../contexts/LifeListContext'

export type MapViewMode = 'density' | 'probability' | 'species'

type TabId = 'explore' | 'species' | 'goals' | 'trip' | 'progress' | 'profile'

interface SidePanelProps {
  collapsed: boolean
  onToggle: () => void
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
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
  onViewModeChange
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('explore')

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
          {activeTab === 'trip' && <TripPlanTab />}
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
    </div>
  )
}

function GoalBirdsTab() {
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [loading, setLoading] = useState(true)

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

  const activeList = goalLists.find((list) => list.id === activeListId)

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
          <select
            value={activeListId || ''}
            onChange={(e) => setActiveListId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
          >
            {goalLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} ({list.speciesCodes.length} birds)
              </option>
            ))}
          </select>
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

function TripPlanTab() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">Trip Planning</h3>
      <p className="text-sm text-gray-600">
        Plan your next birding trip by finding the best locations and times to see new life birds.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          <span className="font-medium">Coming soon:</span> Location comparison and lifer rankings.
        </p>
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
