import { describe, it, expect } from "vitest";
import { normalizeAudio, encodeWav } from "../audio-utils";

// ============================================================
// normalizeAudio
// ============================================================

describe("normalizeAudio", () => {
  it("normalizes a loud signal down to target dB", () => {
    // Signal peaking at 1.0 (0 dB), normalize to -3 dB (≈0.708)
    const samples = new Float32Array([0.5, -1.0, 0.8, -0.3]);
    const normalized = normalizeAudio(samples, -3);

    // Peak should now be ~0.708
    let peak = 0;
    for (let i = 0; i < normalized.length; i++) {
      peak = Math.max(peak, Math.abs(normalized[i]));
    }
    expect(peak).toBeCloseTo(0.708, 2);
  });

  it("normalizes a quiet signal up to target dB", () => {
    // Signal peaking at 0.1, normalize to -3 dB (≈0.708)
    const samples = new Float32Array([0.05, -0.1, 0.08]);
    const normalized = normalizeAudio(samples, -3);

    let peak = 0;
    for (let i = 0; i < normalized.length; i++) {
      peak = Math.max(peak, Math.abs(normalized[i]));
    }
    expect(peak).toBeCloseTo(0.708, 2);
  });

  it("returns silence unchanged", () => {
    const silence = new Float32Array([0, 0, 0, 0]);
    const result = normalizeAudio(silence, -3);
    expect(result).toBe(silence); // same reference — no copy needed
  });

  it("preserves relative sample ratios", () => {
    const samples = new Float32Array([0.5, -1.0, 0.25]);
    const normalized = normalizeAudio(samples, -6); // -6 dB ≈ 0.5

    // Original ratio: sample[0] is half of sample[1]
    expect(Math.abs(normalized[0] / normalized[1])).toBeCloseTo(0.5, 2);
    // sample[2] is quarter of sample[1]
    expect(Math.abs(normalized[2] / normalized[1])).toBeCloseTo(0.25, 2);
  });

  it("handles single-sample input", () => {
    const samples = new Float32Array([0.3]);
    const normalized = normalizeAudio(samples, -3);
    expect(Math.abs(normalized[0])).toBeCloseTo(0.708, 2);
  });

  it("handles all-negative samples", () => {
    const samples = new Float32Array([-0.5, -0.2, -0.8]);
    const normalized = normalizeAudio(samples, -3);

    let peak = 0;
    for (let i = 0; i < normalized.length; i++) {
      peak = Math.max(peak, Math.abs(normalized[i]));
    }
    expect(peak).toBeCloseTo(0.708, 2);
    // All samples should still be negative
    for (let i = 0; i < normalized.length; i++) {
      expect(normalized[i]).toBeLessThan(0);
    }
  });
});

// ============================================================
// encodeWav
// ============================================================

describe("encodeWav", () => {
  it("produces valid WAV header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0]);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);

    // RIFF header
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)))
      .toBe("RIFF");
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)))
      .toBe("WAVE");

    // fmt chunk
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15)))
      .toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // data chunk
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39)))
      .toBe("data");
  });

  it("has correct file size", () => {
    const samples = new Float32Array(100);
    const buffer = encodeWav(samples, 44100);
    // 44 bytes header + 100 samples × 2 bytes each = 244 bytes
    expect(buffer.byteLength).toBe(244);
  });

  it("has correct data chunk size", () => {
    const samples = new Float32Array(50);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    // data chunk size at offset 40
    expect(view.getUint32(40, true)).toBe(100); // 50 samples × 2 bytes
  });

  it("has correct RIFF chunk size", () => {
    const samples = new Float32Array(50);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    // RIFF size = total - 8 = 44 + 100 - 8 = 136
    expect(view.getUint32(4, true)).toBe(136);
  });

  it("encodes positive samples as positive int16", () => {
    const samples = new Float32Array([1.0]); // max positive
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    // At offset 44 (first sample)
    expect(view.getInt16(44, true)).toBe(32767); // 0x7FFF
  });

  it("encodes negative samples as negative int16", () => {
    const samples = new Float32Array([-1.0]); // max negative
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(-32768); // -0x8000
  });

  it("encodes silence as zero", () => {
    const samples = new Float32Array([0.0]);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0);
  });

  it("clamps samples exceeding [-1, 1] range", () => {
    const samples = new Float32Array([2.0, -3.0]);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    // Should clamp to max/min int16
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("handles empty samples", () => {
    const samples = new Float32Array(0);
    const buffer = encodeWav(samples, 16000);
    // Just the 44-byte header
    expect(buffer.byteLength).toBe(44);
  });

  it("respects different sample rates", () => {
    const buffer44k = encodeWav(new Float32Array(1), 44100);
    const buffer16k = encodeWav(new Float32Array(1), 16000);
    const view44k = new DataView(buffer44k);
    const view16k = new DataView(buffer16k);
    expect(view44k.getUint32(24, true)).toBe(44100);
    expect(view16k.getUint32(24, true)).toBe(16000);
  });
});
