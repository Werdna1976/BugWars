// Background music. Tracks by Kevin MacLeod (incompetech.com), licensed under
// Creative Commons: By Attribution 4.0 (http://creativecommons.org/licenses/by/4.0/).
// See CREDITS.md.
//   match.mp3:    "Monkeys Spinning Monkeys"
//   overtime.mp3: "Pixel Peeker Polka - faster"

const VOLUME = 0.35;
const FADE_MS = 800;

function track(file: string): HTMLAudioElement {
  const a = new Audio(`music/${file}`);
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  return a;
}

export class Music {
  private tracks: Record<'match' | 'overtime', HTMLAudioElement> | null = null;
  private current: 'match' | 'overtime' = 'match';
  private fades = new Map<HTMLAudioElement, number>();
  private started = false;
  muted = false;

  // Browsers only allow audio after a user gesture, so call this from a click.
  start() {
    this.tracks ??= { match: track('match.mp3'), overtime: track('overtime.mp3') };
    if (this.started) return;
    this.started = true;
    this.play(this.current);
  }

  // Switches to the overtime track (or back), crossfading between them.
  setIntense(on: boolean) {
    const next = on ? 'overtime' : 'match';
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    if (!this.tracks || !this.started) return;
    this.fade(this.tracks[prev], 0, () => this.tracks![prev].pause());
    this.play(next);
  }

  // Restart from the top for a new match.
  reset() {
    if (this.tracks) for (const a of Object.values(this.tracks)) a.currentTime = 0;
    this.setIntense(false);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.tracks) this.fade(this.tracks[this.current], this.muted ? 0 : VOLUME);
    return this.muted;
  }

  private play(name: 'match' | 'overtime') {
    const a = this.tracks![name];
    void a.play().catch(() => {
      // Autoplay refused or file missing: stay silent.
    });
    this.fade(a, this.muted ? 0 : VOLUME);
  }

  private fade(a: HTMLAudioElement, to: number, done?: () => void) {
    window.clearInterval(this.fades.get(a));
    const from = a.volume;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      a.volume = from + (to - from) * k;
      if (k === 1) {
        window.clearInterval(id);
        this.fades.delete(a);
        done?.();
      }
    }, 30);
    this.fades.set(a, id);
  }
}

// One shared instance so music keeps playing across "Play again".
export const music = new Music();
