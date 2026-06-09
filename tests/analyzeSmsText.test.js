import { analyzeSmsText } from '../src/analyzeSmsText.js';

/**
 * Small helper for building boundary cases without noisy literal strings.
 */
const repeat = (char, n) => char.repeat(n);

describe('analyzeSmsText', () => {
  // The public API should fail fast on non-string input instead of coercing.
  it('throws a TypeError for non-string input', () => {
    expect(() => analyzeSmsText(null)).toThrow(TypeError);
    expect(() => analyzeSmsText(undefined)).toThrow(TypeError);
    expect(() => analyzeSmsText(123)).toThrow(TypeError);
    expect(() => analyzeSmsText({ text: 'hello' })).toThrow(TypeError);
  });

  // Empty input should behave like a fresh composer with no sent segments.
  it('returns GSM defaults for empty text', () => {
    expect(analyzeSmsText('')).toEqual({
      encoding: 'GSM',
      characterCount: 0,
      segmentSize: 160,
      segments: 0,
      remainingCharacters: 160,
    });
  });

  // Basic GSM text should stay on the cheapest encoding and use the 160-char cap.
  it('detects normal GSM text', () => {
    expect(analyzeSmsText('Hello!')).toEqual({
      encoding: 'GSM',
      characterCount: 6,
      segmentSize: 160,
      segments: 1,
      remainingCharacters: 154,
    });
  });

  // Exact single-segment GSM boundaries should not force multipart sizing.
  it('keeps 160 GSM chars in one segment', () => {
    expect(analyzeSmsText(repeat('A', 160))).toEqual({
      encoding: 'GSM',
      characterCount: 160,
      segmentSize: 160,
      segments: 1,
      remainingCharacters: 0,
    });
  });

  // One extra GSM character should switch to multipart payload sizing.
  it('switches to multipart GSM sizing at 161 chars', () => {
    expect(analyzeSmsText(repeat('A', 161))).toEqual({
      encoding: 'GSM',
      characterCount: 161,
      segmentSize: 153,
      segments: 2,
      remainingCharacters: 145,
    });
  });

  // The exact two-segment boundary should end with zero remaining characters.
  it('uses UDH-aware GSM sizing for exact multipart boundaries', () => {
    expect(analyzeSmsText(repeat('A', 306))).toEqual({
      encoding: 'GSM',
      characterCount: 306,
      segmentSize: 153,
      segments: 2,
      remainingCharacters: 0,
    });
  });

  // The next character should start a third reduced-capacity segment.
  it('rolls over to a third GSM segment when needed', () => {
    expect(analyzeSmsText(repeat('A', 307))).toEqual({
      encoding: 'GSM',
      characterCount: 307,
      segmentSize: 153,
      segments: 3,
      remainingCharacters: 152,
    });
  });

  // Accented letters outside GSM should fall back to strict Latin-1.
  it('detects strict Latin-1 text that is not GSM', () => {
    expect(analyzeSmsText('ç')).toEqual({
      encoding: 'Latin-1',
      characterCount: 1,
      segmentSize: 140,
      segments: 1,
      remainingCharacters: 139,
    });
  });

  // Latin-1 single-segment boundaries should use the 140-character limit.
  it('keeps 140 Latin-1 chars in one segment', () => {
    expect(analyzeSmsText(repeat('ç', 140))).toEqual({
      encoding: 'Latin-1',
      characterCount: 140,
      segmentSize: 140,
      segments: 1,
      remainingCharacters: 0,
    });
  });

  // One extra Latin-1 character should switch to the multipart 134-char payload.
  it('switches to multipart Latin-1 sizing at 141 chars', () => {
    expect(analyzeSmsText(repeat('ç', 141))).toEqual({
      encoding: 'Latin-1',
      characterCount: 141,
      segmentSize: 134,
      segments: 2,
      remainingCharacters: 127,
    });
  });

  // The exact multipart Latin-1 boundary should fill two segments completely.
  it('uses UDH-aware Latin-1 sizing for exact multipart boundaries', () => {
    expect(analyzeSmsText(repeat('ç', 268))).toEqual({
      encoding: 'Latin-1',
      characterCount: 268,
      segmentSize: 134,
      segments: 2,
      remainingCharacters: 0,
    });
  });

  // The next Latin-1 character should spill into a third reduced-capacity segment.
  it('rolls over to a third Latin-1 segment when needed', () => {
    expect(analyzeSmsText(repeat('ç', 269))).toEqual({
      encoding: 'Latin-1',
      characterCount: 269,
      segmentSize: 134,
      segments: 3,
      remainingCharacters: 133,
    });
  });

  // Arabic text is outside GSM and Latin-1, so UCS2 is the correct fallback.
  it('falls back to UCS2 for Arabic', () => {
    expect(analyzeSmsText('مرحبا')).toEqual({
      encoding: 'UCS2',
      characterCount: 5,
      segmentSize: 80,
      segments: 1,
      remainingCharacters: 75,
    });
  });

  // Curly quotes are a common trap because they are not GSM or Latin-1.
  it('falls back to UCS2 for smart quotes', () => {
    expect(analyzeSmsText('“Hello”')).toEqual({
      encoding: 'UCS2',
      characterCount: 7,
      segmentSize: 80,
      segments: 1,
      remainingCharacters: 73,
    });
  });

  // Emoji should count as one visible character while still forcing UCS2.
  it('counts emoji as one visible character and uses UCS2', () => {
    expect(analyzeSmsText('😊')).toEqual({
      encoding: 'UCS2',
      characterCount: 1,
      segmentSize: 80,
      segments: 1,
      remainingCharacters: 79,
    });
  });

  // UCS2 should use the 80-character single-segment limit and 67-char multipart limit.
  it('switches to multipart UCS2 sizing at 81 chars', () => {
    expect(analyzeSmsText(repeat('😊', 81))).toEqual({
      encoding: 'UCS2',
      characterCount: 81,
      segmentSize: 67,
      segments: 2,
      remainingCharacters: 53,
    });
  });

  // The exact multipart UCS2 boundary should fill two segments completely.
  it('uses UDH-aware UCS2 sizing for exact multipart boundaries', () => {
    expect(analyzeSmsText(repeat('😊', 134))).toEqual({
      encoding: 'UCS2',
      characterCount: 134,
      segmentSize: 67,
      segments: 2,
      remainingCharacters: 0,
    });
  });

  // One more UCS2 character should move the message into a third segment.
  it('rolls over to a third UCS2 segment when needed', () => {
    expect(analyzeSmsText(repeat('😊', 135))).toEqual({
      encoding: 'UCS2',
      characterCount: 135,
      segmentSize: 67,
      segments: 3,
      remainingCharacters: 66,
    });
  });

  // Mixed GSM and Latin-1 text should use Latin-1 if it still fits the range.
  it('treats mixed GSM plus non-GSM text as Latin-1 when possible', () => {
    expect(analyzeSmsText('Aç')).toEqual({
      encoding: 'Latin-1',
      characterCount: 2,
      segmentSize: 140,
      segments: 1,
      remainingCharacters: 138,
    });
  });

  // Any emoji in the message forces the whole payload into UCS2.
  it('treats mixed Latin-1 plus emoji as UCS2', () => {
    expect(analyzeSmsText('A😊')).toEqual({
      encoding: 'UCS2',
      characterCount: 2,
      segmentSize: 80,
      segments: 1,
      remainingCharacters: 78,
    });
  });

  // Characters intentionally excluded from the base GSM alphabet should not be
  // classified as GSM, which keeps the scope aligned with the agreed rules.
  it.each([
    ['€', 'UCS2'],
    ['[', 'Latin-1'],
    ['{', 'Latin-1'],
    ['^', 'Latin-1'],
    ['|', 'Latin-1'],
    ['~', 'Latin-1'],
  ])('routes %s out of GSM as %s', (text, expectedEncoding) => {
    expect(analyzeSmsText(text).encoding).toBe(expectedEncoding);
  });

  // The public API should always return the same five fields.
  it('returns the expected shape for all results', () => {
    const result = analyzeSmsText('test');

    expect(result).toHaveProperty('encoding');
    expect(result).toHaveProperty('characterCount');
    expect(result).toHaveProperty('segmentSize');
    expect(result).toHaveProperty('segments');
    expect(result).toHaveProperty('remainingCharacters');
  });
});
