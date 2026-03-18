import { fetchSpecies } from './dataCache'

/**
 * Parse a single CSV line into fields, handling:
 * - Quoted fields containing commas (e.g., "Warbler, Yellow")
 * - Escaped quotes within quoted fields (doubled quotes: "")
 * - Different line endings (\r\n, \r, \n)
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i += 2
        } else {
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

export interface CSVImportResult {
  matched: number
  unmatched: number
  total: number
  newCount: number
  existingCount: number
}

/**
 * Process a CSV file and import matching species into the life list.
 */
export async function processCSVFile(
  file: File,
  importSpeciesList: (codes: string[], names: string[]) => Promise<{ newCount: number; existingCount: number }>
): Promise<CSVImportResult> {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.csv') && !name.endsWith('.txt') && !name.endsWith('.tsv')) {
    throw new Error('Please select a CSV or text file. eBird life lists are downloaded as .csv files.')
  }

  const text = await file.text()
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const header = parseCSVLine(lines[0])
  const comNameIndex = header.findIndex(col => col.toLowerCase().includes('common name'))
  const sciNameIndex = header.findIndex(col => col.toLowerCase().includes('scientific name'))

  if (comNameIndex === -1 && sciNameIndex === -1) {
    throw new Error('CSV file must contain either "Common Name" or "Scientific Name" column')
  }

  const allSpecies = await fetchSpecies() as Array<{
    speciesCode: string
    comName: string
    sciName: string
  }>

  const comNameMap = new Map<string, { code: string; name: string }>()
  const sciNameMap = new Map<string, { code: string; name: string }>()

  allSpecies.forEach(species => {
    comNameMap.set(species.comName.toLowerCase().trim(), { code: species.speciesCode, name: species.comName })
    sciNameMap.set(species.sciName.toLowerCase().trim(), { code: species.speciesCode, name: species.comName })
  })

  const matchedCodes: string[] = []
  const matchedNames: string[] = []
  let unmatchedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)
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

    if (!matched) unmatchedCount++
  }

  let newCount = 0
  let existingCount = 0
  if (matchedCodes.length > 0) {
    const mergeResult = await importSpeciesList(matchedCodes, matchedNames)
    newCount = mergeResult.newCount
    existingCount = mergeResult.existingCount
  }

  return {
    matched: matchedCodes.length,
    unmatched: unmatchedCount,
    total: lines.length - 1,
    newCount,
    existingCount,
  }
}

/**
 * Open a file picker dialog.
 * Uses the modern File System Access API when available, falls back to input element.
 */
export async function openFilePicker(): Promise<File | null> {
  // Try modern File System Access API (Chrome 86+)
  try {
    if ('showOpenFilePicker' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'CSV files',
          accept: { 'text/csv': ['.csv', '.txt', '.tsv'] }
        }],
        multiple: false
      })
      return await handle.getFile()
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    console.error('showOpenFilePicker failed:', err)
  }

  // Fallback for browsers without File System Access API
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.txt,.tsv'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.onchange = () => {
      resolve(input.files?.[0] ?? null)
      document.body.removeChild(input)
    }
    input.addEventListener('cancel', () => {
      resolve(null)
      document.body.removeChild(input)
    })
    input.click()
  })
}
