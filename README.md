# SMS Analyzer

`analyzeSmsText(text)` is a small, dependency-free JavaScript utility that tells you how an SMS message will be encoded and how many segments it will use.

It is designed for product teams, QA, and technical reviewers who need a predictable answer with the least possible ambiguity.

---

## What it returns

```js
{
  encoding: 'GSM' | 'Latin-1' | 'UCS2',
  characterCount: number,
  segmentSize: number,
  segments: number,
  remainingCharacters: number
}
```

### Field meanings

| Field | Meaning |
|---|---|
| `encoding` | The most compact valid encoding for the full message |
| `characterCount` | Visible character count using Unicode code points |
| `segmentSize` | The active per-segment capacity for the detected message size |
| `segments` | How many SMS segments are needed |
| `remainingCharacters` | How much room is left in the last segment |

---

## Quick start

```bash
npm install
npm test
```

Optional helpers:

```bash
npm run test:watch
npm run test:coverage
```

---

## Usage examples

```js
import { analyzeSmsText } from './src/analyzeSmsText.js';

analyzeSmsText('Hello!');
// {
//   encoding: 'GSM',
//   characterCount: 6,
//   segmentSize: 160,
//   segments: 1,
//   remainingCharacters: 154
// }

analyzeSmsText('ç');
// {
//   encoding: 'Latin-1',
//   characterCount: 1,
//   segmentSize: 140,
//   segments: 1,
//   remainingCharacters: 139
// }

analyzeSmsText('😊');
// {
//   encoding: 'UCS2',
//   characterCount: 1,
//   segmentSize: 80,
//   segments: 1,
//   remainingCharacters: 79
// }
```

---

## Technical rules

### 1. Encoding detection order

The analyzer always picks the most compact valid encoding in this order:

1. `GSM`
2. `Latin-1`
3. `UCS2`

If a message contains one character that is not in the base GSM alphabet, the whole message falls back to Latin-1 when possible. If it contains a character outside ISO-8859-1, the whole message falls back to UCS2.

### 2. GSM scope is base alphabet only

This task intentionally excludes the GSM extension table.

That means characters such as `€`, `[`, `]`, `{`, `}`, `\`, `^`, `|`, and `~` are not treated as GSM here.

Why this choice helps:

1. The implementation stays smaller.
2. The encoding rules are easier to explain.
3. The fallback behavior is predictable for reviewers and QA.

### 3. Latin-1 is strict ISO-8859-1

Latin-1 means code points from `0x00` to `0xFF`.

This is strict by design so the analyzer does not guess or silently accept characters that the SMS transport cannot represent.

### 4. UDH-aware multipart sizing

Single-segment limits:

| Encoding | Single segment | Multipart segment |
|---|---:|---:|
| GSM | 160 | 153 |
| Latin-1 | 140 | 134 |
| UCS2 | 80 | 67 |

Why multipart is smaller:

1. Multipart SMS needs a User Data Header (UDH).
2. That header uses some of the payload space.
3. The usable characters per segment drop once the message spans multiple parts.

The returned `segmentSize` is the active limit for the current message:

1. If the message fits in one segment, it returns the single-segment limit.
2. If the message needs more than one segment, it returns the multipart limit.

### 5. Character counting

The analyzer counts Unicode code points with `Array.from(text)`.

That means emoji count as one visible character instead of two UTF-16 code units.

Important limitation:

1. Some emoji sequences are made of multiple code points.
2. Skin tone emoji and family emoji may count as more than one.
3. Correct grapheme-cluster counting would require `Intl.Segmenter` or a dedicated library.

This was left out on purpose to keep the utility dependency-free and easy to review.

### 6. Empty string behavior

An empty string returns:

```js
{
  encoding: 'GSM',
  characterCount: 0,
  segmentSize: 160,
  segments: 0,
  remainingCharacters: 160
}
```

This represents an idle composer state, not a real sent SMS.

### 7. Input contract

The function is strict and only accepts strings.

If a caller passes `null`, `undefined`, a number, or an object, the function throws a `TypeError`.

This avoids silent coercion and makes failures easier to debug.

---

## Decision table

| Example | Expected encoding | Reason |
|---|---|---|
| `Hello` | GSM | Base GSM only |
| `ç` | Latin-1 | Not GSM, but ISO-8859-1 valid |
| `مرحبا` | UCS2 | Outside Latin-1 |
| `😊` | UCS2 | Outside Latin-1 |
| `€` | UCS2 | GSM extension table excluded |
| `[` | Latin-1 | ASCII, but not base GSM here |
| `{` | Latin-1 | ASCII, but not base GSM here |

---

## Why the tests are structured this way

The test suite focuses on boundary and failure cases because those are the most likely sources of SMS bugs.

1. Empty input
2. Normal GSM text
3. Exact single-segment boundaries
4. Multipart boundaries
5. Fallback encoding behavior
6. Excluded GSM characters
7. Invalid input types

This makes the utility easier to trust during review.

---

## File structure

```text
sms-analyzer/
├── src/
│   ├── gsm7Charset.js
│   └── analyzeSmsText.js
├── tests/
│   └── analyzeSmsText.test.js
├── package.json
└── README.md
```

---

## Known limitations

1. Grapheme clusters are not counted as a single visual symbol.
2. The analyzer does not normalize input.
3. The analyzer does not model carrier-specific billing differences.
4. The GSM extension table is intentionally out of scope.

---

## Future improvements

1. Add `Intl.Segmenter` support for grapheme-aware counting.
2. Add a small formatter for presenting the result in a UI.
3. Add TypeScript types if this becomes a shared package.
