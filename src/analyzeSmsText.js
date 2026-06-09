/**
 * Pure function that analyzes an SMS message string and returns its encoding,
 * character count, segment count, segment size, and remaining characters.
 *
 * --- ENCODING DETECTION STRATEGY ---
 * We always prefer the most compact valid encoding, in this order:
 *   1. GSM   → if all characters are in the base GSM alphabet.
 *   2. Latin-1 → if all characters are within codepoints 0x00–0xFF.
 *   3. UCS2   → fallback for everything else (emoji, Arabic, smart quotes, etc.)
 *
 * A single character outside GSM forces the entire message into Latin-1 or UCS2.
 * A single character outside Latin-1 forces the entire message into UCS2.
 * This matches how SMS payloads are negotiated as a single encoding for the whole
 * message.
 *
 * --- CHARACTER COUNTING ---
 * We count user-visible characters (Unicode code points), not JavaScript string
 * length. This matters because JS uses UTF-16 internally, where characters outside
 * the Basic Multilingual Plane (emoji, some CJK) are represented as surrogate pairs
 * and would count as 2 with .length.
 *
 * We use Array.from(text) to iterate over code points safely.
 *
 * --- SEGMENT LIMITS (UDH-AWARE) ---
 * Single-segment messages use the larger payload size:
 *   GSM:    160
 *   Latin-1: 140
 *   UCS2:     80
 *
 * Multipart messages reserve space for the User Data Header (UDH), so each
 * segment shrinks to:
 *   GSM:    153
 *   Latin-1: 134
 *   UCS2:     67
 *
 * The returned `segmentSize` reflects the active size for the message, so a long
 * message reports the multipart capacity rather than the single-message capacity.
 *
 * --- EMPTY STRING BEHAVIOR ---
 * An empty string returns encoding: 'GSM', all counts at 0, and
 * remainingCharacters: 160. This represents a fresh, empty GSM composer state.
 */
import { isGSM7, isLatin1 } from "./gsm7Charset.js";

/**
 * Segment size limits per encoding.
 *
 * Each encoding exposes a single-message limit and a multipart limit so the
 * analyzer can switch between them when the message exceeds one segment.
 */
export const SEGMENT_SIZES = {
  GSM: { single: 160, multipart: 153 },
  "Latin-1": { single: 140, multipart: 134 },
  UCS2: { single: 80, multipart: 67 },
};

/**
 * Ensures the public API receives a string.
 *
 * Keeping the contract strict avoids silent coercion bugs and gives callers a
 * clear error when they pass unexpected data such as null, numbers, or objects.
 */
function assertStringInput(text) {
  if (typeof text !== "string") {
    throw new TypeError("analyzeSmsText(text) expects a string input");
  }
}

/**
 * Detects the most compact valid encoding for the given text.
 *
 * @param {string} text
 * @returns {'GSM' | 'Latin-1' | 'UCS2'}
 */
function detectEncoding(text) {
  if (isGSM7(text)) return "GSM";
  if (isLatin1(text)) return "Latin-1";
  return "UCS2";
}

/**
 * Counts visible characters using Unicode code points.
 *
 * This avoids treating emoji and other astral-plane characters as two
 * characters, which is what plain string length would do.
 */
function countCharacters(text) {
  return Array.from(text).length;
}

/**
 * Calculates SMS segment count and remaining room for the final segment.
 *
 * The function switches from single-segment capacity to multipart capacity once
 * the message exceeds the single-segment limit.
 */
function calculateSegments(characterCount, sizes) {
  const { single, multipart } = sizes;

  // Empty input is treated as an idle composer state, not a sent SMS.
  if (characterCount === 0) {
    return {
      segmentSize: single,
      segments: 0,
      remainingCharacters: single,
    };
  }

  // Messages that fit in one segment keep the larger single-message capacity.
  if (characterCount <= single) {
    return {
      segmentSize: single,
      segments: 1,
      remainingCharacters: single - characterCount,
    };
  }

  // Longer messages use the reduced multipart payload size because of UDH.
  const segments = Math.ceil(characterCount / multipart);

  return {
    segmentSize: multipart,
    segments,
    remainingCharacters: segments * multipart - characterCount,
  };
}

/**
 * Analyzes an SMS message string and returns its encoding metadata.
 *
 * The API stays intentionally small so it can be reused in tests, demos, or a
 * future UI without exposing internal encoding helpers.
 */
export function analyzeSmsText(text) {
  // Reject invalid input early so the caller gets a clear, predictable error.
  assertStringInput(text);

  // Choose the final encoding first because the segment limits depend on it.
  const encoding = detectEncoding(text);

  // Count visible characters for display and segment math.
  const characterCount = countCharacters(text);

  // Resolve the active segment size and remainder for the detected encoding.
  const { segmentSize, segments, remainingCharacters } = calculateSegments(
    characterCount,
    SEGMENT_SIZES[encoding],
  );

  return {
    encoding,
    characterCount,
    segmentSize,
    segments,
    remainingCharacters,
  };
}
