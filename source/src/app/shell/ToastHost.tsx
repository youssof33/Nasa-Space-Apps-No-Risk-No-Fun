import { appState, dismissToast } from "../../ui/state/store";

export function ToastHost() {
  const toasts = appState.value.toasts;
  if (toasts.length === 0) return null;

  return (
    <div class="toasts" role="log" aria-live="polite">
      {toasts.map((toast) => (
        <div class={`toast toast--${toast.tone}`} key={toast.id}>
          <span class="toast__dot" aria-hidden="true" />
          <p>{toast.message}</p>
          <button
            class="toast__close"
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
