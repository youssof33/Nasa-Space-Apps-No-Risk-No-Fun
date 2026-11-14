import { catalogs } from "../data/catalogs";
import { validateCatalogs } from "../data/catalog-validation";

interface WorkerScope {
  addEventListener(type: "message", listener: () => void): void;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener("message", () => {
  try {
    validateCatalogs(catalogs);
    scope.postMessage({ ok: true });
  } catch (error) {
    scope.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
