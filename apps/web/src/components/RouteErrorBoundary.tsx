import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** A crashing page should say so — never blank the whole app. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">This page hit an error</p>
        <p className="pt-1 text-xs text-[var(--text-tertiary)] break-words">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-4 rounded-md border border-[var(--border-medium)] bg-white px-4 py-2 text-sm text-[var(--text-secondary)]"
        >
          Try again
        </button>
      </div>
    )
  }
}
