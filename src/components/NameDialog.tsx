import { type FormEvent, useState } from 'react';
import { cleanName, nameTaken } from '../../shared/settings';
import type { GameView } from '../../shared/types';
import { GameDialog } from './TradePanel';
import './name-form.css';

/** Why this name can't be saved yet, if the reason is known before asking the server. */
function nameProblem(typed: string, name: string | null, taken: boolean): string | null {
  if (typed.trim() && !name) return 'Use 1–24 characters, without < or >.';
  return taken ? 'Someone in this room already has that name.' : null;
}

/** A name field with its Save button, for the room's name dialog and the account dialog. */
export function NameForm({
  label,
  initial,
  busy = false,
  isTaken,
  save,
}: {
  label: string;
  initial: string;
  busy?: boolean;
  isTaken?: (name: string) => boolean;
  save: (name: string) => void | Promise<void>;
}) {
  const [typed, setTyped] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const name = cleanName(typed);
  const problem = nameProblem(typed, name, !!name && !!isTaken?.(name)) ?? failure;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name || problem) return;
    setSaving(true);
    setFailure('');
    try {
      await save(name);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="name-form" onSubmit={e => void submit(e)}>
      <label htmlFor="name-form-input">{label}</label>
      <div className="name-form-row">
        <input
          id="name-form-input"
          autoComplete="nickname"
          maxLength={24}
          value={typed}
          onChange={e => {
            setTyped(e.target.value);
            setFailure('');
          }}
        />
        <button className="button primary" disabled={busy || saving || !name || name === initial || !!problem}>
          Save
        </button>
      </div>
      {problem && (
        <p role="alert" className="inline-alert">
          {problem}
        </p>
      )}
    </form>
  );
}

/** Change your name in the room you are in. */
export default function NameDialog({
  view,
  busy,
  save,
  close,
}: {
  view: GameView;
  busy: boolean;
  save: (name: string) => void;
  close: () => void;
}) {
  const members = [...view.players, ...view.spectators];
  const self = members.find(member => member.id === view.selfId);
  if (!self) return null;
  return (
    <GameDialog title="Change your name" close={close}>
      <NameForm
        label="Your name"
        initial={self.name}
        busy={busy}
        isTaken={name => nameTaken(members, name, self.id)}
        save={name => {
          save(name);
          close();
        }}
      />
    </GameDialog>
  );
}
