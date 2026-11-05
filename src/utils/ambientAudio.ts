import { TimeMode, WeatherMode } from '../types/world';

const AUDIO_PREF_KEY = 'pocket_world_audio_enabled_v2';

export type SoundCueType = 'plant' | 'water' | 'harvest' | 'milestone' | 'build';

export class AmbientSoundscape {
  private ctx: AudioContext | null = null;
  private isEnabled = false;
  private volume = 0.32;

  private masterGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private leavesFilter: BiquadFilterNode | null = null;
  private leavesGain: GainNode | null = null;
  private cricketGain: GainNode | null = null;

  private cricketInterval: number | null = null;
  private currentWeather: WeatherMode = 'clear';
  private currentTimeOfDay = 0.24;
  private currentTimeMode: TimeMode = 'auto';

  constructor() {
    try {
      const saved = localStorage.getItem(AUDIO_PREF_KEY);
      if (saved === 'true') {
        this.isEnabled = true;
      }
    } catch {
      // Ignore storage error
    }
  }

  public setEnabled(enabled: boolean): boolean {
    this.isEnabled = enabled;
    try {
      localStorage.setItem(AUDIO_PREF_KEY, String(enabled));
    } catch {
      // Ignore storage error
    }

    if (enabled) {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      this.updateParameters(
        this.currentWeather,
        this.currentTimeOfDay,
        this.currentTimeMode,
      );
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.35);
      }
    } else if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    }
    return this.isEnabled;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0.0001, Math.min(1, vol)) * 0.45;
    if (this.isEnabled && this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.2);
    }
  }

  public update(
    _dayFactor: number,
    nightFactor: number,
    isRaining: boolean,
    isSnowing: boolean,
  ): void {
    const mode: WeatherMode = isSnowing ? 'snow' : isRaining ? 'rain' : 'clear';
    const timeOfDay = nightFactor > 0.35 ? 0.72 : 0.25;
    this.updateParameters(mode, timeOfDay, 'auto');
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public unlockOnUserInteraction(): void {
    if (!this.isEnabled) return;
    if (!this.ctx) {
      this.initContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.35);
    }
  }

  public playCue(type: SoundCueType): void {
    if (!this.isEnabled) return;
    this.unlockOnUserInteraction();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    if (type === 'water') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'plant' || type === 'build') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const base = type === 'plant' ? 440 : 392;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.25, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'harvest') {
      const notes = [523.25, 659.25];
      notes.forEach((freq, i) => {
        if (!this.ctx || !this.masterGain) return;
        const start = now + i * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } else if (type === 'milestone') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        if (!this.ctx || !this.masterGain) return;
        const start = now + i * 0.09;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(start);
        osc.stop(start + 0.45);
      });
    }
  }

  private initContext(): void {
    if (this.ctx) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    this.ctx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.0001;
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    const bufferSize = ctx.sampleRate * 4;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 2.4;

    const windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.14;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 140;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);

    const windGain = ctx.createGain();
    windGain.gain.value = 0.25;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);

    windSource.start();
    windLfo.start();

    this.windFilter = windFilter;
    this.windGain = windGain;

    const leavesSource = ctx.createBufferSource();
    leavesSource.buffer = noiseBuffer;
    leavesSource.loop = true;

    const leavesFilter = ctx.createBiquadFilter();
    leavesFilter.type = 'bandpass';
    leavesFilter.frequency.value = 1650;
    leavesFilter.Q.value = 1.6;

    const leavesLfo = ctx.createOscillator();
    leavesLfo.type = 'triangle';
    leavesLfo.frequency.value = 0.38;
    const leavesLfoGain = ctx.createGain();
    leavesLfoGain.gain.value = 350;
    leavesLfo.connect(leavesLfoGain);
    leavesLfoGain.connect(leavesFilter.frequency);

    const leavesGain = ctx.createGain();
    leavesGain.gain.value = 0.18;

    leavesSource.connect(leavesFilter);
    leavesFilter.connect(leavesGain);
    leavesGain.connect(masterGain);

    leavesSource.start(0, 1.3);
    leavesLfo.start();

    this.leavesFilter = leavesFilter;
    this.leavesGain = leavesGain;

    const cricketGain = ctx.createGain();
    cricketGain.gain.value = 0.0;
    cricketGain.connect(masterGain);
    this.cricketGain = cricketGain;

    this.cricketInterval = window.setInterval(() => {
      if (!this.isEnabled || !this.ctx || !this.cricketGain) return;
      if (this.cricketGain.gain.value < 0.02) return;
      if (Math.random() > 0.68) return;
      this.triggerCricketChirp();
    }, 950);
  }

  private triggerCricketChirp(): void {
    if (!this.ctx || !this.cricketGain) return;
    const now = this.ctx.currentTime;
    const pulseCount = 3 + Math.floor(Math.random() * 2);
    const baseFreq = 4150 + (Math.random() - 0.5) * 180;

    for (let i = 0; i < pulseCount; i++) {
      const start = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, start);
      osc.frequency.exponentialRampToValueAtTime(
        baseFreq * 1.03,
        start + 0.035,
      );

      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(0.09, start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.042);

      osc.connect(env);
      env.connect(this.cricketGain);

      osc.start(start);
      osc.stop(start + 0.045);
    }
  }

  public updateParameters(
    weather: WeatherMode,
    timeOfDay: number,
    timeMode: TimeMode,
  ): void {
    this.currentWeather = weather;
    this.currentTimeOfDay = timeOfDay;
    this.currentTimeMode = timeMode;

    if (
      !this.ctx ||
      !this.windFilter ||
      !this.windGain ||
      !this.leavesFilter ||
      !this.leavesGain ||
      !this.cricketGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;

    const isNight =
      timeMode === 'night' ||
      timeMode === 'twilight' ||
      (timeMode === 'auto' && (timeOfDay > 0.52 || timeOfDay < 0.06));

    if (weather === 'snow') {
      this.windFilter.frequency.setTargetAtTime(480, now, 0.8);
      this.windFilter.Q.setTargetAtTime(4.2, now, 0.8);
      this.windGain.gain.setTargetAtTime(0.45, now, 0.8);

      this.leavesFilter.frequency.setTargetAtTime(1100, now, 0.8);
      this.leavesGain.gain.setTargetAtTime(0.05, now, 0.8);

      this.cricketGain.gain.setTargetAtTime(0.0, now, 0.5);
    } else if (weather === 'rain') {
      this.windFilter.frequency.setTargetAtTime(340, now, 0.8);
      this.windFilter.Q.setTargetAtTime(1.8, now, 0.8);
      this.windGain.gain.setTargetAtTime(0.32, now, 0.8);

      this.leavesFilter.frequency.setTargetAtTime(2200, now, 0.8);
      this.leavesFilter.Q.setTargetAtTime(0.9, now, 0.8);
      this.leavesGain.gain.setTargetAtTime(0.42, now, 0.8);

      this.cricketGain.gain.setTargetAtTime(0.0, now, 0.5);
    } else {
      this.windFilter.frequency.setTargetAtTime(260, now, 0.8);
      this.windFilter.Q.setTargetAtTime(2.2, now, 0.8);
      this.windGain.gain.setTargetAtTime(isNight ? 0.16 : 0.24, now, 0.8);

      this.leavesFilter.frequency.setTargetAtTime(1750, now, 0.8);
      this.leavesFilter.Q.setTargetAtTime(1.8, now, 0.8);
      this.leavesGain.gain.setTargetAtTime(isNight ? 0.12 : 0.26, now, 0.8);

      this.cricketGain.gain.setTargetAtTime(isNight ? 0.55 : 0.0, now, 0.8);
    }
  }

  public dispose(): void {
    if (this.cricketInterval !== null) {
      clearInterval(this.cricketInterval);
      this.cricketInterval = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
