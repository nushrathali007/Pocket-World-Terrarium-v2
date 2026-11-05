class PeacefulSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.45;
  private ambientInterval: number | null = null;
  private ambientActive = false;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAmbient();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.volume;
  }

  public setAmbient(active: boolean) {
    this.ambientActive = active;
    if (active && this.enabled) {
      this.startAmbient();
    } else {
      this.stopAmbient();
    }
  }

  public isAmbientActive(): boolean {
    return this.ambientActive;
  }

  private startAmbient() {
    this.stopAmbient();
    const playGentleWindChime = () => {
      if (!this.enabled || !this.ambientActive) return;
      const pentatonic = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
      const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      this.playTone(freq, 1.4, 'sine', 0.08);
    };
    playGentleWindChime();
    this.ambientInterval = window.setInterval(playGentleWindChime, 4200);
  }

  private stopAmbient() {
    if (this.ambientInterval !== null) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainScale = 0.2,
    delaySec = 0,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const peak = Math.max(0.001, this.volume * gainScale);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playPlant() {
    this.playTone(329.63, 0.28, 'sine', 0.16, 0);
    this.playTone(440.0, 0.35, 'triangle', 0.14, 0.07);
  }

  public playWater() {
    this.playTone(523.25, 0.22, 'sine', 0.12, 0);
    this.playTone(659.25, 0.26, 'sine', 0.1, 0.06);
  }

  public playHarvest() {
    this.playTone(392.0, 0.32, 'triangle', 0.16, 0);
    this.playTone(493.88, 0.36, 'triangle', 0.16, 0.06);
    this.playTone(587.33, 0.48, 'sine', 0.18, 0.12);
  }

  public playBuild() {
    this.playTone(261.63, 0.24, 'triangle', 0.16, 0);
    this.playTone(392.0, 0.34, 'sine', 0.15, 0.05);
  }

  public playSelect() {
    this.playTone(440.0, 0.16, 'sine', 0.09, 0);
  }
}

export const soundEngine = new PeacefulSoundEngine();
