import type { SynthPreset } from '../types/music';

/**
 * Polyphonic generative ambient synthesizer routed through the shared
 * Web Audio EQ & Analyser graph for zero-latency live streaming channels.
 */
export class AuraSynthEngine {
  private ctx: AudioContext | null = null;
  private destination: AudioNode | null = null;
  private masterGain: GainNode | null = null;
  private timerId: number | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private activeNodes: AudioNode[] = [];
  private step = 0;

  public start(ctx: AudioContext, destination: AudioNode, preset: SynthPreset): void {
    this.stop();
    this.ctx = ctx;
    this.destination = destination;
    this.step = 0;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 1.4);
    master.connect(destination);
    this.masterGain = master;

    if (preset === 'rain-rhodes') {
      this.startRainBed(ctx, master);
      this.triggerRhodesStep();
      this.timerId = window.setInterval(() => this.triggerRhodesStep(), 2400);
    } else {
      this.triggerTapeStep();
      this.timerId = window.setInterval(() => this.triggerTapeStep(), 3200);
    }
  }

  public stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch {
        // ignore
      }
      this.noiseSource = null;
    }
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), this.ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.2);
      } catch {
        // ignore
      }
      const oldMaster = this.masterGain;
      window.setTimeout(() => {
        try {
          oldMaster.disconnect();
        } catch {
          // ignore
        }
      }, 240);
      this.masterGain = null;
    }
    this.activeNodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    });
    this.activeNodes = [];
    this.destination = null;
  }

  private startRainBed(ctx: AudioContext, target: AudioNode): void {
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Soft pink/brownian rain texture
      lastOut = (lastOut + 0.03 * white) / 1.03;
      data[i] = lastOut * 2.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.7;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.08;

    noise.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(target);
    noise.start();

    this.noiseSource = noise;
    this.activeNodes.push(filter, rainGain);
  }

  private triggerRhodesStep(): void {
    if (!this.ctx || !this.masterGain) return;
    const chords = [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0], // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 349.23], // G6/7
    ];
    const chord = chords[this.step % chords.length];
    this.step++;

    const now = this.ctx.currentTime;
    chord.forEach((freq, idx) => {
      this.playElectricPianoNote(freq, now + idx * 0.14, 2.2, 0.13);
    });
    // Gentle top melody note
    const topNote = chord[(this.step + 1) % chord.length] * 2;
    this.playElectricPianoNote(topNote, now + 1.1, 1.8, 0.07);
  }

  private triggerTapeStep(): void {
    if (!this.ctx || !this.masterGain) return;
    const pads = [
      [146.83, 220.0, 293.66, 349.23], // Dm9
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
      [116.54, 174.61, 220.0, 293.66], // Bbmaj7
      [110.0, 164.81, 220.0, 261.63], // Am7
    ];
    const chord = pads[this.step % pads.length];
    this.step++;

    const now = this.ctx.currentTime;
    chord.forEach((freq, idx) => {
      this.playWarmPadNote(freq, now + idx * 0.08, 3.4, 0.11);
    });
  }

  private playElectricPianoNote(freq: number, startTime: number, duration: number, level: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const overtone = this.ctx.createOscillator();
    const overtoneGain = this.ctx.createGain();
    const env = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2, startTime);
    overtoneGain.gain.setValueAtTime(0.18, startTime);
    overtoneGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, startTime);
    filter.frequency.exponentialRampToValueAtTime(650, startTime + duration);

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(level, startTime + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    overtone.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    osc.start(startTime);
    overtone.start(startTime);
    osc.stop(startTime + duration + 0.05);
    overtone.stop(startTime + duration + 0.05);
  }

  private playWarmPadNote(freq: number, startTime: number, duration: number, level: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    // Subtle analog tape wow/flutter
    lfo.frequency.value = 0.6;
    lfoGain.gain.value = 1.4;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filter.type = 'lowpass';
    filter.frequency.value = 820;

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(level, startTime + 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    osc.start(startTime);
    lfo.start(startTime);
    osc.stop(startTime + duration + 0.05);
    lfo.stop(startTime + duration + 0.05);
  }
}
