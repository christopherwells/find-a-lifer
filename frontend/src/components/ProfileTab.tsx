import { useState, useCallback } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { fetchSpecies } from '../lib/dataCache'

async function clearAppCaches(): Promise<boolean> {
  try {
    // Clear Cache API (service worker runtime caches)
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map(name => caches.delete(name)))
    // Unregister service workers so fresh one installs
    const registrations = await navigator.serviceWorker?.getRegistrations()
    if (registrations) {
      await Promise.all(registrations.map(r => r.unregister()))
    }
    // Clear cached data from IndexedDB (but preserve user's life list and goal lists)
    indexedDB.deleteDatabase('find-a-lifer-grid-cache')
    return true
  } catch {
    return false
  }
}

/**
 * Parse a single CSV line into fields, handling:
 * - Quoted fields containing commas (e.g., "Warbler, Yellow")
 * - Escaped quotes within quoted fields (doubled quotes: "")
 * - Different line endings (\r\n, \r, \n)
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote (doubled "")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i += 2
        } else {
          // End of quoted field
          inQuotes = false
          i++
        }
      } else {
        current += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        fields.push(current)
        current = ''
        i++
      } else {
        current += ch
        i++
      }
    }
  }

  fields.push(current)
  return fields
}

export default function ProfileTab() {
  const { importSpeciesList, clearAllSpecies, getTotalSeen, isSpeciesSeen } = useLifeList()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ matched: number; unmatched: number; total: number; newCount: number; existingCount: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const handleCheckForUpdates = useCallback(async () => {
    setUpdating(true)
    const success = await clearAppCaches()
    if (success) {
      window.location.reload()
    } else {
      setUpdating(false)
      alert('Could not clear caches. Try manually clearing browser data.')
    }
  }, [])

  const handleImportClick = async () => {
    if (importing) return
    try {
      // Modern File System Access API (Chrome 86+)
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'CSV files',
            accept: { 'text/csv': ['.csv', '.txt', '.tsv'] }
          }],
          multiple: false
        })
        const file = await handle.getFile()
        handleFileImport(file)
        return
      }
    } catch (err: any) {
      // User cancelled the picker
      if (err?.name === 'AbortError') return
      console.error('showOpenFilePicker failed:', err)
    }

    // Fallback for browsers without File System Access API
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.txt,.tsv'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) handleFileImport(file)
      document.body.removeChild(input)
    }
    input.addEventListener('cancel', () => {
      document.body.removeChild(input)
    })
    input.click()
  }

  const handleFileImport = async (file: File) => {

    setImporting(true)
    setImportResult(null)
    setImportError(null)

    try {
      // Basic file validation
      const name = file.name.toLowerCase()
      if (!name.endsWith('.csv') && !name.endsWith('.txt') && !name.endsWith('.tsv')) {
        throw new Error('Please select a CSV or text file. eBird life lists are downloaded as .csv files.')
      }

      // Read the CSV file, normalizing line endings
      const text = await file.text()
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

      // Parse CSV header to find column indices
      const header = parseCSVLine(lines[0])
      const comNameIndex = header.findIndex(col => col.toLowerCase().includes('common name'))
      const sciNameIndex = header.findIndex(col => col.toLowerCase().includes('scientific name'))

      if (comNameIndex === -1 && sciNameIndex === -1) {
        throw new Error('CSV file must contain either "Common Name" or "Scientific Name" column')
      }

      // Fetch species metadata (shared cache)
      const allSpecies = await fetchSpecies() as Array<{
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

        const cols = parseCSVLine(line)

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

      // Import matched species and get merge stats
      let newCount = 0
      let existingCount = 0
      if (matchedCodes.length > 0) {
        const mergeResult = await importSpeciesList(matchedCodes, matchedNames)
        newCount = mergeResult.newCount
        existingCount = mergeResult.existingCount
      }

      setImportResult({
        matched: matchedCodes.length,
        unmatched: unmatchedCount,
        total: lines.length - 1, // Subtract header row
        newCount,
        existingCount
      })
    } catch (error) {
      console.error('Error importing CSV:', error)
      setImportError(error instanceof Error ? error.message : 'Failed to import CSV file')
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const allSpecies = await fetchSpecies()

      const seenSpecies = allSpecies.filter(s => isSpeciesSeen(s.speciesCode))

      const csvHeader = 'Common Name,Scientific Name,Species Code,Family'
      const csvRows = seenSpecies.map(s => {
        // Escape fields that might contain commas
        const comName = s.comName.includes(',') ? `"${s.comName}"` : s.comName
        const sciName = s.sciName.includes(',') ? `"${s.sciName}"` : s.sciName
        const familyName = s.familyComName.includes(',') ? `"${s.familyComName}"` : s.familyComName
        return `${comName},${sciName},${s.speciesCode},${familyName}`
      })

      const csvContent = [csvHeader, ...csvRows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = 'life-list-export.csv'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting CSV:', error)
    } finally {
      setExporting(false)
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
      <h3 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100">Profile & Data</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Manage your life list data. Import from eBird, export as CSV, or reset your list.
      </p>

      {/* Import Section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Import eBird Life List</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Upload your eBird CSV life list to automatically mark species as seen.
        </p>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={importing}
          className={`block w-full px-4 py-2 text-center rounded-lg transition-colors ${
            importing
              ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500'
              : 'bg-[#2C3E7B] text-white hover:bg-[#1e2a54] active:bg-[#162044]'
          }`}
          data-testid="import-csv-button"
        >
          {importing ? 'Importing...' : 'Import CSV'}
        </button>

        {/* Import Progress/Results */}
        {importing && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3" data-testid="import-progress">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <span className="font-medium">Importing...</span> Please wait while we process your file.
            </p>
          </div>
        )}

        {importResult && !importing && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3" data-testid="import-success">
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium">Import complete!</span>
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {importResult.matched} of {importResult.total} species matched.
              {importResult.unmatched > 0 && ` ${importResult.unmatched} could not be matched.`}
            </p>
            {importResult.matched > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1" data-testid="import-merge-stats">
                {importResult.newCount > 0 && <span className="font-medium">{importResult.newCount} new</span>}
                {importResult.newCount > 0 && importResult.existingCount > 0 && ', '}
                {importResult.existingCount > 0 && <span>{importResult.existingCount} already in your list</span>}
              </p>
            )}
          </div>
        )}

        {importError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3" data-testid="import-error">
            <p className="text-sm text-red-700 dark:text-red-400">
              <span className="font-medium">Import failed:</span> {importError}
            </p>
          </div>
        )}
      </div>

      {/* Stats Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Your Life List</h4>
        <p className="text-2xl font-bold text-[#2C3E7B] dark:text-blue-400" data-testid="total-seen-count">
          {getTotalSeen()} species
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">marked as seen</p>
        {getTotalSeen() > 0 && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="mt-3 w-full px-4 py-2 border border-[#2C3E7B] dark:border-blue-500 text-[#2C3E7B] dark:text-blue-400 rounded-lg hover:bg-[#2C3E7B]/10 dark:hover:bg-blue-500/10 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            data-testid="export-csv-button"
          >
            {exporting ? 'Exporting...' : 'Export Life List as CSV'}
          </button>
        )}
      </div>

      {/* App Updates Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">App Updates</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Clear cached data and reload to get the latest version.
        </p>
        <button
          onClick={handleCheckForUpdates}
          disabled={updating}
          className="w-full px-4 py-2 border border-[#2C3E7B] dark:border-blue-500 text-[#2C3E7B] dark:text-blue-400 rounded-lg hover:bg-[#2C3E7B]/10 dark:hover:bg-blue-500/10 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          {updating ? 'Updating...' : 'Check for Updates'}
        </button>
      </div>

      {/* Clear All Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100 mb-2">Reset Data</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
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
