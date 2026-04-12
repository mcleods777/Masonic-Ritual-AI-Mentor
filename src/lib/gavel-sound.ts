/**
 * Gavel knock sound player using the Web Audio API.
 *
 * Plays a recorded gavel sample (/public/sounds/gavel.mp3) pitch-shifted
 * to a deeper tone via playbackRate. The sample is a CC0 recording from
 * BigSoundBank (https://bigsoundbank.com/gavel-1-blow-s1588.html).
 *
 * Previous approach used oscillator synthesis (sine + noise + click) which
 * was technically correct but sounded like "the computer glitched" rather
 * than a wooden knock. A real recording played at lower pitch is instantly
 * recognizable as a gavel.
 */

let audioCtx: AudioContext | null = null;
let gavelBuffer: AudioBuffer | null = null;
let bufferLoadPromise: Promise<AudioBuffer | null> | null = null;

/**
 * Pitch multiplier for the gavel sample. Lower = deeper.
 *   1.0 = original recording pitch
 *   0.7 = noticeably deeper, still sounds like wood
 *   0.5 = very deep, almost timpani-like
 * Tune this until the sound matches your lodge's gavel.
 */
const GAVEL_PITCH = 0.7;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Create and resume the AudioContext during a user gesture (click, tap, key).
 *
 * Browsers enforce that AudioContext can only transition from "suspended" to
 * "running" during the synchronous call stack of a user gesture. If you
 * create/resume the context later (e.g., from a useEffect or setTimeout),
 * the browser silently blocks it.
 *
 * Call this from any click handler that precedes audio playback (e.g., the
 * "Start Rehearsal" button). The later playGavelKnocks call from a useEffect
 * chain will then find the context already running and play immediately.
 *
 * Harmless to call multiple times — resume() on a running context is a no-op.
 */
export function warmAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  // Also start loading the gavel sample so it's ready when needed
  loadGavelBuffer();
}

/**
 * Lazily load and decode the gavel MP3 sample. Returns a cached
 * AudioBuffer for subsequent calls. Non-blocking — if the fetch is
 * still in flight when playGavelKnocks fires, it awaits the same promise.
 */
function loadGavelBuffer(): Promise<AudioBuffer | null> {
  if (gavelBuffer) return Promise.resolve(gavelBuffer);
  if (bufferLoadPromise) return bufferLoadPromise;

  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve(null);

  bufferLoadPromise = fetch("/sounds/gavel.mp3")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load gavel.mp3: ${res.status}`);
      return res.arrayBuffer();
    })
    .then((arrayBuf) => ctx.decodeAudioData(arrayBuf))
    .then((decoded) => {
      gavelBuffer = decoded;
      return decoded;
    })
    .catch((err) => {
      console.warn("Could not load gavel sound:", err);
      bufferLoadPromise = null; // allow retry on next call
      return null;
    });

  return bufferLoadPromise;
}

/**
 * Play a single gavel knock at the given start time using the loaded sample.
 * The sample is pitch-shifted via playbackRate for a deeper tone.
 */
function playKnock(ctx: AudioContext, buffer: AudioBuffer, startTime: number): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = GAVEL_PITCH;

  // Slightly boost volume to compensate for the pitch-shift
  const gain = ctx.createGain();
  gain.gain.value = 1.2;

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(startTime);
}

/**
 * Play N gavel knocks in sequence.
 * Knocks are spaced ~400ms apart for a deliberate, ceremonial feel.
 * The spacing is slightly longer than the old synthesis (350ms) because
 * the real sample has a natural decay tail.
 *
 * @param count Number of knocks (1, 2, or 3 typically)
 * @returns Promise that resolves when all knocks have finished
 */
export async function playGavelKnocks(count: number): Promise<void> {
  if (count <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (defensive — warmAudioContext should have
  // already done this from a user gesture, but belts + suspenders)
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  // Load the sample if not yet loaded
  const buffer = await loadGavelBuffer();
  if (!buffer) return; // failed to load — silent fallback

  const knockSpacing = 0.4; // seconds between knocks
  const now = ctx.currentTime + 0.05; // small future offset for reliability

  for (let i = 0; i < count; i++) {
    playKnock(ctx, buffer, now + i * knockSpacing);
  }

  // Wait for all knocks to finish. The sample duration at lower pitch is
  // longer than the original (divided by GAVEL_PITCH), plus spacing.
  const sampleDuration = buffer.duration / GAVEL_PITCH;
  const totalDuration = (count - 1) * knockSpacing + sampleDuration;
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
