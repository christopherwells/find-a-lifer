/**
 * Compact 52-week frequency sparkline SVG.
 * Shows a small area chart of species reporting frequency across the year.
 */

import { useId } from 'react'

interface SparklineProps {
  /** 52-element array of average reporting frequencies (0-1) */
  data: number[]
  /** Current week number (1-52) for the marker line */
  currentWeek: number
  className?: string
}

export default function Sparkline({ data, currentWeek, className = '' }: SparklineProps) {
  // Unique ID per instance to avoid SVG gradient ID collisions
  const gradId = useId()

  if (data.length === 0) return null

  const width = 160
  const height = 40
  const padding = { top: 2, bottom: 2, left: 1, right: 1 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const maxVal = Math.max(...data, 0.01)

  const points = data.map((val, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + chartH - (val / maxVal) * chartH
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${padding.left} ${padding.top + chartH} Z`

  const weekIdx = Math.min(Math.max(currentWeek - 1, 0), data.length - 1)
  const markerX = padding.left + (weekIdx / (data.length - 1)) * chartW
  const markerFreq = data[weekIdx]

  return (
    <div className={`relative ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Frequency sparkline: peak ${(Math.max(...data) * 100).toFixed(0)}%, week ${currentWeek} is ${(markerFreq * 100).toFixed(0)}%`}
        data-testid="sparkline-svg"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="[stop-color:theme(colors.blue.700)] dark:[stop-color:theme(colors.blue.400)]" stopOpacity={0.3} />
            <stop offset="100%" className="[stop-color:theme(colors.blue.700)] dark:[stop-color:theme(colors.blue.400)]" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          className="stroke-blue-700 dark:stroke-blue-400"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        <line
          x1={markerX} y1={padding.top} x2={markerX} y2={padding.top + chartH}
          className="stroke-red-500"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.7}
        />
        <circle
          cx={markerX}
          cy={padding.top + chartH - (markerFreq / maxVal) * chartH}
          r={2.5}
          className="fill-red-500 stroke-white dark:stroke-gray-900"
          strokeWidth={1}
        />
      </svg>

      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-0.5 px-0.5">
        <span>Jan</span>
        <span className="text-red-500 dark:text-red-400 font-medium">
          Wk {currentWeek}: {(markerFreq * 100).toFixed(0)}%
        </span>
        <span>Dec</span>
      </div>
    </div>
  )
}
