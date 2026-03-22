const PILLARS = [
  {
    title: 'Dungeon Structure',
    body: 'Define dungeon acts, rooms, encounters, branching paths and progression milestones before any runtime automation.',
  },
  {
    title: 'Math Encounters',
    body: 'Describe each challenge as an explorable problem with observable structure, transformations and multiple valid approaches.',
  },
  {
    title: 'Techniques and Loot',
    body: 'Treat techniques as unlockable tools and rewards as progression objects, not as automatic answer buttons.',
  },
  {
    title: 'Narrative Tone',
    body: 'Keep the voice immersive and introspective so the student feels guided by an inner narrator rather than a grading machine.',
  },
]

const LOOP_STEPS = [
  'Observe the encounter',
  'Choose an exploratory action',
  'Receive partial feedback',
  'Unlock a clue, tool or insight',
  'Advance deeper into the dungeon',
]

const FOUNDATION_BLOCKS = [
  {
    title: 'Content Bible',
    body: 'Shared rules for difficulty, terminology, puzzle types, hint tone, failure states and reward pacing.',
  },
  {
    title: 'Dungeon Templates',
    body: 'Reusable blueprints for algebra, arithmetic, factoring, equations or proof-oriented exploration.',
  },
  {
    title: 'Action Vocabulary',
    body: 'A finite set of player actions such as observe, test, transform, invoke technique, request hint and commit answer.',
  },
  {
    title: 'State Model',
    body: 'A paper design for health, progress, tension, clue discovery, solved states and optional mastery bonuses.',
  },
]

export default function MathDungeonsHub({ session, onBackToMenu, onLogout }) {
  return (
    <div className="menu-shell dungeon-shell">
      <div className="menu-card dungeon-card">
        <div className="menu-top">
          <div>
            <p className="welcome-overline">EXPLORATORY LEARNING MODE</p>
            <h1 className="menu-title">Math Dungeons</h1>
            <p className="menu-subtitle">
              A new space to shape mathematical adventures, define dungeon structure and prepare
              challenge design before building execution systems.
            </p>
          </div>
          <span className="session-user">User: {session.username}</span>
        </div>

        <section className="dungeon-hero-panel">
          <div className="dungeon-hero-copy">
            <div className="saved-title">Current Focus</div>
            <h2 className="dungeon-section-title">Prepare the mode before the machinery</h2>
            <p className="dungeon-copy">
              This section is our design headquarters for the new mode. We can use it to align on
              encounter grammar, player actions, progression logic and the overall feeling of the
              dungeon experience without committing to backend execution yet.
            </p>
          </div>

          <div className="dungeon-loop-card">
            <div className="saved-title">Core Exploration Loop</div>
            <ol className="dungeon-loop-list">
              {LOOP_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>

        <section className="dungeon-grid">
          {PILLARS.map((pillar) => (
            <article key={pillar.title} className="dungeon-panel">
              <div className="saved-title">Design Pillar</div>
              <h3 className="dungeon-panel-title">{pillar.title}</h3>
              <p className="dungeon-copy">{pillar.body}</p>
            </article>
          ))}
        </section>

        <section className="dungeon-foundation">
          <div className="saved-title">What We Can Build Next</div>
          <div className="dungeon-foundation-grid">
            {FOUNDATION_BLOCKS.map((block) => (
              <article key={block.title} className="dungeon-panel">
                <h3 className="dungeon-panel-title">{block.title}</h3>
                <p className="dungeon-copy">{block.body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="menu-actions competitive-menu-footer">
          <button type="button" className="btn menu-btn" onClick={onBackToMenu}>Back to Modes</button>
          <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
