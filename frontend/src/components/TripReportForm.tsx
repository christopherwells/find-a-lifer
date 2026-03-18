import { useState } from 'react'

interface TripReportFormProps {
  onSubmit: (data: {
    title: string
    date: string
    location: { name: string; coordinates?: [number, number] }
    speciesCodes: string[]
    highlights: string
    isPublic: boolean
  }) => Promise<void>
  onCancel: () => void
  seenSpecies?: Array<{ code: string; name: string }>
}

export default function TripReportForm({ onSubmit, onCancel, seenSpecies = [] }: TripReportFormProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [locationName, setLocationName] = useState('')
  const [highlights, setHighlights] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [selectedSpecies, setSelectedSpecies] = useState<Set<string>>(new Set())
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const filteredSpecies = seenSpecies.filter(s =>
    s.name.toLowerCase().includes(speciesSearch.toLowerCase())
  ).slice(0, 20)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        title,
        date,
        location: { name: locationName },
        speciesCodes: Array.from(selectedSpecies),
        highlights,
        isPublic,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">New Trip Report</h4>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Trip title (e.g., Spring migration at High Island)"
        required
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="Location"
          required
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>

      <textarea
        value={highlights}
        onChange={(e) => setHighlights(e.target.value)}
        placeholder="Trip highlights..."
        rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
      />

      {/* Species selector */}
      {seenSpecies.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Species seen ({selectedSpecies.size} selected)
          </p>
          <input
            type="text"
            value={speciesSearch}
            onChange={(e) => setSpeciesSearch(e.target.value)}
            placeholder="Search species..."
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredSpecies.map(s => (
              <label key={s.code} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSpecies.has(s.code)}
                  onChange={() => {
                    setSelectedSpecies(prev => {
                      const next = new Set(prev)
                      if (next.has(s.code)) next.delete(s.code)
                      else next.add(s.code)
                      return next
                    })
                  }}
                  className="h-3 w-3 rounded"
                />
                <span className="text-gray-700 dark:text-gray-300">{s.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="h-3.5 w-3.5 rounded"
        />
        <span className="text-gray-700 dark:text-gray-300">Visible to friends</span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-4 py-2 bg-[#2C3E7B] text-white text-sm rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save Report'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
