import type { RecordingStatus } from '../../../shared/types';
import type { RecordingChoice } from '../../hooks/useRoom';

/**
 * Saving the game for bot training: the host opts in; once they have, anyone else may opt out.
 * Each person's two choices are remembered for their next room.
 */
export default function SaveGames({
  host,
  recording,
  disabled,
  choose,
}: {
  host: boolean;
  recording: RecordingStatus;
  disabled: boolean;
  choose: (kind: RecordingChoice, value: boolean) => void;
}) {
  if (!host && !recording.hostSaves) return null;
  return (
    <div className="save-games">
      <label>
        <input
          type="checkbox"
          checked={host ? recording.mine : recording.declined}
          disabled={disabled}
          onChange={e => choose(host ? 'consent' : 'decline', e.target.checked)}
        />
        {host ? 'Save my game to improve bots' : 'Don’t use this game to improve bots'}
      </label>
      <small>Keeps moves, dice, and results. Not names or chat.</small>
      <small>{saveNote(host, recording)}</small>
    </div>
  );
}

/** What will happen to this game, in one line. */
function saveNote(host: boolean, recording: RecordingStatus): string {
  if (recording.on) return 'This game will be saved for bot training.';
  if (host && recording.mine) return 'A player opted out, so this game won’t be saved.';
  if (!host && !recording.declined) return 'The host is saving this game. Any player can opt out.';
  return 'This game won’t be saved.';
}
