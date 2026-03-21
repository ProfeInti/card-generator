const DEFAULT_TOKENS = [
  { label: 'x^2', value: 'x^2' },
  { label: '\\frac{}{}', value: '\\frac{}{}' },
  { label: '\\sqrt{}', value: '\\sqrt{}' },
  { label: '\\Rightarrow', value: '\\Rightarrow' },
  { label: '\\therefore', value: '\\therefore' },
  { label: '\\forall', value: '\\forall' },
  { label: '\\exists', value: '\\exists' },
  { label: '\\in', value: '\\in' },
]

export default function MathTokenToolbar({ onInsert, tokens = DEFAULT_TOKENS, title = 'Botonera matematica' }) {
  return (
    <div className="wb-token-toolbar">
      <div className="wb-token-toolbar-title">{title}</div>
      <div className="wb-token-list">
        {tokens.map((token) => (
          <button
            key={token.label}
            type="button"
            className="btn wb-token-btn"
            onClick={() => onInsert(token.value)}
          >
            {token.label}
          </button>
        ))}
      </div>
    </div>
  )
}
