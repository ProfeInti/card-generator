import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMultiplayerMatch,
  getMultiplayerRoom,
  listMatchConstructs,
  listMatchStepsByConstructIds,
  listRoomPlayersByRoomIds,
} from './data/multiplayerLobbyRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function formatCountdown(deadline) {
  if (!deadline) return 'No deadline'
  const remainingMs = new Date(deadline).getTime() - Date.now()
  if (!Number.isFinite(remainingMs)) return 'No deadline'
  if (remainingMs <= 0) return '0s'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const nextKey = item?.[key]
    if (!nextKey) return acc
    if (!acc[nextKey]) acc[nextKey] = []
    acc[nextKey].push(item)
    return acc
  }, {})
}

export default function MultiplayerMatch({ session, matchId, onBackToLobby, onLogout }) {
  const [match, setMatch] = useState(null)
  const [room, setRoom] = useState(null)
  const [playersByRoomId, setPlayersByRoomId] = useState({})
  const [constructs, setConstructs] = useState([])
  const [stepsByConstructId, setStepsByConstructId] = useState({})
  const [usernameById, setUsernameById] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [countdownLabel, setCountdownLabel] = useState('')

  const loadMatch = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      if (!matchId) throw new Error('Match not found.')
      const matchRow = await getMultiplayerMatch(matchId)
      const roomRow = await getMultiplayerRoom(matchRow.room_id)
      const [playerRows, constructRows] = await Promise.all([
        listRoomPlayersByRoomIds([matchRow.room_id]),
        listMatchConstructs(matchId),
      ])

      const constructIds = constructRows.map((row) => row.id)
      const stepRows = await listMatchStepsByConstructIds(constructIds)
      const users = [...new Set([
        roomRow.created_by,
        matchRow.player1_id,
        matchRow.player2_id,
        matchRow.current_turn_user_id,
        ...playerRows.map((row) => row.user_id),
        ...constructRows.map((row) => row.owner_user_id),
      ].filter(Boolean))]
      const usernames = await listProfileUsernamesByIds(users)

      setMatch(matchRow)
      setRoom(roomRow)
      setPlayersByRoomId(groupBy(playerRows, 'room_id'))
      setConstructs(constructRows)
      setStepsByConstructId(groupBy(stepRows, 'match_construct_id'))
      setUsernameById(usernames)
      setNotice('Match snapshot loaded.')
    } catch (err) {
      setError(err?.message || 'Could not load multiplayer match.')
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    loadMatch()
  }, [loadMatch])

  useEffect(() => {
    setCountdownLabel(formatCountdown(match?.turn_deadline_at))
    if (!match?.turn_deadline_at) return undefined

    const intervalId = window.setInterval(() => {
      setCountdownLabel(formatCountdown(match.turn_deadline_at))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [match?.turn_deadline_at])

  const players = useMemo(() => {
    if (!match) return []
    return [match.player1_id, match.player2_id].filter(Boolean)
  }, [match])

  const constructsByOwner = useMemo(() => groupBy(constructs, 'owner_user_id'), [constructs])

  const roomPlayers = playersByRoomId[room?.id] || []

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Multiplayer Match</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onBackToLobby}>
            Back to Lobby
          </button>
          <button type="button" className="btn session-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="competitive-layout">
        <div className="panel">
          <div className="saved-title">Match Overview</div>
          {loading && <div className="saved-empty">Loading match...</div>}
          {!loading && error && <div className="auth-error">{error}</div>}
          {!loading && !error && notice && <div className="saved-empty">{notice}</div>}

          {!loading && !error && match && room && (
            <>
              <div className="saved-item-tags">Room: {room.name}</div>
              <div className="saved-item-tags">Match ID: {match.id}</div>
              <div className="saved-item-tags">Status: {match.status}</div>
              <div className="saved-item-tags">Turn: {usernameById[match.current_turn_user_id] || match.current_turn_user_id}</div>
              <div className="saved-item-tags">Countdown: {countdownLabel}</div>
              <div className="saved-item-tags">Deadline: {formatDate(match.turn_deadline_at)}</div>
              <div className="saved-item-tags">Created: {formatDate(match.created_at)}</div>
              <div className="saved-item-tags">Room members now: {roomPlayers.map((row) => usernameById[row.user_id] || row.user_id).join(', ') || 'None'}</div>
            </>
          )}
        </div>

        <div className="assets-panel">
          <div className="saved-title">Battlefield Snapshot</div>
          {!loading && !error && players.length === 0 && <div className="saved-empty">No players loaded for this match.</div>}

          {!loading && !error && players.map((playerId) => {
            const playerConstructs = [...(constructsByOwner[playerId] || [])].sort((a, b) => a.slot_index - b.slot_index)
            const isCurrentTurn = match?.current_turn_user_id === playerId

            return (
              <div key={playerId} className="saved-item" style={{ marginBottom: 16 }}>
                <div className="saved-item-name">{usernameById[playerId] || playerId}</div>
                <div className="saved-item-tags">{isCurrentTurn ? 'Current turn' : 'Waiting'}</div>
                <div className="saved-item-tags">Constructs: {playerConstructs.length}</div>

                {playerConstructs.length === 0 && <div className="saved-empty">No constructs copied into this snapshot.</div>}

                {playerConstructs.map((construct) => {
                  const steps = [...(stepsByConstructId[construct.id] || [])].sort((a, b) => a.step_order - b.step_order)

                  return (
                    <div key={construct.id} className="collection-toolbar" style={{ marginTop: 10 }}>
                      <div className="saved-title">Slot {construct.slot_index}: {construct.title}</div>
                      <div className="saved-item-tags">ATK / ARM: {construct.attack ?? 0} / {construct.armor ?? 0}</div>
                      <div className="saved-item-tags">Stability: {construct.stability_remaining} / {construct.stability_total}</div>
                      <div className="saved-item-tags">Path: {construct.selected_solution_path}</div>
                      {construct.effects && <div className="saved-item-tags">Effects: {construct.effects}</div>}
                      {construct.description && <div className="saved-empty">{construct.description}</div>}

                      <div className="saved-title" style={{ marginTop: 8 }}>Deconstruction Steps</div>
                      {steps.length === 0 && <div className="saved-empty">No steps in snapshot.</div>}

                      {steps.map((step) => (
                        <div key={step.id} className="saved-item" style={{ marginTop: 8 }}>
                          <div className="saved-item-tags">Step {step.step_order} | Path: {step.solution_path}</div>
                          <div className="rt-editor" style={{ minHeight: 80 }}>
                            <div
                              className="card-description"
                              dangerouslySetInnerHTML={{ __html: renderMathInHtml(normalizeMathHtmlInput(step.progress_state || '')) }}
                            />
                          </div>
                          {step.explanation && <div className="saved-empty">{step.explanation}</div>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}




