// Sound effects through Web Audio. Each effect loads from public/sfx/<name>.ogg
// (CC0 sounds, see CREDITS.md); anything missing falls back to a small synthesized
// sound so the game is never silent. Rapid repeats are throttled so a big fight
// doesn't turn into noise.

export type SfxName =
  | 'deploy' | 'bite' | 'thump' | 'hitNest' | 'seed' | 'honey' | 'spit' | 'spray' | 'blast' | 'hitTower'
  | 'squish' | 'crack' | 'towerFall' | 'nestWake' | 'click' | 'tick' | 'go' | 'victory' | 'defeat';

interface Spec {
  files: string[]; // variants, one picked at random
  volume: number;
  minGap: number; // seconds between plays of this sound
  pitch: number; // random playback-rate spread, e.g. 0.1 = ±10%
}

const SPECS: Record<SfxName, Spec> = {
  deploy: { files: ['deploy'], volume: 0.5, minGap: 0.05, pitch: 0.08 },
  bite: { files: ['bite1', 'bite2', 'bite3'], volume: 0.3, minGap: 0.06, pitch: 0.15 },
  thump: { files: ['thump1', 'thump2'], volume: 0.35, minGap: 0.1, pitch: 0.1 },
  hitNest: { files: ['hitNest1', 'hitNest2'], volume: 0.3, minGap: 0.09, pitch: 0.12 },
  seed: { files: ['seed'], volume: 0.2, minGap: 0.08, pitch: 0.1 },
  honey: { files: ['honey'], volume: 0.3, minGap: 0.1, pitch: 0.08 },
  spit: { files: ['spit'], volume: 0.3, minGap: 0.06, pitch: 0.12 },
  spray: { files: ['spray'], volume: 0.35, minGap: 0.08, pitch: 0.1 },
  blast: { files: ['blast'], volume: 0.5, minGap: 0.08, pitch: 0.1 },
  hitTower: { files: ['hitTower1', 'hitTower2'], volume: 0.22, minGap: 0.09, pitch: 0.12 },
  squish: { files: ['squish1', 'squish2'], volume: 0.4, minGap: 0.05, pitch: 0.15 },
  crack: { files: ['crack'], volume: 0.5, minGap: 0.3, pitch: 0.05 },
  towerFall: { files: ['towerFall'], volume: 0.75, minGap: 0.3, pitch: 0.05 },
  nestWake: { files: ['nestWake'], volume: 0.55, minGap: 0.5, pitch: 0 },
  click: { files: ['click'], volume: 0.4, minGap: 0.03, pitch: 0.05 },
  tick: { files: ['tick'], volume: 0.4, minGap: 0.2, pitch: 0 },
  go: { files: ['go'], volume: 0.6, minGap: 0.5, pitch: 0 },
  victory: { files: ['victory'], volume: 0.7, minGap: 1, pitch: 0 },
  defeat: { files: ['defeat'], volume: 0.7, minGap: 1, pitch: 0 },
};

const AMBIENCE_VOLUME = 0.22;

class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  private last = new Map<SfxName, number>();
  muted = false;

  // Call from a user gesture (browsers block audio until then).
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.8;
    this.out.connect(this.ctx.destination);
    for (const spec of Object.values(SPECS)) for (const f of spec.files) void this.load(f);
    void this.startAmbience();
  }

  // Quiet garden bed loop (crickets, breeze, the odd bird), synthesized for the game.
  private async startAmbience() {
    await this.load('ambience');
    const buf = this.buffers.get('ambience');
    if (!buf || !this.ctx || !this.out) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = AMBIENCE_VOLUME;
    src.connect(g).connect(this.out);
    src.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.out) this.out.gain.value = m ? 0 : 0.8;
  }

  private async load(file: string) {
    if (this.buffers.has(file) || !this.ctx) return;
    this.buffers.set(file, null);
    try {
      const res = await fetch(`sfx/${file}.ogg`);
      if (!res.ok) return;
      this.buffers.set(file, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      // Missing or undecodable: the synthesized fallback plays instead.
    }
  }

  // `pan` from -1 (left) to 1 (right); `gain` scales the effect's volume.
  play(name: SfxName, opts: { pan?: number; gain?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.out || this.muted) return;
    const spec = SPECS[name];
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < spec.minGap) return;
    this.last.set(name, now);
    const file = spec.files[Math.floor(Math.random() * spec.files.length)];
    const buf = this.buffers.get(file);
    const gain = ctx.createGain();
    // A little level variation so repeated hits don't sound stamped out.
    gain.gain.value = spec.volume * (opts.gain ?? 1) * (0.88 + Math.random() * 0.24);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0)) * 0.6;
    gain.connect(panner).connect(this.out);
    const rate = 1 + (Math.random() * 2 - 1) * spec.pitch;
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(gain);
      src.start();
    } else {
      synth(ctx, name, gain, rate);
    }
  }
}

// ---------- synthesized fallbacks ----------

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function synth(ctx: AudioContext, name: SfxName, out: AudioNode, rate: number) {
  const t = ctx.currentTime;
  const env = (node: AudioNode, attack: number, decay: number, peak = 1) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g).connect(out);
    return g;
  };
  const tone = (type: OscillatorType, f0: number, f1: number, dur: number, peak = 1, attack = 0.005) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * rate, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), t + dur);
    env(o, attack, dur, peak);
    o.start(t);
    o.stop(t + attack + dur + 0.02);
  };
  const noise = (dur: number, freq: number, q: number, peak = 1, type: BiquadFilterType = 'bandpass') => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq * rate;
    f.Q.value = q;
    src.connect(f);
    env(f, 0.004, dur, peak);
    src.start(t);
  };
  switch (name) {
    case 'deploy': noise(0.18, 600, 0.8, 0.8, 'lowpass'); tone('sine', 220, 110, 0.15, 0.5); break;
    case 'bite': noise(0.05, 2400, 2, 0.9); tone('square', 900, 300, 0.04, 0.2); break;
    case 'thump': tone('sine', 160, 60, 0.12, 0.9); noise(0.06, 500, 1, 0.5); break;
    case 'hitNest': noise(0.08, 900, 1.5, 0.7); break;
    case 'seed': tone('triangle', 900, 400, 0.06, 0.5); noise(0.04, 3000, 1, 0.3); break;
    case 'honey': tone('sine', 400, 180, 0.12, 0.6); break;
    case 'spit': noise(0.08, 1800, 3, 0.8); tone('sine', 700, 1200, 0.05, 0.3); break;
    case 'spray': noise(0.16, 1200, 1.2, 0.9); break;
    case 'blast': noise(0.4, 400, 0.7, 1, 'lowpass'); tone('sine', 120, 40, 0.35, 0.9); break;
    case 'hitTower': tone('triangle', 260, 140, 0.08, 0.6); noise(0.05, 1500, 2, 0.4); break;
    case 'squish': noise(0.12, 700, 2.5, 0.8); tone('sine', 300, 90, 0.1, 0.4); break;
    case 'crack': noise(0.25, 1800, 2, 0.8); break;
    case 'towerFall': noise(0.9, 250, 0.6, 1, 'lowpass'); tone('sine', 90, 30, 0.8, 1); break;
    case 'nestWake': for (let i = 0; i < 3; i++) tone('sawtooth', 180 + i * 7, 230 + i * 9, 0.7, 0.12, 0.15); break;
    case 'click': tone('square', 1500, 1200, 0.03, 0.25); break;
    case 'tick': tone('sine', 880, 880, 0.08, 0.4); break;
    case 'go': tone('triangle', 660, 990, 0.25, 0.6); break;
    case 'victory': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => synth(ctx, 'tick', out, f / 880), i * 130)); break;
    case 'defeat': [392, 330, 262].forEach((f, i) => setTimeout(() => synth(ctx, 'tick', out, f / 880), i * 180)); break;
  }
}

export const sfx = new Sfx();
