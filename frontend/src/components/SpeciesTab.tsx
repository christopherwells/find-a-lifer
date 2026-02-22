import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLifeList } from '../contexts/LifeListContext'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'
import type { Species, SpeciesByFamily, SpeciesTabProps } from './types'
import SpeciesInfoCard from './SpeciesInfoCard'

export default function SpeciesTab({ selectedRegion = null }: SpeciesTabProps) {
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [speciesByFamily, setSpeciesByFamily] = useState<SpeciesByFamily>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFamily, setSelectedFamily] = useState<string>('') // '' means "All Families"
  const [selectedConservStatus, setSelectedConservStatus] = useState<string>('') // '' means "All"
  const [selectedInvasionStatus, setSelectedInvasionStatus] = useState<string>('') // '' means "All"
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('') // '' means "All Difficulties"
  const { isSpeciesSeen, toggleSpecies, getTotalSeen } = useLifeList()

  // Region filtering state
  const [regionSpeciesCodes, setRegionSpeciesCodes] = useState<Set<string> | null>(null)
  const [regionName, setRegionName] = useState<string | null>(null)

  // Goal list management for adding species to goal lists
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [addingSpecies, setAddingSpecies] = useState<{ code: string; name: string } | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(null)

  // Auto-clear success message after 3 seconds
  useEffect(() => {
    if (!showSuccessMessage) return
    const timer = setTimeout(() => setShowSuccessMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [showSuccessMessage])

  // Species info card
  const [selectedSpeciesCard, setSelectedSpeciesCard] = useState<Species | null>(null)

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedSpecies, setHighlightedSpecies] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const speciesRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-clear highlight after 3 seconds (with cleanup on re-highlight or unmount)
  useEffect(() => {
    if (!highlightedSpecies) return
    const timer = setTimeout(() => setHighlightedSpecies(null), 3000)
    return () => clearTimeout(timer)
  }, [highlightedSpecies])

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

  // Load region data when selectedRegion changes
  useEffect(() => {
    const loadRegionData = async () => {
      if (!selectedRegion) {
        // No region selected, clear filter
        setRegionSpeciesCodes(null)
        setRegionName(null)
        return
      }

      try {
        const response = await fetch('/api/regions')
        if (!response.ok) {
          throw new Error(`Failed to fetch regions: ${response.status}`)
        }
        const data = await response.json()

        // Find the selected region
        const region = data.features?.find(
          (f: any) => f.properties.region_id === selectedRegion
        )

        if (region && region.properties) {
          const codes = new Set<string>(region.properties.species_codes || [])
          setRegionSpeciesCodes(codes)
          setRegionName(region.properties.name || selectedRegion)
          console.log(`SpeciesTab: filtered to region "${region.properties.name}" with ${codes.size} species`)
        } else {
          // Region not found, clear filter
          setRegionSpeciesCodes(null)
          setRegionName(null)
        }
      } catch (error) {
        console.error('Failed to load region data:', error)
        setRegionSpeciesCodes(null)
        setRegionName(null)
      }
    }

    loadRegionData()
  }, [selectedRegion])

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

  // Generate autocomplete suggestions from search term
  const suggestions = searchTerm.trim().length > 0
    ? allSpecies
        .filter((species) => {
          const search = searchTerm.toLowerCase()
          return (
            species.comName.toLowerCase().includes(search) ||
            species.sciName.toLowerCase().includes(search)
          )
        })
        .slice(0, 10) // Limit to 10 suggestions
    : []

  // Handle selecting a species from autocomplete
  const handleSelectSuggestion = (species: Species) => {
    setSearchTerm('') // Clear search
    setShowSuggestions(false)
    setHighlightedSpecies(species.speciesCode)

    // Expand the family if it's collapsed
    if (collapsedFamilies.has(species.familyComName)) {
      setCollapsedFamilies((prev) => {
        const next = new Set(prev)
        next.delete(species.familyComName)
        return next
      })
    }

    // Scroll to the species after a brief delay to ensure it's rendered
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      const speciesElement = speciesRefs.current[species.speciesCode]
      if (speciesElement) {
        speciesElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)

    // Highlight auto-clears via useEffect above
  }

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    setShowSuggestions(value.trim().length > 0)
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter species by search term, selected family, conservation status, invasion status, and region
  const filteredFamilies = Object.keys(speciesByFamily).reduce((acc, familyName) => {
    // If a family is selected, only include that family
    if (selectedFamily && familyName !== selectedFamily) {
      return acc
    }

    const familySpecies = speciesByFamily[familyName]
    const filtered = familySpecies.filter((species) => {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        species.comName.toLowerCase().includes(search) ||
        species.sciName.toLowerCase().includes(search) ||
        familyName.toLowerCase().includes(search)

      const matchesConserv =
        !selectedConservStatus || species.conservStatus === selectedConservStatus

      const matchesInvasion =
        !selectedInvasionStatus || species.invasionStatus === selectedInvasionStatus

      const matchesDifficulty =
        !selectedDifficulty || species.difficultyLabel === selectedDifficulty

      const matchesRegion =
        !regionSpeciesCodes || regionSpeciesCodes.has(species.speciesCode)

      return matchesSearch && matchesConserv && matchesInvasion && matchesDifficulty && matchesRegion
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

  // Calculate filtered counts
  const filteredSpeciesCount = Object.values(filteredFamilies).reduce(
    (sum, familySpecies) => sum + familySpecies.length,
    0
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>

        {/* Species count */}
        <div className="text-sm text-gray-600">
          <span className="font-medium text-[#2C3E7B]">{seenSpecies}</span> of{' '}
          <span className="font-medium">{totalSpecies}</span> species seen
          {(selectedFamily || selectedConservStatus || selectedInvasionStatus || selectedDifficulty || regionSpeciesCodes) && (
            <span className="text-xs text-gray-500 ml-2">
              (showing {filteredSpeciesCount})
            </span>
          )}
        </div>

        {/* Region filter indicator */}
        {regionName && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2" data-testid="region-filter-indicator">
            <p className="text-xs text-blue-700">
              <span className="font-medium">📍 Region Filter:</span> Showing only species found in {regionName}
            </p>
          </div>
        )}

        {/* Family filter dropdown */}
        <div>
          <label htmlFor="family-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Filter by Family
          </label>
          <select
            id="family-filter"
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="family-filter"
          >
            <option value="">All Families</option>
            {Object.keys(speciesByFamily).sort().map((familyName) => (
              <option key={familyName} value={familyName}>
                {familyName} ({speciesByFamily[familyName].length})
              </option>
            ))}
          </select>
        </div>

        {/* Conservation status filter */}
        <div>
          <label htmlFor="conservation-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Conservation Status
          </label>
          <select
            id="conservation-filter"
            value={selectedConservStatus}
            onChange={(e) => setSelectedConservStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="conservation-filter"
          >
            <option value="">All Conservation Statuses</option>
            <option value="Least Concern">🟢 Least Concern</option>
            <option value="Near Threatened">🟡 Near Threatened</option>
            <option value="Vulnerable">🟠 Vulnerable</option>
            <option value="Endangered">🔴 Endangered</option>
            <option value="Critically Endangered">🔴 Critically Endangered</option>
            <option value="Extinct in the Wild">⚫ Extinct in the Wild</option>
            <option value="Data Deficient">❓ Data Deficient</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>

        {/* Invasion status filter */}
        <div>
          <label htmlFor="invasion-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Origin Status
          </label>
          <select
            id="invasion-filter"
            value={selectedInvasionStatus}
            onChange={(e) => setSelectedInvasionStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="invasion-filter"
          >
            <option value="">All Origins</option>
            <option value="Native">🐦 Native</option>
            <option value="Introduced">⚠️ Introduced</option>
            <option value="Rare/Accidental">🔍 Rare/Accidental</option>
          </select>
        </div>

        {/* Difficulty filter */}
        <div>
          <label htmlFor="difficulty-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Difficulty Level
          </label>
          <select
            id="difficulty-filter"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="difficulty-filter"
          >
            <option value="">All Difficulty Levels</option>
            <option value="Easy">🟢 Easy</option>
            <option value="Moderate">🟡 Moderate</option>
            <option value="Hard">🟠 Hard</option>
            <option value="Very Hard">🔴 Very Hard</option>
          </select>
        </div>

        {/* Search box with autocomplete */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search species or family..."
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => searchTerm.trim().length > 0 && setShowSuggestions(true)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="species-search-input"
          />

          {/* Autocomplete suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              data-testid="autocomplete-suggestions"
            >
              {suggestions.map((species) => (
                <button
                  key={species.speciesCode}
                  onClick={() => handleSelectSuggestion(species)}
                  className="w-full text-left px-3 py-2 hover:bg-[#2C3E7B] hover:bg-opacity-10 border-b border-gray-100 last:border-b-0 transition-colors"
                  data-testid={`suggestion-${species.speciesCode}`}
                >
                  <div className="text-sm font-medium text-[#2C3E50]">{species.comName}</div>
                  <div className="text-xs text-gray-500 italic">{species.sciName}</div>
                  <div className="text-xs text-gray-400">{species.familyComName}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Species list by family */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-1">
        {Object.keys(filteredFamilies).length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">
            {searchTerm
              ? `No species found matching "${searchTerm}"`
              : selectedConservStatus || selectedInvasionStatus || selectedDifficulty
              ? 'No species match the active filters'
              : 'No species found'}
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
                        ref={(el) => {
                          speciesRefs.current[species.speciesCode] = el
                        }}
                        className={`px-3 py-2 transition-colors ${
                          highlightedSpecies === species.speciesCode
                            ? 'bg-yellow-100 ring-2 ring-yellow-400'
                            : 'hover:bg-blue-50'
                        }`}
                        data-testid={`species-item-${species.speciesCode}`}
                      >
                        <div className="flex items-start gap-2">
                          {/* Functional checkbox with IndexedDB persistence */}
                          <input
                            type="checkbox"
                            checked={isSpeciesSeen(species.speciesCode)}
                            onChange={() => toggleSpecies(species.speciesCode, species.comName)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#2C3E7B] focus:ring-[#2C3E7B] cursor-pointer"
                          />
                          {/* Clickable species name area opens info card */}
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => setSelectedSpeciesCard(species)}
                            title={`View ${species.comName} info`}
                            data-testid={`species-info-btn-${species.speciesCode}`}
                          >
                            {/* Common name */}
                            <div className="text-sm font-medium text-[#2C3E50] hover:text-[#2C3E7B] truncate">
                              {species.comName}
                            </div>
                            {/* Scientific name */}
                            <div className="text-xs italic text-gray-600 truncate">
                              {species.sciName}
                            </div>
                            {/* Badges */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {species.conservStatus && species.conservStatus !== 'Unknown' && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${species.conservStatus === 'Least Concern' ? 'bg-green-100 text-green-800' : species.conservStatus === 'Near Threatened' ? 'bg-yellow-100 text-yellow-800' : species.conservStatus === 'Vulnerable' ? 'bg-orange-100 text-orange-800' : species.conservStatus === 'Endangered' ? 'bg-red-100 text-red-800' : species.conservStatus === 'Critically Endangered' ? 'bg-red-200 text-red-900' : 'bg-gray-100 text-gray-600'}`} data-testid={`checklist-conservation-badge-${species.speciesCode}`}>🌿</span>
                              )}
                              {species.difficultyLabel && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${species.difficultyLabel === 'Easy' ? 'bg-green-100 text-green-800' : species.difficultyLabel === 'Moderate' ? 'bg-yellow-100 text-yellow-800' : species.difficultyLabel === 'Hard' ? 'bg-orange-100 text-orange-800' : species.difficultyLabel === 'Very Hard' ? 'bg-red-100 text-red-800' : species.difficultyLabel === 'Extremely Hard' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'}`} data-testid={`checklist-difficulty-badge-${species.speciesCode}`}>🔭</span>
                              )}
                              {species.isRestrictedRange && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" data-testid={`checklist-restricted-badge-${species.speciesCode}`}>📍</span>
                              )}
                            </div>
                          </button>
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
