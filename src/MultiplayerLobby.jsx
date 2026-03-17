import { useEffect, useMemo, useState } from 'react'
import {
  createMultiplayerRoom,
  deleteMultiplayerRoom,
  joinMultiplayerRoom,
  leaveAllMultiplayerRooms,
  leaveMultiplayerRoom,
  listMatchesByRoomIds,
  listRoomPlayersByRoomIds,
  listVisibleMultiplayerRooms,
  setMultiplayerRoomReady,
  startMatchForRoom,
} from './data/multiplayerLobbyRepo'
import { listMultiplayerDeckSummariesByUserIds } from './data/multiplayerDeckRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

export default function MultiplayerLobby({ session, onBackToMenu, onOpenDeckBuilder, onOpenMatch, onLogout }) {
  const [rooms, setRooms] = useState([])
  const [playersByRoomId, setPlayersByRoomId] = useState({})
  const [latestMatchByRoomId, setLatestMatchByRoomId] = useState({})
  const [usernameById, setUsernameById] = useState({})
  const [deckSummaryByUserId, setDeckSummaryByUserId] = useState({})

  const [newRoomName, setNewRoomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadLobby = async () => {
    setLoading(true)
    setError('')

    try {
      const roomRows = await listVisibleMultiplayerRooms()
      setRooms(roomRows)

      const roomIds = roomRows.map((row) => row.id)
      const [playerRows, matchRows] = await Promise.all([
        listRoomPlayersByRoomIds(roomIds),
        listMatchesByRoomIds(roomIds),
      ])

      const groupedPlayers = playerRows.reduce((acc, row) => {
        if (!acc[row.room_id]) acc[row.room_id] = []
        acc[row.room_id].push(row)
        return acc
      }, {})
      setPlayersByRoomId(groupedPlayers)

      const firstMatchByRoom = {}
      for (const row of matchRows) {
        if (!firstMatchByRoom[row.room_id]) firstMatchByRoom[row.room_id] = row
      }
      setLatestMatchByRoomId(firstMatchByRoom)

      const userIds = [...new Set([
        ...roomRows.map((row) => row.created_by).filter(Boolean),
        ...playerRows.map((row) => row.user_id).filter(Boolean),
        ...matchRows.map((row) => row.player1_id).filter(Boolean),
        ...matchRows.map((row) => row.player2_id).filter(Boolean),
        ...matchRows.map((row) => row.current_turn_user_id).filter(Boolean),
        session.userId,
      ])]
      const [usernames, deckSummaries] = await Promise.all([
        listProfileUsernamesByIds(userIds),
        listMultiplayerDeckSummariesByUserIds(userIds),
      ])
      setUsernameById(usernames)
      setDeckSummaryByUserId(deckSummaries)
    } catch (err) {
      setError(err?.message || 'Could not load multiplayer lobby.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLobby()
  }, [session.userId])

  const roomCards = useMemo(() => {
    return rooms.map((room) => {
      const players = playersByRoomId[room.id] || []
      const latestMatch = latestMatchByRoomId[room.id] || null
      const playerIds = players.map((row) => row.user_id)
      const isMember = playerIds.includes(session.userId)
      const currentPlayer = players.find((row) => row.user_id === session.userId) || null
      const currentPlayerDeckCount = deckSummaryByUserId[session.userId]?.count || 0
      const ownerName = usernameById[room.created_by] || room.created_by
      const playerNames = players.map((row) => usernameById[row.user_id] || row.user_id)
      const playerDecksLabel = players
        .map((row) => `${usernameById[row.user_id] || row.user_id} (${deckSummaryByUserId[row.user_id]?.count || 0})`)
        .join(', ')
      const readyCount = players.filter((row) => Boolean(row.is_ready)).length
      const allPlayersReady = players.length === 2 && readyCount === players.length
      const matchPlayersLabel = latestMatch
        ? [latestMatch.player1_id, latestMatch.player2_id]
          .map((id) => usernameById[id] || id)
          .join(' vs ')
        : ''

      return {
        ...room,
        players,
        latestMatch,
        matchPlayersLabel,
        playerNames,
        ownerName,
        isMember,
        currentPlayer,
        playerCount: players.length,
        playerDecksLabel,
        readyCount,
        allPlayersReady,
        currentPlayerDeckCount,
        isCurrentPlayerReady: Boolean(currentPlayer?.is_ready),
        isFull: players.length >= Number(room.max_players || 2),
        canStartMatch: isMember && room.status === 'open' && allPlayersReady,
        hasValidCurrentPlayerDeck: currentPlayerDeckCount >= 3,
      }
    })
  }, [rooms, playersByRoomId, latestMatchByRoomId, usernameById, deckSummaryByUserId, session.userId])

  const createRoom = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const name = String(newRoomName || '').trim()
      if (name.length < 3) throw new Error('Room name must have at least 3 characters.')

      await createMultiplayerRoom(session.userId, {
        name,
        isPrivate: false,
      })

      setNewRoomName('')
      setNotice('Room created successfully.')
      await loadLobby()
    } catch (err) {
      setError(err?.message || 'Could not create room.')
    } finally {
      setSaving(false)
    }
  }

  const handleJoinRoom = async (roomId) => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await joinMultiplayerRoom(roomId)
      setNotice('Room joined.')
      await loadLobby()
    } catch (err) {
      setError(err?.message || 'Could not join room.')
    } finally {
      setSaving(false)
    }
  }

  const handleLeaveRoom = async (roomId) => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await leaveMultiplayerRoom(roomId, session.userId)
      setNotice('Room left.')
      await loadLobby()
    } catch (err) {
      setError(err?.message || 'Could not leave room.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleReady = async (roomId, nextReady) => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await setMultiplayerRoomReady(roomId, nextReady)
      setNotice(result?.message || (nextReady ? 'Player marked as ready.' : 'Player is no longer ready.'))
      await loadLobby()
    } catch (err) {
      setError(err?.message || 'Could not update ready state.')
    } finally {
      setSaving(false)
    }
  }

  const handleStartMatch = async (roomId) => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await startMatchForRoom(roomId, 75)
      if (!result?.match_id) throw new Error(result?.message || 'Could not start match.')
      setNotice(`Match created: ${result.match_id}`)
      await loadLobby()
    } catch (err) {
      setError(err?.message || 'Could not start match.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRoom = async (roomId) => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await deleteMultiplayerRoom(roomId, session.userId)
      setNotice('Room deleted successfully.')
      await loadLobby()
    } catch (err) {
      setError(err?.message || 'Could not delete room.')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await leaveAllMultiplayerRooms()
      onBackToMenu()
    } catch (err) {
      setError(err?.message || 'Could not leave joined rooms before exiting multiplayer.')
      setSaving(false)
    }
  }

  const handleExitSession = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await leaveAllMultiplayerRooms()
      onLogout()
    } catch (err) {
      setError(err?.message || 'Could not leave joined rooms before logging out.')
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Multiplayer Lobby</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={handleBack} disabled={saving}>
            Back to Modes
          </button>
          <button type="button" className="btn session-logout" onClick={handleExitSession} disabled={saving}>
            Log out
          </button>
        </div>
      </div>

      <div className="competitive-layout">
        <div className="panel">
          <div className="saved-title">Create Room</div>
          <div className="saved-empty">Phase 2: rooms can now initialize match snapshots from approved constructs.</div>
          <div className="saved-empty">A player stays in an open room only while remaining inside the multiplayer menu.</div>
          <div className="saved-empty">A match can start only when both players confirm they are ready.</div>
          <div className="saved-empty">
            Your multiplayer deck: {deckSummaryByUserId[session.userId]?.count || 0} construct(s).
            {(deckSummaryByUserId[session.userId]?.count || 0) >= 3 ? ' Ready to queue.' : ' Add at least 3 before marking ready.'}
          </div>

          <label className="field">
            <span>Room Name</span>
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Example: Algebra Sprint #1"
            />
          </label>

          <div className="saved-item-actions">
            <button type="button" className="btn" onClick={createRoom} disabled={saving}>
              {saving ? 'Processing...' : 'Create Public Room'}
            </button>
            <button type="button" className="btn" onClick={onOpenDeckBuilder} disabled={saving}>
              Manage Deck
            </button>
            <button type="button" className="btn" onClick={loadLobby} disabled={loading || saving}>
              {loading ? 'Refreshing...' : 'Refresh Lobby'}
            </button>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}
        </div>

        <div className="assets-panel">
          <div className="saved-title">Available Rooms</div>
          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading rooms...</div>}
            {!loading && roomCards.length === 0 && <div className="saved-empty">No rooms available yet.</div>}

            {!loading && roomCards.map((room) => (
              <div key={room.id} className="saved-item">
                <div className="saved-item-name">{room.name}</div>
                <div className="saved-item-date">Owner: {room.ownerName}</div>
                <div className="saved-item-date">Updated: {formatDate(room.updated_at)}</div>
                <div className="saved-item-tags">Status: {room.status}</div>
                <div className="saved-item-tags">Players: {room.playerCount} / {room.max_players}</div>
                <div className="saved-item-tags">Members: {room.playerNames.join(', ') || 'None'}</div>
                {room.players.length > 0 && <div className="saved-item-tags">Decks: {room.playerDecksLabel}</div>}
                {room.status === 'open' && <div className="saved-item-tags">Ready: {room.readyCount} / 2</div>}
                {room.isMember && room.status === 'open' && !room.hasValidCurrentPlayerDeck && (
                  <div className="saved-item-tags">Your deck needs at least 3 approved constructs before you can ready up.</div>
                )}

                {room.players.length > 0 && room.status === 'open' && (
                  <div className="saved-item-tags">
                    Ready players: {room.players.map((player) => `${usernameById[player.user_id] || player.user_id}${player.is_ready ? ' (ready)' : ''}`).join(', ')}
                  </div>
                )}

                {room.latestMatch && (
                  <>
                    <div className="saved-item-tags">Latest match: {room.latestMatch.id}</div>
                    <div className="saved-item-tags">Duel: {room.matchPlayersLabel}</div>
                    <div className="saved-item-tags">Turn: {usernameById[room.latestMatch.current_turn_user_id] || room.latestMatch.current_turn_user_id}</div>
                    <div className="saved-item-tags">Deadline: {formatDate(room.latestMatch.turn_deadline_at)}</div>
                  </>
                )}

                <div className="saved-item-actions">
                  {!room.isMember && room.status === 'open' && !room.isFull && (
                    <button type="button" className="btn" onClick={() => handleJoinRoom(room.id)} disabled={saving}>
                      Join Room
                    </button>
                  )}

                  {room.isMember && room.status === 'open' && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleToggleReady(room.id, !room.isCurrentPlayerReady)}
                      disabled={saving || !room.hasValidCurrentPlayerDeck}
                    >
                      {room.isCurrentPlayerReady ? 'Cancel Ready' : 'Ready'}
                    </button>
                  )}

                  {room.isMember && (
                    <button type="button" className="btn danger" onClick={() => handleLeaveRoom(room.id)} disabled={saving}>
                      Leave Room
                    </button>
                  )}

                  {room.canStartMatch && (
                    <button type="button" className="btn" onClick={() => handleStartMatch(room.id)} disabled={saving}>
                      Start Match
                    </button>
                  )}

                  {room.created_by === session.userId && (
                    <button type="button" className="btn danger" onClick={() => handleDeleteRoom(room.id)} disabled={saving}>
                      Delete Room
                    </button>
                  )}

                  {room.latestMatch && (
                    <button type="button" className="btn" onClick={() => onOpenMatch?.(room.latestMatch.id)} disabled={saving}>
                      Open Match
                    </button>
                  )}

                  {room.isMember && room.status === 'open' && !room.canStartMatch && room.playerCount === 2 && (
                    <button type="button" className="btn" disabled>
                      Waiting for Both Ready
                    </button>
                  )}

                  {room.isMember && room.status === 'open' && !room.hasValidCurrentPlayerDeck && (
                    <button type="button" className="btn" onClick={onOpenDeckBuilder} disabled={saving}>
                      Build Deck
                    </button>
                  )}

                  {!room.isMember && room.status === 'open' && room.isFull && (
                    <button type="button" className="btn" disabled>
                      Full
                    </button>
                  )}

                  {!room.isMember && room.status === 'in_match' && (
                    <button type="button" className="btn" disabled>
                      In Match
                    </button>
                  )}

                  {!room.isMember && room.status === 'closed' && (
                    <button type="button" className="btn" disabled>
                      Closed
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}



