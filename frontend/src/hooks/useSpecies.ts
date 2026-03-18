import { useState, useEffect } from 'react'
import type { Species } from '../components/types'
import { fetchSpecies } from '../lib/dataCache'

export function useSpecies() {
  const [species, setSpecies] = useState<Species[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSpecies()
      .then(data => setSpecies(data))
      .catch(err => console.error('Failed to load species:', err))
      .finally(() => setLoading(false))
  }, [])

  return { species, loading }
}
