import { useState } from 'react'
import type { TripReport } from '../lib/tripReportsService'

interface TripReportCardProps {
  report: TripReport
  isOwner: boolean
  onDelete?: () => void
  speciesNames?: Map<string, string> // code → comName
}

export default function TripReportCard({ report, isOwner, onDelete, speciesNames }: TripReportCardProps) {
  const [expanded, setExpanded] = useState(false)

  const formattedDate = (() => {
    try {
      return new Date(report.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return report.date
    }
  })()

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">{report.title}</h5>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formattedDate} · {report.location.name}
            {!isOwner && report.ownerName && <> · by {report.ownerName}</>}
          </p>
        </div>
        {isOwner && onDelete && (
          <button
            onClick={onDelete}
            className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0"
            title="Delete report"
          >
            ✕
          </button>
        )}
      </div>

      {report.highlights && (
        <p className="text-xs text-gray-600 dark:text-gray-400">{report.highlights}</p>
      )}

      {report.speciesCodes.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[#2C3E7B] dark:text-blue-400 hover:underline"
          >
            {expanded ? 'Hide' : 'Show'} {report.speciesCodes.length} species
          </button>
          {expanded && (
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 columns-2 gap-2">
              {report.speciesCodes.map(code => (
                <p key={code} className="leading-relaxed">{speciesNames?.get(code) || code}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {report.isPublic && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
          Public
        </span>
      )}
    </div>
  )
}
