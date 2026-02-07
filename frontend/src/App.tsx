import { useEffect, useState } from 'react'
import './App.css'

interface HealthStatus {
  status: string
  timestamp: string
  version: string
  data_endpoints: string[]
}

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setHealth(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Header */}
      <header className="bg-[#2C3E7B] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🐦</span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Find-A-Lifer</h1>
              <p className="text-sm text-blue-200">Discover your next life bird</p>
            </div>
          </div>
          <div className="text-sm text-blue-200">
            {health ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse"></span>
                Server Connected
              </span>
            ) : loading ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full inline-block animate-pulse"></span>
                Connecting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-400 rounded-full inline-block"></span>
                Disconnected
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Server Status Card */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">
            <span className="text-[#E87722]">&#9881;</span>
            Server Status
          </h2>

          {loading && (
            <div className="flex items-center gap-3 text-gray-500">
              <div className="animate-spin h-5 w-5 border-2 border-[#2C3E7B] border-t-transparent rounded-full"></div>
              <span>Checking server health...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <p className="font-medium">Connection Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {health && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">Status</p>
                  <p className="text-lg font-semibold text-green-800 capitalize">{health.status}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-600 font-medium">Version</p>
                  <p className="text-lg font-semibold text-blue-800">{health.version}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm text-purple-600 font-medium">Timestamp</p>
                  <p className="text-sm font-semibold text-purple-800">
                    {new Date(health.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Data Endpoints */}
              <div>
                <h3 className="text-sm font-semibold text-[#2C3E50] mb-2">Available Data Endpoints</h3>
                {health.data_endpoints.length > 0 ? (
                  <ul className="space-y-1">
                    {health.data_endpoints.map((endpoint, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded px-3 py-2"
                      >
                        <span className="text-green-500 font-bold">&#10003;</span>
                        <code className="bg-gray-200 px-2 py-0.5 rounded text-xs font-mono">{endpoint}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No data endpoints available yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-[#2C3E50] mb-4 flex items-center gap-2">
            <span className="text-[#E87722]">&#128214;</span>
            About Find-A-Lifer
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Find-A-Lifer is an interactive web application that helps birders discover and plan
            trips to find "life birds" — species they've never seen before. By combining eBird
            Status &amp; Trends abundance data with an interactive map, you can explore where target
            species are located by week, assess probability of finding them, compare destinations,
            and plan birding trips.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
