import { appState, setDiagnostics } from "../../ui/state/store";

export function DiagnosticsBanner() {
  const diagnostics = appState.value.diagnostics;
  if (diagnostics.length === 0) return null;

  return (
    <aside class="diagnostics" role="region" aria-label="Catalog diagnostics">
      <div class="diagnostics__mark" aria-hidden="true">
        !
      </div>
      <div class="diagnostics__body">
        <strong>Catalog validation warning</strong>
        <p>
          Missions are still playable, but some catalog values may be inconsistent.
        </p>
        <details>
          <summary>Technical detail</summary>
          <pre>{diagnostics.map((item) => item.message).join("\n")}</pre>
        </details>
      </div>
      <button
        class="diagnostics__close"
        type="button"
        onClick={() => setDiagnostics([])}
        aria-label="Dismiss catalog warning"
      >
        ×
      </button>
    </aside>
  );
}
