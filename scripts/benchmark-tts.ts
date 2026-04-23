/**
 * TTS API Benchmark Script
 *
 * Measures response time (TTFB + total) for each configured TTS engine.
 * Run: npx tsx scripts/benchmark-tts.ts [base-url]
 *
 * Default base URL: http://localhost:3000
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";
const TEST_TEXT = "Brethren, the lodge is now open for the transaction of business.";

interface BenchmarkResult {
  engine: string;
  voice: string;
  ttfbMs: number;
  totalMs: number;
  sizeBytes: number;
  status: number;
  error?: string;
}

async function benchmarkEndpoint(
  engine: string,
  voice: string,
  url: string,
  body: Record<string, unknown>
): Promise<BenchmarkResult> {
  const start = performance.now();
  let ttfb = 0;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    ttfb = performance.now() - start;

    const buffer = await resp.arrayBuffer();
    const total = performance.now() - start;

    return {
      engine,
      voice,
      ttfbMs: Math.round(ttfb),
      totalMs: Math.round(total),
      sizeBytes: buffer.byteLength,
      status: resp.status,
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
    };
  } catch (err) {
    return {
      engine,
      voice,
      ttfbMs: Math.round(ttfb || performance.now() - start),
      totalMs: Math.round(performance.now() - start),
      sizeBytes: 0,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getAvailableEngines(): Promise<Record<string, boolean>> {
  const resp = await fetch(`${BASE_URL}/api/tts/engines`);
  return resp.json();
}

async function main() {
  console.log(`\nTTS Benchmark — ${BASE_URL}`);
  console.log(`Test text: "${TEST_TEXT}"\n`);

  // Check which engines are available
  let engines: Record<string, boolean>;
  try {
    engines = await getAvailableEngines();
  } catch {
    console.error(`Cannot reach ${BASE_URL}/api/tts/engines — is the dev server running?`);
    process.exit(1);
  }

  console.log("Available engines:", Object.entries(engines).filter(([, v]) => v).map(([k]) => k).join(", "));
  console.log("");

  const results: BenchmarkResult[] = [];

  // Deepgram Aura-2
  if (engines.deepgram) {
    const voices = ["aura-2-zeus-en", "aura-2-orion-en", "aura-2-arcas-en", "aura-2-orpheus-en", "aura-2-apollo-en", "aura-2-hermes-en", "aura-2-atlas-en"];
    for (const voice of voices) {
      process.stdout.write(`  Deepgram ${voice}...`);
      const r = await benchmarkEndpoint("deepgram", voice, `${BASE_URL}/api/tts/deepgram`, { text: TEST_TEXT, model: voice });
      results.push(r);
      console.log(r.error ? ` ERROR: ${r.error}` : ` ${r.ttfbMs}ms TTFB, ${r.totalMs}ms total, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
    }
  }

  // ElevenLabs
  if (engines.elevenlabs) {
    const voices = [
      { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
      { id: "nPczCjzI2devNBz1zQrb", name: "Brian" },
      { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
    ];
    for (const v of voices) {
      process.stdout.write(`  ElevenLabs ${v.name}...`);
      const r = await benchmarkEndpoint("elevenlabs", v.name, `${BASE_URL}/api/tts/elevenlabs`, { text: TEST_TEXT, voiceId: v.id });
      results.push(r);
      console.log(r.error ? ` ERROR: ${r.error}` : ` ${r.ttfbMs}ms TTFB, ${r.totalMs}ms total, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
    }
  }

  // Google Cloud TTS
  if (engines.google) {
    const voices = [
      { name: "en-US-Neural2-D", label: "Neural2-D" },
      { name: "en-US-Neural2-A", label: "Neural2-A" },
    ];
    for (const v of voices) {
      process.stdout.write(`  Google ${v.label}...`);
      const r = await benchmarkEndpoint("google", v.label, `${BASE_URL}/api/tts/google`, { text: TEST_TEXT, voice: v.name });
      results.push(r);
      console.log(r.error ? ` ERROR: ${r.error}` : ` ${r.ttfbMs}ms TTFB, ${r.totalMs}ms total, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
    }
  }

  // Voxtral (free tier — needs ref_audio from a Deepgram sample)
  if (engines.voxtral) {
    process.stdout.write(`  Voxtral (fetching ref_audio)...`);
    try {
      const cloneResp = await fetch(`${BASE_URL}/api/tts/voxtral/clone-aura`, { method: "POST" });
      const cloneData = await cloneResp.json() as { voices: Array<{ name: string; audioBase64: string; status: string }> };
      const sample = cloneData.voices?.find((v: { status: string }) => v.status === "ok");
      if (sample) {
        console.log(` got ${sample.name}`);
        process.stdout.write(`  Voxtral ${sample.name} (ref_audio)...`);
        const r = await benchmarkEndpoint("voxtral", sample.name, `${BASE_URL}/api/tts/voxtral`, { text: TEST_TEXT, refAudio: sample.audioBase64 });
        results.push(r);
        console.log(r.error ? ` ERROR: ${r.error}` : ` ${r.ttfbMs}ms TTFB, ${r.totalMs}ms total, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
      } else {
        console.log(` no samples available`);
      }
    } catch (err) {
      console.log(` ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Kokoro (self-hosted)
  if (engines.kokoro) {
    process.stdout.write(`  Kokoro...`);
    const r = await benchmarkEndpoint("kokoro", "default", `${BASE_URL}/api/tts/kokoro`, { text: TEST_TEXT });
    results.push(r);
    console.log(r.error ? ` ERROR: ${r.error}` : ` ${r.ttfbMs}ms TTFB, ${r.totalMs}ms total, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
  }

  // Transcription (Groq Whisper) — measure just the API route response
  process.stdout.write(`  Groq Whisper (transcribe, empty)...`);
  const transcribeStart = performance.now();
  try {
    const resp = await fetch(`${BASE_URL}/api/transcribe`, { method: "POST", body: new FormData() });
    const transcribeTime = Math.round(performance.now() - transcribeStart);
    console.log(resp.ok ? ` ${transcribeTime}ms` : ` ${transcribeTime}ms (${resp.status})`);
  } catch (err) {
    console.log(` ERROR: ${err instanceof Error ? err.message : err}`);
  }

  // Summary table
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(
    "Engine".padEnd(14) +
    "Voice".padEnd(20) +
    "TTFB".padStart(8) +
    "Total".padStart(8) +
    "Size".padStart(10) +
    "Status".padStart(8)
  );
  console.log("-".repeat(80));

  for (const r of results) {
    console.log(
      r.engine.padEnd(14) +
      r.voice.padEnd(20) +
      `${r.ttfbMs}ms`.padStart(8) +
      `${r.totalMs}ms`.padStart(8) +
      `${(r.sizeBytes / 1024).toFixed(1)}KB`.padStart(10) +
      (r.error || `${r.status}`).padStart(8)
    );
  }

  // Per-engine averages
  console.log("-".repeat(80));
  const engineGroups = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!r.error) {
      const group = engineGroups.get(r.engine) || [];
      group.push(r);
      engineGroups.set(r.engine, group);
    }
  }

  for (const [engine, group] of engineGroups) {
    const avgTtfb = Math.round(group.reduce((s, r) => s + r.ttfbMs, 0) / group.length);
    const avgTotal = Math.round(group.reduce((s, r) => s + r.totalMs, 0) / group.length);
    console.log(`${engine.padEnd(14)}${"AVG".padEnd(20)}${`${avgTtfb}ms`.padStart(8)}${`${avgTotal}ms`.padStart(8)}`);
  }

  console.log("=".repeat(80));
}

main().catch(console.error);
