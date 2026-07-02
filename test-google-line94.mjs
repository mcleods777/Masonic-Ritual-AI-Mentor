import { parseDialogue } from "/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/dialogue-format.ts";
import fs from "node:fs";

const envContent = fs.readFileSync("/home/mcleods777/Masonic-Ritual-AI-Mentor/.env", "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
if (!apiKey) { console.error("No GOOGLE_CLOUD_TTS_API_KEY"); process.exit(1); }
console.log("Using TTS key:", apiKey.slice(0, 14) + "... (length", apiKey.length + ")");

const src = fs.readFileSync("/home/mcleods777/Masonic-Ritual-AI-Mentor/rituals/ea-closing-dialogue.md", "utf-8");
const doc = parseDialogue(src);
const items = doc.nodes.filter((n) => n.kind === "line" || n.kind === "cue");
const line94 = items[93];
console.log("Line 94 length:", line94.text.length, "chars, speaker:", line94.speaker);

async function tryTts(name, text, voice) {
  console.log(`\n=== ${name} (${text.length} chars, voice=${voice}) ===`);
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "en-US", name: voice },
        audioConfig: { audioEncoding: "OGG_OPUS" },
      }),
    },
  );
  console.log("HTTP:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.log("Error:", body.slice(0, 400));
    return;
  }
  const json = await res.json();
  const bytes = Buffer.from(json.audioContent, "base64");
  const mm = await import("music-metadata");
  const meta = await mm.parseBuffer(bytes, { mimeType: "audio/ogg" });
  const ms = Math.round((meta.format.duration || 0) * 1000);
  console.log("Audio bytes:", bytes.length, " Duration:", ms, "ms");
}

await tryTts("TEST 1: full line 94", line94.text, "en-US-Neural2-J");
const sentence1 = line94.text.split(/(?<=excess\.) /)[0];
const sentence2 = line94.text.slice(sentence1.length).trim();
await tryTts("TEST 2: sentence 1 only", sentence1, "en-US-Neural2-J");
await tryTts("TEST 3: sentence 2 only", sentence2, "en-US-Neural2-J");
await tryTts("TEST 4: hello world (control)", "hello world", "en-US-Neural2-J");
