import { useState, useRef } from 'react'
import { useLifeList } from '../contexts/LifeListContext'

export default function ProfileTab() {
  const { importSpeciesList, clearAllSpecies, getTotalSeen } = useLifeList()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ matched: number; unmatched: number; total: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)
    setImportError(null)

    try {
      // Read the CSV file
      const text = await file.text()
      const lines = text.split('\n')

      // Parse CSV header to find column indices
      const header = lines[0].split(',')
      const comNameIndex = header.findIndex(col => col.toLowerCase().includes('common name'))
      const sciNameIndex = header.findIndex(col => col.toLowerCase().includes('scientific name'))

      if (comNameIndex === -1 && sciNameIndex === -1) {
        throw new Error('CSV file must contain either "Common Name" or "Scientific Name" column')
      }

      // Fetch species metadata from API
      const response = await fetch('/api/species')
      if (!response.ok) {
        throw new Error('Failed to fetch species data')
      }
      const allSpecies = await response.json() as Array<{
        speciesCode: string
        comName: string
        sciName: string
      }>

      // Create lookup maps for matching
      const comNameMap = new Map<string, { code: string; name: string }>()
      const sciNameMap = new Map<string, { code: string; name: string }>()

      allSpecies.forEach(species => {
        const comKey = species.comName.toLowerCase().trim()
        const sciKey = species.sciName.toLowerCase().trim()
        comNameMap.set(comKey, { code: species.speciesCode, name: species.comName })
        sciNameMap.set(sciKey, { code: species.speciesCode, name: species.comName })
      })

      // Parse CSV and match species
      const matchedCodes: string[] = []
      const matchedNames: string[] = []
      let unmatchedCount = 0

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const cols = line.split(',')

        // Try to match by common name first, then scientific name
        let matched = false

        if (comNameIndex >= 0 && cols[comNameIndex]) {
          const comName = cols[comNameIndex].toLowerCase().trim()
          const match = comNameMap.get(comName)
          if (match) {
            matchedCodes.push(match.code)
            matchedNames.push(match.name)
            matched = true
          }
        }

        if (!matched && sciNameIndex >= 0 && cols[sciNameIndex]) {
          const sciName = cols[sciNameIndex].toLowerCase().trim()
          const match = sciNameMap.get(sciName)
          if (match) {
            matchedCodes.push(match.code)
            matchedNames.push(match.name)
            matched = true
          }
        }

        if (!matched) {
          unmatchedCount++
        }
      }

      // Import matched species
      if (matchedCodes.length > 0) {
        await importSpeciesList(matchedCodes, matchedNames)
      }

      setImportResult({
        matched: matchedCodes.length,
        unmatched: unmatchedCount,
        total: lines.length - 1 // Subtract header row
      })
    } catch (error) {
      console.error('Error importing CSV:', error)
      setImportError(error instanceof Error ? error.message : 'Failed to import CSV file')
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear your entire life list? This cannot be undone.')) {
      try {
        await clearAllSpecies()
        setImportResult(null)
      } catch (error) {
        console.error('Error clearing life list:', error)
      }
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">Profile & Data</h3>
      <p className="text-sm text-gray-600">
        Manage your life list data. Import from eBird, export as CSV, or reset your list.
      </p>

      {/* Import Section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[#2C3E50]">Import eBird Life List</h4>
        <p className="text-xs text-gray-600">
          Upload your eBird CSV life list to automatically mark species as seen.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
          data-testid="csv-file-input"
        />
        <button
          onClick={handleImportClick}
          disabled={importing}
          className="w-full px-4 py-2 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2a54] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          data-testid="import-csv-button"
        >
          {importing ? 'Importing...' : 'Import CSV'}
        </button>

        {/* Import Progress/Results */}
        {importing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3" data-testid="import-progress">
            <p className="text-sm text-blue-700">
              <span className="font-medium">Importing...</span> Please wait while we process your file.
            </p>
          </div>
        )}

        {importResult && !importing && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3" data-testid="import-success">
            <p className="text-sm text-green-700">
              <span className="font-medium">Import complete!</span>
            </p>
            <p className="text-xs text-green-600 mt-1">
              {importResult.matched} of {importResult.total} species matched and imported.
              {importResult.unmatched > 0 && ` (${importResult.unmatched} could not be matched)`}
            </p>
          </div>
        )}

        {importError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3" data-testid="import-error">
            <p className="text-sm text-red-700">
              <span className="font-medium">Import failed:</span> {importError}
            </p>
          </div>
        )}
      </div>

      {/* Stats Section */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] mb-2">Your Life List</h4>
        <p className="text-2xl font-bold text-[#2C3E7B]" data-testid="total-seen-count">
          {getTotalSeen()} species
        </p>
        <p className="text-xs text-gray-600">marked as seen</p>
      </div>

      {/* Clear All Section */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] mb-2">Reset Data</h4>
        <p className="text-xs text-gray-600 mb-2">
          Clear your entire life list. This action cannot be undone.
        </p>
        <button
          onClick={handleClearAll}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          data-testid="clear-all-button"
        >
          Clear All Species
        </button>
      </div>
    </div>
  )
}
