import { useEffect, useState } from "preact/hooks";
import { loadManifest, type AssetManifest } from "../../viz/assets";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: Props) {
  const [manifest, setManifest] = useState<AssetManifest | null>(null);

  useEffect(() => {
    if (!open || manifest) return;
    let active = true;
    loadManifest()
      .then((result) => {
        if (active) setManifest(result);
      })
      .catch(() => {
        if (active) setManifest(null);
      });
    return () => {
      active = false;
    };
  }, [open, manifest]);

  return (
    <Modal open={open} onClose={onClose} title="About SpaceX" eyebrow="Mission console">
      <p class="about__lede">
        A browser-based space mission design game built for the 2026 NASA Space
        Apps Challenge. Balance science against mass, power, data, and budget,
        then fly the mission and find out why it worked.
      </p>

      <dl class="about__facts">
        <div>
          <dt>Build</dt>
          <dd>v1.0 · NASA Space Apps 2026</dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>Preact · three.js · TypeScript</dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>Metric only</dd>
        </div>
      </dl>

      <h3>Imagery credits</h3>
      {manifest ? (
        <ul class="credit-list">
          {Object.entries(manifest.assets).map(([id, asset]) => (
            <li key={id}>
              <a href={asset.sourcePage} target="_blank" rel="noreferrer">
                {asset.credit}
              </a>
              <span>
                {asset.variants.length} local derivative{asset.variants.length === 1 ? "" : "s"} ·
                NASA does not endorse this project.
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="about__muted">
          The local asset manifest is not available. Run <code>npm run assets:fetch</code>{" "}
          to restore imagery and credits.
        </p>
      )}

      <p class="about__muted">
        Fonts are self-hosted through Fontsource under the SIL Open Font License.
        three.js, Preact, Vite, Sharp, and lz-string retain their upstream
        licenses.
      </p>

      <p class="about__disclaimer">
        SpaceX is not affiliated with, endorsed by, or sponsored by NASA.
        Mission analogs are referenced for educational context only. Catalog
        values are illustrative estimates, not procurement data.
      </p>
    </Modal>
  );
}
