import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLifeList } from '../contexts/LifeListContext'
import { getMyReports, getFriendReports, createTripReport, deleteTripReport, type TripReport } from '../lib/tripReportsService'
import { getFriends } from '../lib/friendsService'
import { fetchSpecies } from '../lib/dataCache'
import TripReportForm from './TripReportForm'
import TripReportCard from './TripReportCard'

export default function TripReportsSection() {
  const { user } = useAuth()
  const { seenSpecies } = useLifeList()
  const [myReports, setMyReports] = useState<TripReport[]>([])
  const [friendReports, setFriendReports] = useState<TripReport[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [speciesNameMap, setSpeciesNameMap] = useState<Map<string, string>>(new Map())
  const [seenSpeciesList, setSeenSpeciesList] = useState<Array<{ code: string; name: string }>>([])

  // Load species data for form
  useEffect(() => {
    fetchSpecies().then(species => {
      const nameMap = new Map(species.map(s => [s.speciesCode, s.comName]))
      setSpeciesNameMap(nameMap)
      const seen = species
        .filter(s => seenSpecies.has(s.speciesCode))
        .map(s => ({ code: s.speciesCode, name: s.comName }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setSeenSpeciesList(seen)
    })
  }, [seenSpecies])

  // Load reports
  useEffect(() => {
    if (!user) return
    setLoading(true)
    const load = async () => {
      try {
        const [mine, friends] = await Promise.all([
          getMyReports(user.uid),
          getFriends(user.uid).then(async (friendList) => {
            const reports: TripReport[] = []
            for (const f of friendList) {
              const fReports = await getFriendReports(f.uid)
              reports.push(...fReports)
            }
            return reports.sort((a, b) => b.date.localeCompare(a.date))
          }),
        ])
        setMyReports(mine)
        setFriendReports(friends)
      } catch (err) {
        console.error('Failed to load trip reports:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  if (!user) return null

  const handleCreate = async (data: Parameters<typeof createTripReport>[2]) => {
    await createTripReport(user.uid, user.displayName || 'Birder', data)
    setShowForm(false)
    // Reload
    const updated = await getMyReports(user.uid)
    setMyReports(updated)
  }

  const handleDelete = async (reportId: string) => {
    if (!window.confirm('Delete this trip report?')) return
    await deleteTripReport(user.uid, reportId)
    setMyReports(prev => prev.filter(r => r.id !== reportId))
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Trip Reports</h4>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs px-2 py-1 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2d5b]"
          >
            + New
          </button>
        )}
      </div>

      {showForm && (
        <TripReportForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          seenSpecies={seenSpeciesList}
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="bg-gray-200 dark:bg-gray-700 rounded" style={{ width: '40%', height: '0.75rem' }} />
                <div className="bg-gray-200 dark:bg-gray-700 rounded" style={{ width: '20%', height: '0.625rem' }} />
              </div>
              <div className="bg-gray-200 dark:bg-gray-700 rounded" style={{ width: '70%', height: '0.625rem' }} />
            </div>
          ))}
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">Loading trip reports...</p>
        </div>
      ) : myReports.length === 0 && friendReports.length === 0 && !showForm ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No trip reports yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Trip reports will appear here after your birding trips</p>
        </div>
      ) : (
        <>
          {myReports.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Your Reports</p>
              {myReports.map(report => (
                <TripReportCard
                  key={report.id}
                  report={report}
                  isOwner={true}
                  onDelete={() => handleDelete(report.id)}
                  speciesNames={speciesNameMap}
                />
              ))}
            </div>
          )}

          {friendReports.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Friends' Reports</p>
              {friendReports.map(report => (
                <TripReportCard
                  key={report.id}
                  report={report}
                  isOwner={false}
                  speciesNames={speciesNameMap}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
