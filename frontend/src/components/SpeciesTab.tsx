import { useState, useEffect, useRef } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'
import type { Species, SpeciesByFamily, SpeciesTabProps } from './types'
import SpeciesInfoCard from './SpeciesInfoCard'
import { fetchSpecies } from '../lib/dataCache'
import { FamilyGroupSkeleton } from './Skeleton'

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
  const { isSpeciesSeen, toggleSpecies, markSpeciesSeen, markSpeciesUnseen, getTotalSeen } = useLifeList()

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

  // Fetch species data from API (shared cache)
  useEffect(() => {
    const loadSpecies = async () => {
      try {
        setLoading(true)
        const data: Species[] = await fetchSpecies()

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

    loadSpecies()
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
        const { fetchRegions } = await import('../lib/dataCache')
        const data = await fetchRegions()

        // Find the selected region
        const region = data.features?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature
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
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Species Checklist</h3>
        <FamilyGroupSkeleton itemCount={4} />
        <FamilyGroupSkeleton itemCount={3} />
        <FamilyGroupSkeleton itemCount={5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Species Checklist</h3>
        <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-2">
          <p className="text-[11px] text-red-700 dark:text-red-400">{error}</p>
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

  // Count active filters for the clear filters button
  const activeFilterCount = [selectedFamily, selectedConservStatus, selectedInvasionStatus, selectedDifficulty].filter(v => v !== '').length

  const clearAllFilters = () => {
    setSelectedFamily('')
    setSelectedConservStatus('')
    setSelectedInvasionStatus('')
    setSelectedDifficulty('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Species Checklist</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-[11px] text-red-500 hover:text-red-700 flex items-center gap-0.5"
                data-testid="clear-filters-btn"
              >
                Clear Filters
                <span className="bg-red-100 text-red-600 rounded-full px-1 text-[10px] font-semibold">{activeFilterCount}</span>
              </button>
            )}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-[#2C3E7B] dark:text-blue-400">{seenSpecies}</span>/{totalSpecies}
            {(selectedFamily || selectedConservStatus || selectedInvasionStatus || selectedDifficulty || regionSpeciesCodes) && (
              <span className="text-gray-400 dark:text-gray-500 ml-1">({filteredSpeciesCount} shown)</span>
            )}
          </span>
        </div>

        {/* Region filter indicator */}
        {regionName && (
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded px-2 py-1" data-testid="region-filter-indicator">
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
              Filtered to {regionName}
            </p>
          </div>
        )}

        {/* Search box with autocomplete */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search species..."
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => searchTerm.trim().length > 0 && setShowSuggestions(true)}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2C3E7B] focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
            data-testid="species-search-input"
          />

          {/* Autocomplete suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"
              data-testid="autocomplete-suggestions"
            >
              {suggestions.map((species) => (
                <button
                  key={species.speciesCode}
                  onClick={() => handleSelectSuggestion(species)}
                  className="w-full text-left px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-b-0 transition-colors"
                  data-testid={`suggestion-${species.speciesCode}`}
                >
                  <div className="text-xs font-medium text-[#2C3E50] dark:text-gray-200">{species.comName}</div>
                  <div className="text-[10px] text-gray-400 italic">{species.sciName} · {species.familyComName}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2x2 Filter Grid — no labels, placeholder text serves as label */}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            id="family-filter"
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            className="px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2C3E7B] bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            data-testid="family-filter"
          >
            <option value="">All Families</option>
            {Object.keys(speciesByFamily).sort().map((familyName) => (
              <option key={familyName} value={familyName}>
                {familyName} ({speciesByFamily[familyName].length})
              </option>
            ))}
          </select>
          <select
            id="conservation-filter"
            value={selectedConservStatus}
            onChange={(e) => setSelectedConservStatus(e.target.value)}
            className="px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2C3E7B] bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            data-testid="conservation-filter"
          >
            <option value="">All Statuses</option>
            <option value="Least Concern">Least Concern</option>
            <option value="Near Threatened">Near Threatened</option>
            <option value="Vulnerable">Vulnerable</option>
            <option value="Endangered">Endangered</option>
            <option value="Critically Endangered">Critically Endangered</option>
            <option value="Extinct in the Wild">Extinct in Wild</option>
            <option value="Data Deficient">Data Deficient</option>
            <option value="Unknown">Unknown</option>
          </select>
          <select
            id="invasion-filter"
            value={selectedInvasionStatus}
            onChange={(e) => setSelectedInvasionStatus(e.target.value)}
            className="px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2C3E7B] bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            data-testid="invasion-filter"
          >
            <option value="">All Origins</option>
            <option value="Native">Native</option>
            <option value="Introduced">Introduced</option>
            <option value="Rare/Accidental">Rare/Accidental</option>
          </select>
          <select
            id="difficulty-filter"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2C3E7B] bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            data-testid="difficulty-filter"
          >
            <option value="">All Levels</option>
            <option value="Easy">Easy</option>
            <option value="Moderate">Moderate</option>
            <option value="Hard">Hard</option>
            <option value="Very Hard">Very Hard</option>
          </select>
        </div>

        {/* Global Select All/None */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-gray-500 dark:text-gray-400">Select:</span>
            <button
              onClick={() => {
                const allFiltered = Object.values(filteredFamilies).flat()
                allFiltered.forEach(s => markSpeciesSeen(s.speciesCode, s.comName, 'manual'))
              }}
              className="text-[#2C3E7B] hover:underline font-medium"
              data-testid="global-select-all"
            >
              All
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => {
                const allFiltered = Object.values(filteredFamilies).flat()
                allFiltered.forEach(s => markSpeciesUnseen(s.speciesCode))
              }}
              className="text-[#2C3E7B] hover:underline font-medium"
              data-testid="global-select-none"
            >
              None
            </button>
          </div>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">({filteredSpeciesCount} filtered)</span>
        </div>
      </div>

      {/* Species list by family */}
      <div className="flex-1 overflow-y-auto mt-2">
        {Object.keys(filteredFamilies).length === 0 ? (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
            {searchTerm
              ? `No species matching "${searchTerm}"`
              : 'No species match the active filters'}
          </div>
        ) : (
          Object.keys(filteredFamilies).map((familyName) => {
            const familySpecies = filteredFamilies[familyName]
            const isCollapsed = collapsedFamilies.has(familyName)

            return (
              <div key={familyName}>
                {/* Family header — compact, matching Lifers popup */}
                <div
                  onClick={() => toggleFamily(familyName)}
                  className="w-full flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors sticky top-0 z-10 cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleFamily(familyName) }}
                >
                  <div className="flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-3 w-3 text-gray-400 transition-transform ${
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{familyName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400">{familySpecies.length}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        familySpecies.forEach(s => markSpeciesSeen(s.speciesCode, s.comName, 'manual'))
                      }}
                      className="text-[10px] text-[#2C3E7B] hover:underline font-medium px-0.5"
                      data-testid={`family-select-all-${familyName}`}
                    >
                      All
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        familySpecies.forEach(s => markSpeciesUnseen(s.speciesCode))
                      }}
                      className="text-[10px] text-[#2C3E7B] hover:underline font-medium px-0.5"
                      data-testid={`family-select-none-${familyName}`}
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Species in family — compact single-line items */}
                {!isCollapsed && (
                  <div>
                    {familySpecies.map((species) => (
                      <div
                        key={species.species_id}
                        ref={(el) => {
                          speciesRefs.current[species.speciesCode] = el
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1 border-b border-gray-50 dark:border-gray-800 transition-colors ${
                          highlightedSpecies === species.speciesCode
                            ? 'bg-yellow-50 dark:bg-yellow-900/30 ring-1 ring-yellow-300 dark:ring-yellow-600'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                        data-testid={`species-item-${species.speciesCode}`}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSpeciesSeen(species.speciesCode)}
                          onChange={() => toggleSpecies(species.speciesCode, species.comName)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-[#2C3E7B] focus:ring-[#2C3E7B] cursor-pointer flex-shrink-0"
                        />
                        {/* Species name — single line */}
                        <button
                          className="flex-1 min-w-0 text-left truncate"
                          onClick={() => setSelectedSpeciesCard(species)}
                          title={`${species.comName} (${species.sciName})`}
                          data-testid={`species-info-btn-${species.speciesCode}`}
                        >
                          <span className="text-xs font-medium text-[#2C3E50] dark:text-gray-200 hover:text-[#2C3E7B] dark:hover:text-blue-400">
                            {species.comName}
                          </span>
                        </button>
                        {/* Inline status dots */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {species.conservStatus && species.conservStatus !== 'Least Concern' && species.conservStatus !== 'Unknown' && (
                            <span className={`w-1.5 h-1.5 rounded-full ${species.conservStatus === 'Near Threatened' ? 'bg-yellow-400' : species.conservStatus === 'Vulnerable' ? 'bg-orange-400' : 'bg-red-500'}`} title={species.conservStatus} data-testid={`checklist-conservation-badge-${species.speciesCode}`} />
                          )}
                          {species.isRestrictedRange && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Restricted range" data-testid={`checklist-restricted-badge-${species.speciesCode}`} />
                          )}
                        </div>
                        {/* Add to goal list */}
                        <button
                          onClick={() => handleStartAddToGoalList(species.speciesCode, species.comName)}
                          className="flex-shrink-0 text-gray-300 hover:text-[#2C3E7B] transition-colors text-xs"
                          title="Add to goal list"
                          data-testid={`add-to-goal-${species.speciesCode}`}
                        >
                          +
                        </button>
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
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-96 max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100 mb-2">
              Add to Goal List
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
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
                    className="w-full text-left px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-[#2C3E7B] hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="font-medium text-[#2C3E50] dark:text-gray-200">{list.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
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
