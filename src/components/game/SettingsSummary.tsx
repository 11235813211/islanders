import type { GameSettings, GameView } from '../../../shared/types';
import { CATEGORIES, type SettingDef } from '../lobby/settings';

/** A setting's value as short text: the option label, On/Off, or the number. */
function valueText(def: SettingDef, value: GameSettings[keyof GameSettings]): string {
  const { control } = def;
  if (control.kind === 'toggle') return value ? 'On' : 'Off';
  if (control.kind === 'select') return control.options.find(o => o.value === value)?.label ?? String(value);
  if (control.kind === 'seconds') return `${value} s`;
  return String(value);
}

/** Every room setting in play, grouped and colored like the lobby, for reading on a phone. */
export default function SettingsSummary({ view }: { view: GameView }) {
  return (
    <div className="settings-summary">
      {view.map && (
        <section className="tone-sea">
          <h4>Map</h4>
          <dl>
            <div>
              <dt>Board</dt>
              <dd>{view.map.name}</dd>
            </div>
          </dl>
        </section>
      )}
      {CATEGORIES.map(category => {
        const rows = category.settings.filter(def => !def.when || def.when(view));
        if (!rows.length) return null;
        return (
          <section key={category.id} className={`tone-${category.tone}`}>
            <h4>{category.title}</h4>
            <dl>
              {rows.map(def => (
                <div key={def.key}>
                  <dt>{def.label}</dt>
                  <dd>{valueText(def, view.settings[def.key])}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
