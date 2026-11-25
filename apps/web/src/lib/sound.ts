/**
 * Moteur audio Web Audio DSP inspiré de Stake & CS2 :
 * - Compresseur dynamique master (zéro saturation, son propre et chaleureux)
 * - Transitoires bruités filtrés (vrai bruit de carte, vrai clic mécanique de caisse CS2, vraie explosion sourde)
 * - Harmoniques cristallines sur gamme pentatonique pour Mines, Plinko, Cashouts & Drops Gold ★
 */

const PENTATONIC_RATIOS = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5, 3, 3.333, 4];

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public enabled = true;

  private ensureAudio(): { ctx: AudioContext; out: AudioNode } | null {
    if (!this.enabled || typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.75, this.ctx.currentTime);

      master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.masterGain = master;

      // Pré-générer 1 seconde de bruit blanc réutilisable (0 latence)
      const bufferSize = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.masterGain ? { ctx: this.ctx, out: this.masterGain } : null;
  }

  /**
   * Joue une impulsion de bruit filtré (pour clics mécaniques, cartes, explosions)
   */
  private playNoise(
    duration: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    volume: number,
    delay = 0
  ) {
    const audio = this.ensureAudio();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime + delay;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, now);
    filter.frequency.setValueAtTime(startFreq, now);
    if (endFreq !== startFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.004, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    src.start(now);
    src.stop(now + duration + 0.01);
  }

  /**
   * Joue une note cristalline de type marimba / cloche douce (fondamentale + harmonique)
   */
  private playBell(freq: number, duration: number, volume: number, delay = 0, shimmer = false) {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime + delay;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * (shimmer ? 2.004 : 2), now);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(volume, now + 0.006);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.linearRampToValueAtTime(volume * 0.22, now + 0.004);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.55);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(out);
    gain2.connect(out);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.02);
    osc2.stop(now + duration + 0.02);
  }

  /**
   * Vrai clic mécanique sec façon défilement de caisse CS2 / cran de roue
   */
  tick() {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;

    // Transitoire mécanique net (bruit passe-bande 2.8 kHz)
    this.playNoise(0.018, 'bandpass', 2800, 1600, 3.2, 0.22);

    // Petit corps boisé très court (15ms)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.016);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * Micro-clic UI discret et doux
   */
  click() {
    this.playNoise(0.012, 'bandpass', 2100, 1200, 2.0, 0.12);
    this.playBell(620, 0.035, 0.055);
  }

  /**
   * Frottement & claquement réaliste d'une carte tirée (Blackjack / HiLo)
   */
  card() {
    // Glissement de papier
    this.playNoise(0.065, 'bandpass', 1600, 3600, 1.4, 0.18, 0);
    // Petit claquement sur le tapis
    this.playNoise(0.022, 'lowpass', 900, 300, 1.0, 0.16, 0.045);
  }

  /**
   * Diamant Mines / Série HiLo : carillon cristallin qui monte sur une gamme pentatonique
   */
  diamond(step = 1) {
    const idx = Math.min(Math.max(0, step - 1), PENTATONIC_RATIOS.length - 1);
    const baseFreq = 523.25 * PENTATONIC_RATIOS[idx]; // Do5 pentatonique
    this.playBell(baseFreq, 0.28, 0.16, 0, true);
    this.playBell(baseFreq * 1.5, 0.18, 0.055, 0.025, false);
  }

  /**
   * Rebond Plinko ultra-doux façon marimba en verre
   */
  peg() {
    const notes = [880, 987.77, 1046.5, 1174.66, 1318.51];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    this.playBell(freq, 0.065, 0.055);
  }

  /**
   * Cashout / Victoire : accord majeur 9ème lumineux et soyeux (style Stake)
   */
  win() {
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    chord.forEach((freq, i) => {
      this.playBell(freq, 0.36, 0.13, i * 0.048, true);
    });
  }

  /**
   * Drop Rare / Couteau Gold ★ / Gros Upgrade : impact sub-bass + accord cinématique
   */
  legendaryDrop() {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;

    // Impact sub-bass profond
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.45);
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    sub.connect(subGain);
    subGain.connect(out);
    sub.start(now);
    sub.stop(now + 0.52);

    // Arpège doré ample et brillant
    const fanfare = [392.0, 523.25, 659.25, 783.99, 987.77, 1318.51];
    fanfare.forEach((freq, i) => {
      this.playBell(freq, 0.72, 0.13, 0.03 + i * 0.06, true);
    });
  }

  /**
   * Explosion / Crash / Défaite : coup sourd physique + souffle grave (zéro bip strident)
   */
  bust() {
    const audio = this.ensureAudio();
    if (!audio) return;
    const { ctx, out } = audio;
    const now = ctx.currentTime;

    // Coup sub-bass mat
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.28);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.32);

    // Souffle d'impact filtré passe-bas
    this.playNoise(0.32, 'lowpass', 480, 75, 0.9, 0.26);
  }
}

export const sound = new SoundManager();
