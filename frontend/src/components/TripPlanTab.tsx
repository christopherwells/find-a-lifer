import { useState, useEffect, useMemo } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useMapControls } from '../contexts/MapControlsContext'
import type { Species } from './types'
import { fetchSpecies, fetchGrid } from '../lib/dataCache'
import { buildSpeciesById } from './tripPlanUtils'
import TripGroupSection from './TripGroupSection'
import TripPlanner from './TripPlanner'

export default function TripPlanTab() {
  const { state: { goalLists } } = useMapControls()
  const { effectiveSeenSpecies: seenSpecies } = useLifeList()

  const [speciesData, setSpeciesData] = useState<Species[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gridData, setGridData] = useState<any>(null)
  const [dataError, setDataError] = useState<string | null>(null)

  const speciesById = useMemo(() => buildSpeciesById(speciesData), [speciesData])

  const cellLabels = useMemo(() => {
    const labels = new Map<number, string>()
    if (!gridData?.features) return labels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gridData.features.forEach((f: any) => {
      const id = f.properties?.cell_id
      const label = f.properties?.label
      if (id != null && label) labels.set(id, label)
    })
    return labels
  }, [gridData])

  useEffect(() => {
    fetchSpecies()
      .then(data => { setSpeciesData(data); setDataError(null) })
      .catch(() => setDataError('Failed to load species data.'))
  }, [])

  useEffect(() => {
    fetchGrid()
      .then(data => setGridData(data))
      .catch(() => setDataError('Failed to load grid data.'))
  }, [])

  return (
    <div className="flex flex-col h-full">
      <TripGroupSection />

      {dataError && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1.5 rounded text-xs mb-2">
          {dataError}
        </div>
      )}

      <TripPlanner
        speciesData={speciesData}
        speciesById={speciesById}
        cellLabels={cellLabels}
        gridData={gridData}
        seenSpecies={seenSpecies}
        goalLists={goalLists}
      />
    </div>
  )
}
