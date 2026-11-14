/**
 * Downloads the NASA imagery SpaceX renders, converts it to local WebP
 * derivatives, and writes public/assets/manifest.json plus docs/asset-credits.md.
 *
 * Run with `npm run assets:fetch`. Add `-- --force` to redownload and reconvert
 * everything. Source downloads are cached in .cache/assets so reruns are cheap.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public", "assets");
const TEXTURE_DIR = join(PUBLIC_DIR, "textures");
const CACHE_DIR = join(ROOT, ".cache", "assets");
const MANIFEST_PATH = join(PUBLIC_DIR, "manifest.json");
const CREDITS_PATH = join(ROOT, "docs", "asset-credits.md");
const FORCE = process.argv.includes("--force");

interface Target {
  width: number;
  file: string;
  grayscale?: boolean;
}

interface AssetDefinition {
  id: string;
  source: string;
  sourcePage: string;
  credit: string;
  targets: Target[];
}

interface ManifestVariant {
  width: number;
  height: number;
  file: string;
  bytes: number;
  sha256: string;
}

interface ManifestAsset {
  source: string;
  sourcePage: string;
  credit: string;
  license: string;
  variants: ManifestVariant[];
}

interface Manifest {
  generatedAt: string;
  assets: Record<string, ManifestAsset>;
}

const NASA_LICENSE =
  "NASA imagery is generally not protected by copyright in the United States. Credit NASA Earth Observatory. NASA does not endorse SpaceX.";

const ASSETS: AssetDefinition[] = [
  {
    id: "earth-day",
    source:
      "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg",
    sourcePage:
      "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/",
    credit:
      "NASA Earth Observatory, Blue Marble: Next Generation (July 2004 base map), Reto Stöckli",
    targets: [
      { width: 4096, file: "earth-day-4096.webp" },
      { width: 2048, file: "earth-day-2048.webp" },
      { width: 1024, file: "earth-day-1024.webp" },
    ],
  },
  {
    id: "earth-night",
    source:
      "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg",
    sourcePage: "https://science.nasa.gov/earth/earth-at-night/maps/",
    credit: "NASA Earth Observatory, Black Marble 2016 night lights",
    targets: [
      { width: 2048, file: "earth-night-2048.webp" },
      { width: 1024, file: "earth-night-1024.webp" },
    ],
  },
  {
    id: "earth-bump",
    source:
      "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_5400x2700.jpg",
    sourcePage:
      "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/",
    credit:
      "NASA Earth Observatory, Blue Marble Next Generation topography and bathymetry (GEBCO)",
    targets: [
      { width: 2048, file: "earth-bump-2048.webp", grayscale: true },
      { width: 1024, file: "earth-bump-1024.webp", grayscale: true },
    ],
  },
];

async function main(): Promise<void> {
  await mkdir(TEXTURE_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(join(ROOT, "docs"), { recursive: true });

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    assets: {},
  };

  for (const asset of ASSETS) {
    const sourcePath = await downloadSource(asset);
    const metadata = await sharp(sourcePath).metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (sourceWidth === 0 || sourceHeight === 0) {
      throw new Error(`${asset.id}: source image has no readable dimensions.`);
    }

    const variants: ManifestVariant[] = [];
    for (const target of asset.targets) {
      const height = Math.round((target.width * sourceHeight) / sourceWidth / 2) * 2;
      const outputPath = join(TEXTURE_DIR, target.file);
      const exists = !FORCE && (await fileExists(outputPath));
      if (!exists) {
        await sharp(sourcePath)
          .resize(target.width, height, { fit: "fill" })
          .greyscale(target.grayscale ?? false)
          .webp({ quality: target.grayscale ? 90 : 84, effort: 5 })
          .toFile(outputPath);
        console.log(`  converted ${target.file}`);
      }
      const info = await stat(outputPath);
      variants.push({
        width: target.width,
        height,
        file: `textures/${target.file}`,
        bytes: info.size,
        sha256: await sha256File(outputPath),
      });
    }

    manifest.assets[asset.id] = {
      source: asset.source,
      sourcePage: asset.sourcePage,
      credit: asset.credit,
      license: NASA_LICENSE,
      variants,
    };
    console.log(`${asset.id}: ${variants.length} local variants`);
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(CREDITS_PATH, renderCredits(manifest), "utf8");
  console.log(`wrote ${relative(MANIFEST_PATH)}`);
  console.log(`wrote ${relative(CREDITS_PATH)}`);
}

async function downloadSource(asset: AssetDefinition): Promise<string> {
  const cachePath = join(CACHE_DIR, `${asset.id}.img`);
  if (!FORCE && (await fileExists(cachePath)) && (await stat(cachePath)).size > 10_000) {
    return cachePath;
  }
  console.log(`downloading ${asset.id} …`);
  const response = await fetchWithRetry(asset.source);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000) {
    throw new Error(`${asset.id}: downloaded image is suspiciously small (${bytes.length} bytes).`);
  }
  await writeFile(cachePath, bytes);
  return cachePath;
}

async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(90_000),
        headers: { "user-agent": "spacex-asset-pipeline/0.1" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        throw new Error("server returned an HTML page instead of an image");
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }
  throw new Error(`${url} failed after ${attempts} attempts: ${String(lastError)}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function renderCredits(manifest: Manifest): string {
  const lines = [
    "# Asset credits",
    "",
    "SpaceX ships local derivatives of NASA Earth imagery. Nothing is hotlinked at runtime.",
    "",
    "NASA imagery is generally not protected by copyright in the United States. NASA does not endorse SpaceX or the NASA Space Apps Challenge. Mission names and analogs are referenced for educational context only.",
    "",
    "Regenerate this file and the local textures with `npm run assets:fetch`. The same credits appear in the in-app About panel from `public/assets/manifest.json`.",
    "",
  ];

  for (const [id, asset] of Object.entries(manifest.assets)) {
    lines.push(`## ${id}`, "", asset.credit, "", `- Source page: ${asset.sourcePage}`);
    lines.push(`- Original file: ${asset.source}`);
    lines.push(`- License: ${asset.license}`);
    lines.push("- Local derivatives:");
    for (const variant of asset.variants) {
      lines.push(
        `  - \`${variant.file}\` — ${variant.width}×${variant.height}, ${formatBytes(variant.bytes)}, sha256 \`${variant.sha256}\``,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Fonts",
    "",
    "- Space Grotesk, Inter, and IBM Plex Mono are self-hosted through Fontsource and licensed under the SIL Open Font License 1.1.",
    "",
    "## Software",
    "",
    "- Preact, three.js, lz-string, Vite, and Sharp retain their respective upstream licenses.",
    "",
  );
  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function relative(path: string): string {
  return path.slice(ROOT.length + 1).replaceAll("\\", "/");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
