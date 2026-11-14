import { appState, updateSettings } from "../../ui/state/store";
import type { QualitySetting } from "../../ui/state/persistence";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const settings = appState.value.settings;

  return (
    <Modal open={open} onClose={onClose} title="Settings" eyebrow="Console preferences">
      <div class="settings">
        <label class="settings__field" for="quality-setting">
          <span>3D quality</span>
          <small>Auto adapts texture detail to this device.</small>
          <select
            id="quality-setting"
            value={settings.quality}
            onChange={(event) =>
              updateSettings({ quality: event.currentTarget.value as QualitySetting })
            }
          >
            <option value="auto">Auto (recommended)</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label class="settings__toggle" for="reduced-motion-setting">
          <span>
            <strong>Reduce motion</strong>
            <small>Stops the Earth spin and camera drift. Drag still works.</small>
          </span>
          <input
            id="reduced-motion-setting"
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => updateSettings({ reducedMotion: event.currentTarget.checked })}
          />
        </label>
      </div>
    </Modal>
  );
}
