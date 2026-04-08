import { Component } from 'react'

import DescriptionEditor from './DescriptionEditor'

class DescriptionEditorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      errorMessage: '',
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error desconocido al montar el editor.',
    }
  }

  componentDidCatch(error) {
    console.error('DescriptionEditor crashed:', error)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({
        hasError: false,
        errorMessage: '',
      })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="wb-editor-presence">
          <div>El editor enriquecido no pudo cargarse.</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
            {this.state.errorMessage || 'Recarga el cuaderno o avisame para seguir corrigiendo esta vista.'}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default function SafeDescriptionEditor(props) {
  return (
    <DescriptionEditorBoundary resetKey={props.resetKey}>
      <DescriptionEditor {...props} />
    </DescriptionEditorBoundary>
  )
}
