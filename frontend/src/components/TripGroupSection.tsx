import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLifeList } from '../contexts/LifeListContext'
import { getFriends, type Friend } from '../lib/friendsService'
import {
  createTrip, getUserTrips, getTripMembers, getTrip,
  inviteToTrip, getPendingTripInvites, acceptTripInvite, declineTripInvite,
  syncMemberList, leaveTrip, removeTripMember, deleteTrip,
  type Trip, type TripMember, type TripInvite,
} from '../lib/tripService'
import { trackEvent } from '../lib/analytics'

export default function TripGroupSection() {
  const { user } = useAuth()
  const { seenSpecies, setTripUnion, setActiveTripName, setActiveTripMemberCount, setTripMemberLists } = useLifeList()

  const [trips, setTrips] = useState<Trip[]>([])
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<TripMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<TripInvite[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [newTripName, setNewTripName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTripIdRef = useRef<string | null>(null)

  // Load trips and invites on mount
  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const [t, inv] = await Promise.all([
          getUserTrips(user.uid),
          getPendingTripInvites(user.uid),
        ])
        setTrips(t)
        setPendingInvites(inv)

        // Restore active trip from localStorage
        const savedTripId = localStorage.getItem('activeTripId')
        if (savedTripId) {
          const saved = t.find(trip => trip.id === savedTripId)
          if (saved) {
            activateTrip(saved)
          } else {
            localStorage.removeItem('activeTripId')
          }
        }
      } catch (err) {
        console.error('Failed to load trips:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const activateTrip = useCallback(async (trip: Trip) => {
    setActiveTrip(trip)
    activeTripIdRef.current = trip.id
    localStorage.setItem('activeTripId', trip.id)
    try {
      const m = await getTripMembers(trip.id)
      setMembers(m)
      // Compute union of all members' species codes
      const union = new Set<string>()
      for (const member of m) {
        for (const code of member.speciesCodes) {
          union.add(code)
        }
      }
      setTripUnion(union)
      setActiveTripName(trip.name)
      setActiveTripMemberCount(m.length)
      // Store individual member lists for group optimization strategies
      setTripMemberLists(m.map(member => ({
        name: member.displayName,
        codes: new Set(member.speciesCodes),
      })))
    } catch (err) {
      console.error('Failed to load trip members:', err)
    }
  }, [setTripUnion, setActiveTripName, setActiveTripMemberCount, setTripMemberLists])

  const deactivateTrip = useCallback(() => {
    setActiveTrip(null)
    activeTripIdRef.current = null
    setMembers([])
    setTripUnion(null)
    setActiveTripName(null)
    setActiveTripMemberCount(0)
    setTripMemberLists(null)
    localStorage.removeItem('activeTripId')
  }, [setTripUnion, setActiveTripName, setActiveTripMemberCount, setTripMemberLists])

  // Auto-sync life list to Firestore when it changes while a trip is active
  useEffect(() => {
    if (!user || !activeTripIdRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      const tripId = activeTripIdRef.current
      if (!tripId) return
      try {
        await syncMemberList(tripId, user.uid, Array.from(seenSpecies))
        // Recompute union
        const m = await getTripMembers(tripId)
        setMembers(m)
        const union = new Set<string>()
        for (const member of m) {
          for (const code of member.speciesCodes) union.add(code)
        }
        setTripUnion(union)
        setActiveTripMemberCount(m.length)
      } catch (err) {
        console.error('Failed to sync list:', err)
      }
    }, 2000)
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [seenSpecies, user, setTripUnion, setActiveTripMemberCount])

  if (!user) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-3">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Sign in to plan group trips with friends
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
        <div className="flex items-center justify-center py-2">
          <div className="h-5 w-5 border-2 border-[#2C3E7B] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const handleCreateTrip = async () => {
    if (!newTripName.trim()) return
    setError(null)
    try {
      const tripId = await createTrip(
        user.uid, user.displayName || 'Birder', newTripName.trim(), Array.from(seenSpecies)
      )
      trackEvent('create_trip', { member_count: 1 })
      const trip = await getTrip(tripId)
      if (trip) {
        setTrips(prev => [...prev, trip])
        activateTrip(trip)
      }
      setCreating(false)
      setNewTripName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip')
    }
  }

  const handleAcceptInvite = async (invite: TripInvite) => {
    setError(null)
    try {
      await acceptTripInvite(
        invite.id, invite.tripId, user.uid, user.displayName || 'Birder', Array.from(seenSpecies)
      )
      trackEvent('accept_trip_invite')
      setPendingInvites(prev => prev.filter(i => i.id !== invite.id))
      const trip = await getTrip(invite.tripId)
      if (trip) {
        setTrips(prev => [...prev, trip])
        activateTrip(trip)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite')
    }
  }

  const handleDeclineInvite = async (invite: TripInvite) => {
    try {
      await declineTripInvite(invite.id)
      setPendingInvites(prev => prev.filter(i => i.id !== invite.id))
    } catch (err) {
      console.error('Failed to decline invite:', err)
    }
  }

  const handleInviteFriend = async (friend: Friend) => {
    if (!activeTrip) return
    setError(null)
    try {
      await inviteToTrip(
        activeTrip.id, activeTrip.name, user.uid, user.displayName || 'Birder', friend.uid
      )
      trackEvent('invite_to_trip')
      setInviting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite friend')
    }
  }

  const handleLeaveTrip = async () => {
    if (!activeTrip) return
    if (!window.confirm('Leave this trip?')) return
    try {
      if (activeTrip.ownerUid === user.uid) {
        if (!window.confirm('You are the trip owner. This will delete the trip for everyone. Continue?')) return
        await deleteTrip(activeTrip.id, user.uid)
      } else {
        await leaveTrip(activeTrip.id, user.uid)
      }
      setTrips(prev => prev.filter(t => t.id !== activeTrip.id))
      deactivateTrip()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave trip')
    }
  }

  const handleRemoveMember = async (member: TripMember) => {
    if (!activeTrip) return
    if (!window.confirm(`Remove ${member.displayName} from the trip?`)) return
    try {
      await removeTripMember(activeTrip.id, user.uid, member.uid)
      // Refresh members and union
      activateTrip(activeTrip)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleSyncList = async () => {
    if (!activeTrip) return
    try {
      await syncMemberList(activeTrip.id, user.uid, Array.from(seenSpecies))
      activateTrip(activeTrip)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync list')
    }
  }

  const loadFriendsForInvite = async () => {
    try {
      const f = await getFriends(user.uid)
      setFriends(f)
      setInviting(true)
    } catch (err) {
      console.error('Failed to load friends:', err)
    }
  }

  // Active trip view
  if (activeTrip) {
    const isOwner = activeTrip.ownerUid === user.uid
    return (
      <div className="bg-white dark:bg-gray-800 border border-[#2C3E7B]/30 dark:border-blue-700/40 rounded-lg p-3 mb-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-[#2C3E7B] dark:text-blue-400 uppercase tracking-wider">Trip</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{activeTrip.name}</span>
          </div>
          <button
            onClick={deactivateTrip}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap"
          >
            Exit Trip
          </button>
        </div>

        {/* Members */}
        <div className="space-y-1">
          {members.map(m => (
            <div key={m.uid} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[#2C3E7B]/10 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-bold text-[#2C3E7B] dark:text-blue-400">
                  {m.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-700 dark:text-gray-300">{m.displayName}</span>
                <span className="text-gray-400 dark:text-gray-400">({m.speciesCodes.length})</span>
              </div>
              {isOwner && m.uid !== user.uid && (
                <button
                  onClick={() => handleRemoveMember(m)}
                  className="text-gray-400 hover:text-red-500"
                  title="Remove member"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {activeTrip.memberUids.length < 6 && (
            <button
              onClick={loadFriendsForInvite}
              className="text-xs px-2.5 py-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2d5b] min-h-[32px]"
            >
              Invite Friend
            </button>
          )}
          <button
            onClick={handleSyncList}
            className="text-xs px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[32px]"
          >
            Sync List
          </button>
          <button
            onClick={handleLeaveTrip}
            className="text-xs px-2.5 py-1.5 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 min-h-[32px]"
          >
            {isOwner ? 'Delete Trip' : 'Leave Trip'}
          </button>
        </div>

        {/* Invite friend picker */}
        {inviting && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Invite a friend</span>
              <button onClick={() => setInviting(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
            {friends.filter(f => !activeTrip.memberUids.includes(f.uid)).length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No friends available to invite</p>
            ) : (
              friends
                .filter(f => !activeTrip.memberUids.includes(f.uid))
                .map(f => (
                  <button
                    key={f.uid}
                    onClick={() => handleInviteFriend(f)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 min-h-[32px]"
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300">
                      {f.displayName.charAt(0).toUpperCase()}
                    </div>
                    {f.displayName}
                  </button>
                ))
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    )
  }

  // No active trip view
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[#2C3E7B] dark:text-blue-400 uppercase tracking-wider">Group Trip</h4>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs px-2.5 py-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2d5b] min-h-[32px]"
          >
            Create Trip
          </button>
        )}
      </div>

      {/* Create trip form */}
      {creating && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newTripName}
            onChange={e => setNewTripName(e.target.value)}
            placeholder="Trip name (e.g., Costa Rica March)"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            onKeyDown={e => e.key === 'Enter' && handleCreateTrip()}
            autoFocus
          />
          <button
            onClick={handleCreateTrip}
            disabled={!newTripName.trim()}
            className="px-3 py-1.5 text-sm bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50"
          >
            Create
          </button>
          <button
            onClick={() => { setCreating(false); setNewTripName('') }}
            className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Pending trip invites */}
      {pendingInvites.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Trip Invites</p>
          {pendingInvites.map(inv => (
            <div key={inv.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">
                {inv.fromName} invited you to <strong>{inv.tripName}</strong>
              </span>
              <button
                onClick={() => handleAcceptInvite(inv)}
                className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded min-h-[28px]"
              >
                Join
              </button>
              <button
                onClick={() => handleDeclineInvite(inv)}
                className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded min-h-[28px]"
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Existing trips */}
      {trips.length > 0 && (
        <div className="space-y-1">
          {trips.map(trip => (
            <button
              key={trip.id}
              onClick={() => activateTrip(trip)}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[36px]"
            >
              <span className="text-gray-800 dark:text-gray-200 font-medium truncate">{trip.name}</span>
              <span className="text-gray-400 dark:text-gray-400 whitespace-nowrap ml-2">
                {trip.memberUids.length} {trip.memberUids.length === 1 ? 'member' : 'members'}
              </span>
            </button>
          ))}
        </div>
      )}

      {trips.length === 0 && pendingInvites.length === 0 && !creating && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Plan a birding trip with friends. The map shows species none of you have seen.
        </p>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
