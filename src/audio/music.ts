// Light procedural background music built from Web Audio oscillators, so the
// game ships without audio files. Calm loop during the match; faster, with an
// arpeggio and a beat, in overtime.

const CHORDS = [
  [48, 52, 55], // C
  [45, 48, 52], // Am
  [41, 45, 48], // F
  [43, 47, 50], // G
];
const PENTATONIC = [60, 62, 64, 67, 69, 72, 74, 76];
// Melody rhythm per bar (16th-note steps that play) and a fixed contour, so it
// sounds composed rather than random.
const MELODY_STEPS = [0, 3, 6, 8, 10, 14];
const CONTOURS = [
  [2, 3, 4, 3, 2, 1],
  [0, 1, 2, 4, 3, 2],
  [5, 4, 3, 2, 3, 4],
  [3, 2, 1, 0, 1, 2],
];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private intense = false;
  muted = false;

  // Browsers only allow audio after a user gesture, so call this from a click.
  start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.14;
      this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  setIntense(on: boolean) {
    this.intense = on;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.14, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private get stepSeconds() {
    const bpm = this.intense ? 138 : 96;
    return 60 / bpm / 4;
  }

  // Look ahead ~100ms and queue every 16th-note step that falls in that window.
  private schedule() {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 0.1) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepSeconds;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];

    if (s === 0 || s === 8) this.tone(midiHz(chord[0] - 12), t, 0.45, 'triangle', 0.5);
    if (s === 0) for (const n of chord) this.tone(midiHz(n), t, this.stepSeconds * 15, 'sine', 0.09);

    const mi = MELODY_STEPS.indexOf(s);
    if (mi >= 0) this.tone(midiHz(PENTATONIC[CONTOURS[bar][mi]]), t, 0.22, 'triangle', 0.22);

    if (this.intense) {
      // Rolling arpeggio, a soft kick on the beat and hi-hats on the off-beats.
      this.tone(midiHz(chord[s % 3] + 12), t, 0.09, 'square', 0.035);
      if (s % 4 === 0) this.kick(t);
      if (s % 4 === 2) this.hat(t);
    } else if (s % 8 === 4) {
      this.hat(t, 0.05);
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private hat(t: number, vol = 0.08) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + 0.06);
  }
}

// One shared instance so music keeps playing across "Play again".
export const music = new Music();
