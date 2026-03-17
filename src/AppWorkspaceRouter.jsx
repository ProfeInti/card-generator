import { lazy, Suspense } from 'react'
import { CompetitiveModeShell, CreativeModeShell, MainMenu } from './components/ModeShells'
import { COMPETITIVE_SECTIONS } from './components/competitiveSections'

const CompetitiveExerciseEditor = lazy(() => import('./CompetitiveExerciseEditor'))
const CompetitiveReviewPanel = lazy(() => import('./CompetitiveReviewPanel'))
const CompetitiveTechniqueEditor = lazy(() => import('./CompetitiveTechniqueEditor'))
const CompetitiveTechniqueReviewPanel = lazy(() => import('./CompetitiveTechniqueReviewPanel'))
const CompetitiveExercisesCollection = lazy(() => import('./CompetitiveExercisesCollection'))
const CompetitiveTechniquesCollection = lazy(() => import('./CompetitiveTechniquesCollection'))
const CompetitiveTechniquesCatalog = lazy(() => import('./CompetitiveTechniquesCatalog'))
const ConstructGenerator = lazy(() => import('./ConstructGenerator'))
const CompetitiveConstructsCollection = lazy(() => import('./CompetitiveConstructsCollection'))
const CompetitiveConstructReviewPanel = lazy(() => import('./CompetitiveConstructReviewPanel'))
const CompetitiveTrainingMode = lazy(() => import('./CompetitiveTrainingMode'))
const MultiplayerLobby = lazy(() => import('./MultiplayerLobby'))
const MultiplayerMatch = lazy(() => import('./MultiplayerMatch'))
const MultiplayerDeckBuilder = lazy(() => import('./MultiplayerDeckBuilder'))

function WorkspaceLoading() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Card Generator</h1>
        <p className="auth-subtitle">Loading workspace...</p>
      </div>
    </div>
  )
}

function withSuspense(node) {
  return <Suspense fallback={<WorkspaceLoading />}>{node}</Suspense>
}

export default function AppWorkspaceRouter({
  activeMultiplayerMatchId,
  onLogout,
  renderCardWorkspace,
  session,
  setActiveMultiplayerMatchId,
  setWorkspaceTarget,
  workspaceTarget,
}) {
  if (!workspaceTarget) {
    return (
      <MainMenu
        session={session}
        onOpenCreative={() => setWorkspaceTarget('creative')}
        onOpenCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenMultiplayer={() => setWorkspaceTarget('multiplayer')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'creative') {
    return (
      <CreativeModeShell
        session={session}
        onOpenGenerator={() => setWorkspaceTarget('creative-generator')}
        onOpenCollection={() => setWorkspaceTarget('creative-collection')}
        onBack={() => setWorkspaceTarget(null)}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'multiplayer') {
    return withSuspense(
      <MultiplayerLobby
        session={session}
        onBackToMenu={() => setWorkspaceTarget(null)}
        onOpenDeckBuilder={() => setWorkspaceTarget('multiplayer-deck-builder')}
        onOpenMatch={(matchId) => {
          setActiveMultiplayerMatchId(matchId)
          setWorkspaceTarget('multiplayer-match')
        }}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'multiplayer-deck-builder') {
    return withSuspense(
      <MultiplayerDeckBuilder
        session={session}
        onBackToLobby={() => setWorkspaceTarget('multiplayer')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'multiplayer-match') {
    return withSuspense(
      <MultiplayerMatch
        session={session}
        matchId={activeMultiplayerMatchId}
        onBackToLobby={() => setWorkspaceTarget('multiplayer')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-exercises') {
    return withSuspense(
      <CompetitiveExerciseEditor
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-exercises-collection') {
    return withSuspense(
      <CompetitiveExercisesCollection
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenEditor={() => setWorkspaceTarget('competitive-exercises')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-construct-generator') {
    return withSuspense(
      <ConstructGenerator
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-constructs-collection') {
    return withSuspense(
      <CompetitiveConstructsCollection
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenGenerator={() => setWorkspaceTarget('competitive-construct-generator')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-techniques') {
    return withSuspense(
      <CompetitiveTechniqueEditor
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-techniques-collection') {
    return withSuspense(
      <CompetitiveTechniquesCollection
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenCatalog={() => setWorkspaceTarget('competitive-techniques-catalog')}
        onOpenEditor={() => setWorkspaceTarget('competitive-techniques')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-techniques-catalog') {
    return withSuspense(
      <CompetitiveTechniquesCatalog
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenCollection={() => setWorkspaceTarget('competitive-techniques-collection')}
        onOpenEditor={() => setWorkspaceTarget('competitive-techniques')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-review' || workspaceTarget === 'competitive-exercises-review') {
    if (session.role !== 'teacher') {
      return (
        <CompetitiveModeShell
          session={session}
          activeSectionId={COMPETITIVE_SECTIONS[0].id}
          onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
          onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
          onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
          onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
          onBack={() => setWorkspaceTarget(null)}
          onLogout={onLogout}
        />
      )
    }

    return withSuspense(
      <CompetitiveReviewPanel
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-techniques-review') {
    if (session.role !== 'teacher') {
      return (
        <CompetitiveModeShell
          session={session}
          activeSectionId={'competitive-techniques'}
          onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
          onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
          onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
          onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
          onBack={() => setWorkspaceTarget(null)}
          onLogout={onLogout}
        />
      )
    }

    return withSuspense(
      <CompetitiveTechniqueReviewPanel
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-constructs-review') {
    if (session.role !== 'teacher') {
      return (
        <CompetitiveModeShell
          session={session}
          activeSectionId={'competitive-constructs-collection'}
          onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
          onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
          onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
          onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
          onBack={() => setWorkspaceTarget(null)}
          onLogout={onLogout}
        />
      )
    }

    return withSuspense(
      <CompetitiveConstructReviewPanel
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-training') {
    return withSuspense(
      <CompetitiveTrainingMode
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget.startsWith('competitive')) {
    const activeSectionId = workspaceTarget === 'competitive' ? COMPETITIVE_SECTIONS[0].id : workspaceTarget

    return (
      <CompetitiveModeShell
        session={session}
        activeSectionId={activeSectionId}
        onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
        onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
        onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
        onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
        onBack={() => setWorkspaceTarget(null)}
        onLogout={onLogout}
      />
    )
  }

  if (workspaceTarget === 'generator' || workspaceTarget === 'collection') {
    return renderCardWorkspace(workspaceTarget, () => setWorkspaceTarget('creative'))
  }

  if (workspaceTarget === 'creative-generator' || workspaceTarget === 'creative-collection') {
    const creativeView = workspaceTarget === 'creative-collection' ? 'collection' : 'generator'
    return renderCardWorkspace(creativeView, () => setWorkspaceTarget('creative'))
  }

  return (
    <MainMenu
      session={session}
      onOpenCreative={() => setWorkspaceTarget('creative')}
      onOpenCompetitive={() => setWorkspaceTarget('competitive')}
      onOpenMultiplayer={() => setWorkspaceTarget('multiplayer')}
      onLogout={onLogout}
    />
  )
}
