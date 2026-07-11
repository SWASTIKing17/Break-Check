---
name: hindi-to-hinglish-srt
description: >
  Converts Hindi .srt subtitle files to Hinglish (Hindi written in Roman/Latin script), preserving all timestamps and block structure. Use this skill IMMEDIATELY whenever the user uploads or pastes an .srt file with Hindi (Devanagari) subtitles, or asks to convert Hindi subtitles/captions to Hinglish, Roman Hindi, or Romanized Hindi. Also trigger when the user says "convert srt", "transliterate subtitles", "Hindi to English script subtitles", or pastes subtitle blocks containing Devanagari characters. Do NOT translate the meaning — only transliterate the script from Devanagari to Roman characters. Output a clean, correctly numbered .srt file in a code block.
---

# Hindi to Hinglish SRT Skill

## What this skill does
Converts a word-by-word or phrase-level Hindi `.srt` subtitle file from Devanagari script into Hinglish (Romanized Hindi), preserving all timestamps, block structure, and subtitle numbering. Output is a clean `.srt` file — no citations, no Devanagari, no translation.

---

## Core Rules

### 1. Transliteration, NOT Translation
- Convert Devanagari script → Roman letters
- Do NOT change the meaning or replace Hindi words with English equivalents
- Exception: if a word is already in Roman script (e.g., `Aap`), keep it as-is and ensure correct casing

### 2. Capitalisation Rules
- **Capitalise only the first word of each subtitle block** (sentence-start style)
- Do NOT randomly capitalise mid-word letters (e.g., `HAi`, `KYa`, `HooN` are WRONG)
- Correct: `Hai`, `Kya`, `Hoon`
- Abbreviations: capitalise all letters (e.g., `BJP`, `PM`, `OBC`)

### 3. Punctuation
- Convert Devanagari full stop (।) → Latin full stop (.)
- Keep commas, question marks, exclamation marks as-is
- Do NOT leave any Devanagari punctuation in the output

### 4. Numbering
- Renumber all subtitle blocks sequentially starting from 1
- If the input has incorrect or duplicate numbers, fix them in output

### 5. Timestamps
- Copy timestamps exactly — do not alter them
- Format must remain: `HH:MM:SS,mmm --> HH:MM:SS,mmm`

### 6. No stray characters
- Remove any leftover Devanagari characters
- No citation markers like `[1]`, `(source)`, etc.
- No extra blank lines within a subtitle block

---

## Common Error Patterns to Avoid

| Wrong | Correct | Reason |
|---|---|---|
| `HOoN` | `Hoon` | Random caps inside word |
| `HAi` | `Hai` | Random caps inside word |
| `AaPKEe` | `Aapke` | Erratic capitalisation |
| `HAiN` | `Hain` | Random caps |
| `K्YA` | `Kya` | Mixed scripts / stray matra |
| `JISKA` | `Jiska` | All-caps non-abbreviation |
| `Hai।` | `Hai.` | Devanagari full stop left in |
| `unnecessary Capitalisation` | `Unnecessary capitalisation` | Mid-sentence caps |

---

## Output Format

1. Produce a clean `.srt` in a code block
2. Name the file: `hinglish_<input_filename>.srt`
3. Each subtitle block format:
```
<number>
<start> --> <end>
<Hinglish text>

```
4. Blank line between blocks, no trailing spaces

---

## Step-by-Step Execution Process

1. **Parse** the input `.srt` — identify each numbered block, its timestamp, and its Hindi text
2. **Transliterate** each block's text from Devanagari to Roman using the table above
3. **Apply capitalisation** — first letter of block capitalised, rest lowercase (except abbreviations)
4. **Fix punctuation** — replace `।` with `.`, ensure no Devanagari punctuation remains
5. **Renumber** blocks sequentially from 1
6. **Validate** — scan for typos, mixed scripts, wrong caps, stray characters
7. **Output** — present inside a fenced code block, labelled with the output filename

---

## Example

**Input:**
```
1
00:00:00,000 --> 00:00:01,000
सुप्रभात,

1
00:00:01,000 --> 00:00:02,000
Aap सब

3
00:00:02,000 --> 00:00:03,000
कैसे हैं?
```

**Output (`hinglish_<input_filename>.srt`):**
```
1
00:00:00,000 --> 00:00:01,000
Suprabhat,

2
00:00:01,000 --> 00:00:01,500
Aap

3
00:00:01,500 --> 00:00:02,000
Sab

4
00:00:02,000 --> 00:00:02,500
Kaise

5
00:00:02,500 --> 00:00:03,000
Hain?
```

---

## Notes
- If a block contains mixed Hindi + already-Roman text (e.g., `Aap सब`), transliterate only the Devanagari portion and keep the Roman portion intact
- For words with no clear standard Romanization (proper nouns, regional dialect), use the closest phonetic spelling
- Double-check nasal sounds: `ं` (anusvara) → `n` or `m` depending on the following consonant; `ँ` (chandrabindu) → `n`
- Halant (्) means the consonant has no vowel — render accordingly (e.g., `क्या` → `kya`, not `kaya`)

# Final Test
- There Shouldn't be any typo. (e.g. {HOoN,JISKA,AaPKEe,HAiN,:unnecessary Capitalization of letters},{HAi।:Full stop is still in devnagri identify the abbrivations and translate them too},{K्YA:Unnecessary letters in the word}), Avoid these mistakes at minimum cost, but High Effeciency.
- Output Format :- "Hinglish_Subtitle_`inputFileName()`.srt"
