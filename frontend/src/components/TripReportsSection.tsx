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

      {loading && (
        <div className="text-xs text-gray-500 dark:text-gray-400">Loading reports...</div>
      )}

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

      {!loading && myReports.length === 0 && friendReports.length === 0 && !showForm && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No trip reports yet. Document your birding trips!
        </p>
      )}
    </div>
  )
}
