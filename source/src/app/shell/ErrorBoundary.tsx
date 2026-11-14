import { Component, type ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("SpaceX UI error", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main class="crash-screen">
        <div class="crash-screen__panel">
          <p class="eyebrow">SpaceX</p>
          <h1>Mission control hit an interface fault</h1>
          <p>
            The design data is still intact. Reload to restart the console, or return to
            mission select.
          </p>
          <pre>{this.state.error.message}</pre>
          <div class="crash-screen__actions">
            <button class="btn btn--primary btn--md" onClick={() => window.location.reload()}>
              Reload console
            </button>
            <button
              class="btn btn--secondary btn--md"
              onClick={() => {
                window.location.hash = "#/";
                window.location.reload();
              }}
            >
              Back to missions
            </button>
          </div>
        </div>
      </main>
    );
  }
}
