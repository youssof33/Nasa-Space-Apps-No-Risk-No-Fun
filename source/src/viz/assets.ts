export interface AssetVariant {
  width: number;
  height: number;
  file: string;
  bytes: number;
  sha256: string;
}

export interface AssetEntry {
  source: string;
  sourcePage: string;
  credit: string;
  license: string;
  variants: AssetVariant[];
}

export interface AssetManifest {
  generatedAt: string;
  assets: Record<string, AssetEntry>;
}

let manifestPromise: Promise<AssetManifest> | null = null;

export function loadManifest(): Promise<AssetManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${import.meta.env.BASE_URL}assets/manifest.json`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Asset manifest unavailable (HTTP ${response.status}).`);
        }
        return parseManifest(await response.json());
      })
      .catch((error: unknown) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

export function pickVariant(entry: AssetEntry, maxWidth: number): AssetVariant {
  const sorted = [...entry.variants].sort((a, b) => a.width - b.width);
  const variant = sorted.find((candidate) => candidate.width >= maxWidth) ?? sorted.at(-1);
  if (!variant) throw new Error("Asset entry has no variants.");
  return variant;
}

export function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/${file}`;
}

function parseManifest(value: unknown): AssetManifest {
  if (!isRecord(value) || !isRecord(value.assets)) {
    throw new Error("Asset manifest is malformed.");
  }
  return {
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    assets: value.assets as Record<string, AssetEntry>,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
