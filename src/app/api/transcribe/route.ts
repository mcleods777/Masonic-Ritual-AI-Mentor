/**
 * Speech-to-text API route using Groq's Whisper endpoint.
 * Accepts audio blobs from the browser and returns a transcript.
 */

export const maxDuration = 30;

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Masonic vocabulary prompt to improve recognition accuracy
const MASONIC_PROMPT = [
  "Masonic Lodge ritual ceremony.",
  "Worshipful Master, Senior Warden, Junior Warden,",
  "Senior Deacon, Junior Deacon, Tyler, Tiler, Secretary, Treasurer.",
  "Cowans and eavesdroppers. Duly tiled.",
  "So mote it be. Holy Saints John at Jerusalem.",
  "Plumb, square, compasses, gavel, trestle board.",
  "Entered Apprentice, Fellow Craft, Master Mason.",
  "Obligation, due guard, sign, token, grip.",
  "Meridian height. Profane. Brethren.",
  "Lodge assembled. Purgation. Colloquy.",
].join(" ");

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return Response.json(
        { error: "No audio file provided." },
        { status: 400 }
      );
    }

    // Forward to Groq Whisper API
    const groqForm = new FormData();
    groqForm.append("file", audioFile, "recording.webm");
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("language", "en");
    groqForm.append("prompt", MASONIC_PROMPT);
    groqForm.append("response_format", "json");
    groqForm.append("temperature", "0.0");

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqForm,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq Whisper API error:", response.status, errorText);
      return Response.json(
        { error: `Transcription failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return Response.json({ transcript: result.text || "" });
  } catch (error) {
    console.error("Transcribe route error:", error);
    return Response.json(
      { error: "Failed to process audio." },
      { status: 500 }
    );
  }
}
