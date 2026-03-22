import { useEffect, useRef, useState } from 'react'
import { downloadJsonFile, parseJsonFile } from './lib/competitiveJson'
import {
  cloneWhiteboardWorkspace,
  deleteWhiteboardWorkspace,
  deleteWhiteboardWorkspaceByExercise,
  ensureRootWhiteboardWorkspace,
  getWhiteboardWorkspaceById,
  listPublicWhiteboardWorkspaces,
  listWhiteboardWorkspaces,
} from './data/whiteboardWorkspaceRepo'
import {
  buildEmptyWhiteboardExercise,
  deleteWhiteboardExercise,
  listWhiteboardExercises,
  saveWhiteboardExercise,
  saveWorkspace,
  setActiveWhiteboardExerciseId,
  setActiveWhiteboardWorkspaceId,
} from './lib/whiteboardPrototype'
import {
  buildWhiteboardWorkspaceExportJson,
  buildWhiteboardWorkspaceTemplateJson,
  extractWhiteboardWorkspaceFromJson,
} from './lib/whiteboardWorkspaceJson'

export default function WhiteboardModeHub({ onOpenBoard, onOpenExercises, onBackToMenu, session }) {
  const [exercises, setExercises] = useState(() => listWhiteboardExercises())
  const [workspaces, setWorkspaces] = useState([])
  const [publicWorkspaces, setPublicWorkspaces] = useState([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const importFileRef = useRef(null)

  const loadWorkspaces = async (cancelled = false) => {
    if (!session?.userId) {
      setWorkspaces([])
      setPublicWorkspaces([])
      return
    }

    try {
      setLoadingWorkspaces(true)
      setWorkspaceError('')
      const [ownRows, publicRows] = await Promise.all([
        listWhiteboardWorkspaces(session.userId),
        listPublicWhiteboardWorkspaces(),
      ])
      if (cancelled) return
      setWorkspaces(Array.isArray(ownRows) ? ownRows : [])
      setPublicWorkspaces(
        (Array.isArray(publicRows) ? publicRows : []).filter((row) => row.owner_user_id !== session.userId)
      )
    } catch (error) {
      if (cancelled) return
      setWorkspaces([])
      setPublicWorkspaces([])
      setWorkspaceError(error?.message || 'Could not load collaborative whiteboards.')
    } finally {
      if (!cancelled) setLoadingWorkspaces(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setExercises(listWhiteboardExercises())
    loadWorkspaces(cancelled)
    return () => {
      cancelled = true
    }
  }, [session?.userId])

  const handleDeleteWorkspace = async (workspaceId) => {
    if (!session?.userId || !workspaceId) return
    try {
      setWorkspaceError('')
      await deleteWhiteboardWorkspace(workspaceId, session.userId)
      setActiveWhiteboardWorkspaceId('')
      await loadWorkspaces(false)
    } catch (error) {
      setWorkspaceError(error?.message || 'Could not delete the whiteboard.')
    }
  }

  const handleDeleteExercise = async (exerciseId) => {
    if (!exerciseId) return

    try {
      setWorkspaceError('')
      deleteWhiteboardExercise(exerciseId)
      if (session?.userId) {
        await deleteWhiteboardWorkspaceByExercise(session.userId, exerciseId)
        await loadWorkspaces(false)
      }
      setExercises(listWhiteboardExercises())
      setActiveWhiteboardExerciseId('')
      setActiveWhiteboardWorkspaceId('')
    } catch (error) {
      setWorkspaceError(error?.message || 'Could not delete the whiteboard exercise.')
    }
  }

  const handleDownloadWorkspace = async (workspaceId) => {
    if (!workspaceId) return
    try {
      setWorkspaceError('')
      const workspace = await getWhiteboardWorkspaceById(workspaceId)
      if (!workspace) throw new Error('Could not load the whiteboard to export.')
      downloadJsonFile(
        'inticore-whiteboard-workspace.json',
        buildWhiteboardWorkspaceExportJson({
          workspace,
          exercise: workspace.exercise_snapshot,
          exportedByUserId: session?.userId || '',
        })
      )
    } catch (error) {
      setWorkspaceError(error?.message || 'Could not export the whiteboard.')
    }
  }

  const handleImportWorkspace = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setWorkspaceError('')
      const json = await parseJsonFile(file)
      const imported = extractWhiteboardWorkspaceFromJson(json)
      if (!imported) {
        throw new Error('The file does not contain a valid whiteboard workspace.')
      }

      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...imported.exercise,
        id: null,
      })
      saveWorkspace(savedExercise.id, {
        nodes: imported.nodes,
        links: imported.links,
      })
      setExercises(listWhiteboardExercises())
      setActiveWhiteboardExerciseId(savedExercise.id)
      setActiveWhiteboardWorkspaceId('')

      if (session?.userId) {
        const clonedWorkspace = await ensureRootWhiteboardWorkspace({
          ownerUserId: session.userId,
          exerciseLocalId: savedExercise.id,
          exerciseTitle: imported.title || savedExercise.title || 'Math Whiteboard',
          exerciseSnapshot: { ...savedExercise },
          nodes: imported.nodes,
          links: imported.links,
          visibility: 'public',
          lastEditorUserId: session.userId,
        })
        setActiveWhiteboardWorkspaceId(clonedWorkspace.id)
      }

      onOpenBoard()
    } catch (error) {
      setWorkspaceError(error?.message || 'Could not import the whiteboard file.')
    }
  }

  const handleSaveMyCopy = async (workspaceId) => {
    if (!session?.userId || !workspaceId) return

    try {
      setWorkspaceError('')
      const sourceWorkspace = await getWhiteboardWorkspaceById(workspaceId)
      if (!sourceWorkspace) throw new Error('Could not load the public whiteboard.')

      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...(sourceWorkspace.exercise_snapshot || {}),
        id: null,
      })

      saveWorkspace(savedExercise.id, {
        nodes: sourceWorkspace.nodes || [],
        links: sourceWorkspace.links || [],
      })
      setExercises(listWhiteboardExercises())

      const clonedWorkspace = await cloneWhiteboardWorkspace({
        ownerUserId: session.userId,
        sourceWorkspaceId: sourceWorkspace.id,
        exerciseLocalId: savedExercise.id,
        exerciseTitle: sourceWorkspace.exercise_title || savedExercise.title || 'Math Whiteboard',
        exerciseSnapshot: { ...savedExercise },
        nodes: sourceWorkspace.nodes || [],
        links: sourceWorkspace.links || [],
        visibility: 'private',
        lastEditorUserId: session.userId,
      })

      setActiveWhiteboardExerciseId(savedExercise.id)
      setActiveWhiteboardWorkspaceId(clonedWorkspace.id)
      await loadWorkspaces(false)
      onOpenBoard()
    } catch (error) {
      setWorkspaceError(error?.message || 'Could not save your copy of this whiteboard.')
    }
  }

  return (
    <div className="page wb-page">
      <div className="menu-shell">
        <div className="menu-card">
          <div className="menu-top">
            <h1 className="menu-title">Math Whiteboard</h1>
          </div>
          <p className="menu-subtitle">Select an exercise first to open it directly in the whiteboard.</p>

          <div className="competitive-menu-groups">
            <div className="competitive-menu-group">
              <div className="saved-title">Collaborative Whiteboards</div>
              {loadingWorkspaces ? (
                <div className="saved-empty">Loading synced whiteboards...</div>
              ) : workspaceError ? (
                <div className="auth-error">{workspaceError}</div>
              ) : workspaces.length === 0 ? (
                <div className="saved-empty">There are no synced whiteboards in this account yet.</div>
              ) : (
                <div className="saved-list">
                  {workspaces.map((workspace) => (
                    <div key={workspace.id} className="saved-item wb-record-card">
                      <button
                        type="button"
                        className="wb-record-open"
                        onClick={() => {
                          setActiveWhiteboardWorkspaceId(workspace.id)
                          setActiveWhiteboardExerciseId(workspace.exercise_local_id || workspace.exercise_snapshot?.id || '')
                          onOpenBoard()
                        }}
                      >
                        <div className="saved-item-title">{workspace.exercise_title || 'Untitled whiteboard'}</div>
                        <div className="saved-item-meta">Synced in Supabase</div>
                        <div className="saved-item-tags">
                          {workspace.source_workspace_id ? 'Private copy' : 'Root whiteboard'} | {(workspace.visibility || 'private') === 'public' ? 'Public' : 'Private'} | Nodes: {workspace.nodes?.length || 0} | Links: {workspace.links?.length || 0}
                        </div>
                      </button>
                      <div className="menu-actions wb-inline-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleDownloadWorkspace(workspace.id)}
                        >
                          Download JSON
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                        >
                          Delete whiteboard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="competitive-menu-group">
              <div className="saved-title">Public Whiteboards</div>
              {!session?.userId ? (
                <div className="saved-empty">Sign in to browse and save public collaborative whiteboards.</div>
              ) : loadingWorkspaces ? (
                <div className="saved-empty">Loading public whiteboards...</div>
              ) : publicWorkspaces.length === 0 ? (
                <div className="saved-empty">There are no original public whiteboards from other users yet.</div>
              ) : (
                <div className="saved-list">
                  {publicWorkspaces.map((workspace) => (
                    <div key={workspace.id} className="saved-item wb-record-card">
                      <button
                        type="button"
                        className="wb-record-open"
                        onClick={() => {
                          setActiveWhiteboardWorkspaceId(workspace.id)
                          setActiveWhiteboardExerciseId(workspace.exercise_local_id || workspace.exercise_snapshot?.id || '')
                          onOpenBoard()
                        }}
                      >
                        <div className="saved-item-title">{workspace.exercise_title || 'Untitled whiteboard'}</div>
                        <div className="saved-item-meta">Public collaborative board</div>
                        <div className="saved-item-tags">
                          Nodes: {workspace.nodes?.length || 0} | Links: {workspace.links?.length || 0}
                        </div>
                      </button>
                      <div className="menu-actions wb-inline-actions">
                        <button type="button" className="btn" onClick={() => handleSaveMyCopy(workspace.id)}>
                          Save My Copy
                        </button>
                        <button type="button" className="btn" onClick={() => handleDownloadWorkspace(workspace.id)}>
                          Download JSON
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="competitive-menu-group">
              <div className="saved-title">Whiteboard Exercises</div>
              {exercises.length === 0 ? (
                <div className="saved-empty">There are no saved exercises yet. Create one in the editor to get started.</div>
              ) : (
                <div className="saved-list">
                  {exercises.map((exercise) => (
                    <div key={exercise.id} className="saved-item wb-record-card">
                      <button
                        type="button"
                        className="wb-record-open"
                        onClick={() => {
                          setActiveWhiteboardExerciseId(exercise.id)
                          setActiveWhiteboardWorkspaceId('')
                          onOpenBoard()
                        }}
                      >
                        <div className="saved-item-title">{exercise.title || 'Untitled exercise'}</div>
                        <div className="saved-item-meta">{exercise.topic || 'No topic'}</div>
                        <div className="saved-item-tags">
                          Data items: {exercise.dataItems?.length || 0} | {exercise.statement ? 'With statement' : 'No statement'}
                        </div>
                      </button>
                      <div className="menu-actions wb-inline-actions">
                        <button type="button" className="btn danger" onClick={() => handleDeleteExercise(exercise.id)}>
                          Delete Exercise
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="competitive-menu-group">
              <div className="saved-title">Module Tools</div>
              <div className="menu-actions competitive-menu-actions">
                <button type="button" className="btn menu-btn" onClick={onOpenExercises}>Exercise Editor</button>
                <button type="button" className="btn menu-btn" onClick={() => importFileRef.current?.click()}>Import Whiteboard JSON</button>
                <button type="button" className="btn menu-btn" onClick={() => downloadJsonFile('inticore-whiteboard-workspace-template.json', buildWhiteboardWorkspaceTemplateJson())}>Download Whiteboard Template</button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,.txt,application/json,text/plain"
                  style={{ display: 'none' }}
                  onChange={handleImportWorkspace}
                />
              </div>
            </div>
          </div>

          <div className="menu-actions competitive-menu-footer">
            <button type="button" className="btn menu-btn" onClick={onBackToMenu}>Back to Modes</button>
          </div>
        </div>
      </div>
    </div>
  )
}
