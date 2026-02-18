/**
 * Gavel knock sound synthesizer using the Web Audio API.
 * Generates a percussive wooden knock — no audio files needed.
 *
 * Uses a short low-frequency oscillator burst with rapid exponential
 * decay, layered with filtered noise for a "wood" character.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Play a single gavel knock.
 * Duration ~120ms — a short, sharp percussive "tok".
 */
function playKnock(ctx: AudioContext, startTime: number): void {
  const duration = 0.12;

  // --- Layer 1: Low-frequency "thump" ---
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, startTime);
  osc.frequency.exponentialRampToValueAtTime(60, startTime + duration);
  oscGain.gain.setValueAtTime(0.6, startTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);

  // --- Layer 2: Filtered noise for "wood" texture ---
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(800, startTime);
  bandpass.Q.setValueAtTime(2, startTime);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.4, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.8);

  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(startTime);
  noise.stop(startTime + duration);

  // --- Layer 3: Higher "click" attack transient ---
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = "square";
  click.frequency.setValueAtTime(1200, startTime);
  click.frequency.exponentialRampToValueAtTime(200, startTime + 0.02);
  clickGain.gain.setValueAtTime(0.15, startTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03);
  click.connect(clickGain);
  clickGain.connect(ctx.destination);
  click.start(startTime);
  click.stop(startTime + 0.04);
}

/**
 * Play N gavel knocks in sequence.
 * Knocks are spaced ~350ms apart for a deliberate, ceremonial feel.
 *
 * @param count Number of knocks (1, 2, or 3 typically)
 * @returns Promise that resolves when all knocks have finished
 */
export async function playGavelKnocks(count: number): Promise<void> {
  if (count <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const knockSpacing = 0.35; // seconds between knocks
  const now = ctx.currentTime;

  for (let i = 0; i < count; i++) {
    playKnock(ctx, now + i * knockSpacing);
  }

  // Wait for all knocks to finish
  const totalDuration = (count - 1) * knockSpacing + 0.15; // last knock + decay
  return new Promise((resolve) =>
    setTimeout(resolve, totalDuration * 1000)
  );
}

/**
 * Count leading gavel marks (* or ***) from a ritual text line.
 * Returns the number of asterisks at the start of the text.
 *
 * Examples:
 *  "* Brother SW, proceed..."  → 1
 *  "***"                       → 3
 *  "Brother SW, proceed..."    → 0
 */
export function countGavelMarks(text: string): number {
  const match = text.match(/^\*{1,3}/);
  if (!match) return 0;

  // Make sure these aren't markdown bold markers (** followed by text then **)
  // Standalone gavel marks are: *, **, *** at the start, followed by space or end-of-string
  const afterStars = text.slice(match[0].length);
  if (afterStars.length > 0 && afterStars[0] !== " " && afterStars[0] !== "\n") {
    // Likely markdown bold (**text**), not gavel
    return 0;
  }

  return match[0].length;
}
