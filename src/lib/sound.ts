// A soft two-note chime for "your turn". Uses Web Audio, so there are no sound files.
const STORAGE_KEY = 'islanders:sound';
let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* The choice lasts for this visit. */
  }
  if (on) unlockAudio();
}

/** Browsers only allow audio after a user gesture; call this from one (e.g. first tap). */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') return;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
}

/** Two quiet sine notes a fifth apart, with slow fades so nothing clicks. */
export function playTurnChime(): void {
  if (!soundEnabled() || !context || context.state !== 'running') return;
  const start = context.currentTime + 0.02;
  for (const [index, frequency] of [587.33, 880].entries()) {
    const at = start + index * 0.16;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.07, at + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 1.2);
  }
}
