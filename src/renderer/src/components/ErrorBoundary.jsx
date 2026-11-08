import { Component } from 'react'

// If something on a page throws while it draws or runs an effect, React would otherwise take the whole window
// down and leave it blank. This shows what happened instead, with Reload (renders and setups keep running in
// the main process) and the error to copy for a bug report.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('IV Studio page error:', error, info?.componentStack)
  }
  render() {
    const e = this.state.error
    if (!e) return this.props.children
    const text = `${e?.message || e}\n${String(e?.stack || '').split('\n').slice(1, 6).join('\n')}`
    return (
      <div className="page-error" role="alert">
        <h1>Something went wrong on this page</h1>
        <p>IV Studio is still running: renders, downloads and cloud setups carry on. Reload the window to get back to work.</p>
        <div className="page-error-btns">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => navigator.clipboard.writeText(text).catch(() => {})}>
            Copy the error
          </button>
        </div>
        <pre className="code">{text}</pre>
      </div>
    )
  }
}
