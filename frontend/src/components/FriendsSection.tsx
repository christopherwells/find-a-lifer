import { useState, useEffect } from 'react'
import { useAuth, getFriendCode, findUserByFriendCode } from '../contexts/AuthContext'
import { getFriends, getPendingRequests, sendFriendRequest, acceptRequest, rejectRequest, removeFriend, type Friend, type FriendRequest } from '../lib/friendsService'

export default function FriendsSection() {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null)
  const [addCode, setAddCode] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const [f, r, code] = await Promise.all([
          getFriends(user.uid),
          getPendingRequests(user.uid),
          getFriendCode(user.uid),
        ])
        setFriends(f)
        setPendingRequests(r)
        setMyFriendCode(code)
      } catch (err) {
        console.error('Failed to load friends:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  if (!user) return null

  const handleSendRequest = async () => {
    if (!addCode.trim()) return
    setAddError(null)
    setAddSuccess(null)
    try {
      const found = await findUserByFriendCode(addCode.trim())
      if (!found) {
        setAddError('No user found with that code')
        return
      }
      if (found.uid === user.uid) {
        setAddError("That's your own code!")
        return
      }
      await sendFriendRequest(user.uid, user.displayName || 'Birder', found.uid)
      setAddSuccess(`Request sent to ${found.displayName}!`)
      setAddCode('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to send request')
    }
  }

  const handleAccept = async (req: FriendRequest) => {
    try {
      await acceptRequest(req.id, user.uid, user.displayName || 'Birder')
      setPendingRequests(prev => prev.filter(r => r.id !== req.id))
      setFriends(prev => [...prev, { uid: req.fromUid, displayName: req.fromName, since: new Date().toISOString() }])
    } catch (err) {
      console.error('Failed to accept request:', err)
    }
  }

  const handleReject = async (req: FriendRequest) => {
    try {
      await rejectRequest(req.id)
      setPendingRequests(prev => prev.filter(r => r.id !== req.id))
    } catch (err) {
      console.error('Failed to reject request:', err)
    }
  }

  const handleRemoveFriend = async (friend: Friend) => {
    if (!window.confirm(`Remove ${friend.displayName} from friends?`)) return
    try {
      await removeFriend(user.uid, friend.uid)
      setFriends(prev => prev.filter(f => f.uid !== friend.uid))
    } catch (err) {
      console.error('Failed to remove friend:', err)
    }
  }

  const handleCopyCode = () => {
    if (myFriendCode) {
      navigator.clipboard.writeText(myFriendCode)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Friends</h4>

      {/* My friend code */}
      {myFriendCode && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Your code:</span>
          <code className="px-2 py-0.5 text-sm font-mono font-bold bg-gray-100 dark:bg-gray-700 rounded text-[#2C3E7B] dark:text-blue-400">
            {myFriendCode}
          </code>
          <button
            onClick={handleCopyCode}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Copy code"
          >
            Copy
          </button>
        </div>
      )}

      {/* Add friend */}
      <div className="flex gap-2">
        <input
          type="text"
          value={addCode}
          onChange={(e) => setAddCode(e.target.value.toUpperCase())}
          placeholder="Enter friend code"
          maxLength={6}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono uppercase"
        />
        <button
          onClick={handleSendRequest}
          disabled={addCode.length !== 6}
          className="px-3 py-1.5 text-sm bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
      {addSuccess && <p className="text-xs text-green-600 dark:text-green-400">{addSuccess}</p>}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Pending Requests</p>
          {pendingRequests.map((req) => (
            <div key={req.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-gray-700 dark:text-gray-300">{req.fromName}</span>
              <button onClick={() => handleAccept(req)} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">Accept</button>
              <button onClick={() => handleReject(req)} className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">Decline</button>
            </div>
          ))}
        </div>
      )}

      {/* Friends list */}
      {friends.length > 0 ? (
        <div className="space-y-1.5">
          {friends.map((friend) => (
            <div key={friend.uid} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-gray-700 dark:text-gray-300">{friend.displayName}</span>
              <button
                onClick={() => handleRemoveFriend(friend)}
                className="text-gray-400 hover:text-red-500"
                title="Remove friend"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No friends yet. Share your code to connect!
        </p>
      )}
    </div>
  )
}
