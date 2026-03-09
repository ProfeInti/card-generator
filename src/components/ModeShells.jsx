export const COMPETITIVE_SECTIONS = [
  {
    id: 'competitive-exercises',
    label: 'Exercises Generator',
    title: 'Exercises Generator',
    description: 'Create and edit formal competitive exercises with structured, persistent fields.',
  },
  {
    id: 'competitive-exercises-collection',
    label: 'Exercises Collection',
    title: 'Exercises Collection',
    description: 'Browse visible exercises with filters and identify approved items for future constructs.',
  },
  {
    id: 'competitive-techniques',
    label: 'Techniques Generator',
    title: 'Techniques Generator',
    description: 'Create and edit formal techniques to build approved construct sequences later.',
  },
  {
    id: 'competitive-techniques-collection',
    label: 'Techniques Collection',
    title: 'Techniques Collection',
    description: 'Browse visible techniques with filters and identify approved items for future constructs.',
  },
  {
    id: 'competitive-construct-generator',
    label: 'Construct Generator',
    title: 'Construct Generator',
    description: 'Build ordered construct steps from one approved exercise and approved techniques.',
  },
  {
    id: 'competitive-constructs-collection',
    label: 'Constructs Collection',
    title: 'Constructs Collection',
    description: 'Browse own and approved constructs with ordered step detail.',
  },
  {
    id: 'competitive-training',
    label: 'Training Mode',
    title: 'Training Mode',
    description: 'Play approved constructs step by step by selecting technique cards.',
  },
]

const SECTION_BY_ID = COMPETITIVE_SECTIONS.reduce((acc, item) => {
  acc[item.id] = item
  return acc
}, {})

const COMPETITIVE_GROUPS = [
  {
    title: 'Techniques',
    entries: ['competitive-techniques', 'competitive-techniques-collection'],
  },
  {
    title: 'Exercises',
    entries: ['competitive-exercises', 'competitive-exercises-collection'],
  },
  {
    title: 'Constructs',
    entries: ['competitive-construct-generator', 'competitive-constructs-collection', 'competitive-training'],
  },
]

export function MainMenu({ session, onOpenCreative, onOpenCompetitive, onOpenMultiplayer, onLogout }) {
  return (
    <div className="menu-shell">
      <div className="menu-card">
        <div className="menu-top">
          <h1 className="menu-title">Welcome to Inticore</h1>
          <span className="session-user">User: {session.username}</span>
        </div>
        <p className="menu-subtitle">Choose your mode.</p>

        <div className="menu-actions">
          <button type="button" className="btn menu-btn" onClick={onOpenCreative}>Creative Mode</button>
          <button type="button" className="btn menu-btn" onClick={onOpenCompetitive}>Competitive Mode</button>
          <button type="button" className="btn menu-btn" onClick={onOpenMultiplayer}>Multiplayer</button>
          <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}

export function CreativeModeShell({ session, onOpenGenerator, onOpenCollection, onBack, onLogout }) {
  return (
    <div className="menu-shell">
      <div className="menu-card">
        <div className="menu-top">
          <h1 className="menu-title">Creative Mode</h1>
          <span className="session-user">User: {session.username}</span>
        </div>
        <p className="menu-subtitle">Use your existing tools in a dedicated creative workspace.</p>

        <div className="menu-actions">
          <button type="button" className="btn menu-btn" onClick={onOpenGenerator}>Creative Generator</button>
          <button type="button" className="btn menu-btn" onClick={onOpenCollection}>Creative Collection</button>
          <button type="button" className="btn menu-btn" onClick={onBack}>Back to Modes</button>
          <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}

export function CompetitiveModeShell({
  session,
  activeSectionId,
  onSelectSection,
  onOpenExercisesReview,
  onOpenTechniquesReview,
  onOpenConstructsReview,
  onBack,
  onLogout,
}) {
  const activeSection = COMPETITIVE_SECTIONS.find((item) => item.id === activeSectionId) || COMPETITIVE_SECTIONS[0]

  return (
    <div className="menu-shell">
      <div className="menu-card">
        <div className="menu-top">
          <h1 className="menu-title">Competitive Mode</h1>
          <span className="session-user">User: {session.username}</span>
        </div>
        <p className="menu-subtitle">Competitive area with formal entities and teacher review workflow.</p>

        <div className="competitive-menu-groups">
          {COMPETITIVE_GROUPS.map((group) => (
            <div key={group.title} className="competitive-menu-group">
              <div className="saved-title">{group.title}</div>
              <div className="menu-actions competitive-menu-actions">
                {group.entries.map((entryId) => {
                  const section = SECTION_BY_ID[entryId]
                  if (!section) return null

                  return (
                    <button
                      key={section.id}
                      type="button"
                      className="btn menu-btn"
                      onClick={() => onSelectSection(section.id)}
                    >
                      {section.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {session.role === 'teacher' && (
            <div className="competitive-menu-group">
              <div className="saved-title">Teacher Reviews</div>
              <div className="menu-actions competitive-menu-actions">
                <button type="button" className="btn menu-btn" onClick={onOpenExercisesReview}>Exercises Review</button>
                <button type="button" className="btn menu-btn" onClick={onOpenTechniquesReview}>Techniques Review</button>
                <button type="button" className="btn menu-btn" onClick={onOpenConstructsReview}>Constructs Review</button>
              </div>
            </div>
          )}
        </div>

        <div className="menu-actions competitive-menu-footer">
          <button type="button" className="btn menu-btn" onClick={onBack}>Back to Modes</button>
          <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
        </div>

        <div className="collection-toolbar" style={{ marginTop: 14 }}>
          <div className="saved-title">{activeSection.title}</div>
          <div className="saved-empty">{activeSection.description}</div>
        </div>
      </div>
    </div>
  )
}



