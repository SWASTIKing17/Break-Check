# SubMachine Debug Tool — User Manual

This tool lets you watch SubMachine work in real time from a terminal window.
When something goes wrong on the timeline — clips land in the wrong place, text
disappears, a Split does nothing — you open this tool and it tells you exactly
what happened and why.

---

## Before You Start

You need two things open at the same time:

1. **Premiere Pro** with the SubMachine panel visible
2. **A terminal window** (Windows: press `Win + R`, type `cmd`, hit Enter)

---

## Opening the Debug Tool

In the terminal, navigate to your SubMachine project folder and run:

```
node debug/submachine-debug.js
```

The tool opens and shows the last few things SubMachine did, then waits:

```
─── last 30 lines ───
08:14:22  OK      SubMachine loaded successfully
─── live ───

smdebug>
```

You are now live. Every action you take in SubMachine will appear here
instantly as it happens.

---

## What You See on Screen

Every line in the log tells you one thing SubMachine did. The colour tells
you whether it went well or not:

| Colour | Meaning |
|---|---|
| 🟢 Green | Everything worked |
| 🔵 Blue | Normal step — in progress |
| 🟡 Yellow | Something unexpected happened but SubMachine kept going |
| 🔴 Red | Something failed — this is where your problem is |
| ⚫ Gray | Extra detail — usually not important |

When you see red, stop and read that line carefully. That is your answer.

---

## Commands You Can Type

After the `smdebug>` prompt, type any of these and press Enter:

---

### `ping`

*"Is SubMachine connected to Premiere Pro right now?"*

```
smdebug> ping
  Premiere Pro is alive.  PP 24.0  |  08:15:03
```

If it says **Timeout** instead, SubMachine is not connected.
Click anywhere inside the SubMachine panel in Premiere Pro, wait 3 seconds,
then try again.

---

### `timeline`

*"Show me every clip on every track right now."*

```
smdebug> timeline

  Track 1  (4 clips)
    C0   0.000s → 1.200s   Word 1   "Hello"
    C1   1.200s → 2.400s   Word 2   "world"
    C2   2.400s → 3.800s   Word 3   "how"
    C3   3.800s → 5.000s   Word 4   "are"

  Track 2  (2 clips)
    C0   5.000s → 6.200s   Word 1   "you"
    C1   6.200s → 7.500s   Word 2   "today"
```

Use this right after a Split, Join, or Word Surgery to see exactly where
clips ended up. If you expected 4 clips on Track 1 and see 5, there is a
ghost clip that was not cleaned up.

---

### `phraseMap`

*"Show me how SubMachine has grouped my clips into phrases."*

```
smdebug> phraseMap

  Phrase 1   0.00s → 5.00s
    Track 1   "Hello"    Word 1   0.000s → 1.200s
    Track 1   "world"    Word 2   1.200s → 2.400s
    Track 1   "how"      Word 3   2.400s → 3.800s
    Track 1   "are"      Word 4   3.800s → 5.000s

  Phrase 2   5.00s → 7.50s
    Track 2   "you"      Word 1   5.000s → 6.200s
    Track 2   "today"    Word 2   6.200s → 7.500s
```

This is exactly what the Edit tab sees. If the Edit tab is showing the
wrong number of words in a phrase, compare this output to what is on your
timeline. The mismatch is your bug.

---

### `playhead`

*"What time is the playhead sitting at right now?"*

```
smdebug> playhead
  Playhead:  3.418s
```

---

### `clip 1 0`

*"Show me everything inside a specific clip."*

Replace `1` with the track number and `0` with the clip number from the
`timeline` output above.

```
smdebug> clip 1 0

  Track 1, Clip 0   |   0.000s → 1.200s

  Text content          "Hello"
  Word number           1
  Font Size             80
  Highlight Color       orange
  Position              center
  Scale                 100%
```

Use this when a clip has the wrong text, wrong style, or wrong word number
after an operation.

---

### `clear`

*"Wipe the log so I get a clean view for my next test."*

```
smdebug> clear
Log cleared.
```

Run this before every operation you want to examine. That way the log only
contains what just happened, not everything from the last hour.

---

### `help`

Shows all commands in the terminal.

---

### `quit`

Closes the debug tool.

---

## Step-by-Step: Debugging a Broken Split

You clicked Split and something went wrong — clips are in the wrong place,
text is missing, or nothing happened at all. Here is what to do:

**Step 1 — Clear the log**
```
smdebug> clear
```

**Step 2 — Look at your timeline before you do anything**
```
smdebug> phraseMap
```
Write down how many words are in the phrase you are about to split.

**Step 3 — Perform the Split in Premiere Pro**

Watch the terminal. Lines will appear as SubMachine runs. Look for any
red lines — those are failures.

**Step 4 — Check where the clips landed**
```
smdebug> timeline
```
Compare the result to what you expected. Wrong track? Wrong clip count?
This tells you exactly what went wrong.

**Step 5 — Inspect a specific clip if needed**
```
smdebug> clip 1 2
```
Check the text and word number. If they look like default template values,
the data was not written to that clip.

---

## Step-by-Step: Debugging a Broken Join

**Step 1 — Clear, then check the before state**
```
smdebug> clear
smdebug> phraseMap
```

**Step 2 — Position your playhead on the clip whose style you want to keep**

Join requires the playhead to sit on one of the clips. If it is sitting on
empty space the Join will stop with an error — you will see it in red in
the log.

**Step 3 — Perform the Join**

Watch for red lines.

**Step 4 — Check the result**
```
smdebug> phraseMap
```
All words should now be in one phrase. If some are missing, run `timeline`
to find where they are.

---

## Step-by-Step: Debugging Wrong Text After Word Surgery

You moved a word between phrases and the text came out blank or wrong.

**Step 1 — Check the phrase map**
```
smdebug> phraseMap
```
Count the words in each phrase. If a phrase has fewer words than it should,
SubMachine could not see all the clips belonging to it.

**Step 2 — Inspect the blank clip**

Find it using `timeline`, then:
```
smdebug> clip <track> <number>
```
Look at the **Word number** field. If it shows `0`, the clip was placed but
no data was ever written to it. That is where the operation broke.

---

## Common Problems and What They Mean

### Red line: "could not locate inserted clip"

SubMachine placed a new clip on the timeline but then could not find it to
write the text and style into it. The clip will appear with default template
values. Run `timeline` to find it, then check its word number with `clip`.

### Red line: "No active sequence"

SubMachine tried to run but no sequence was open in Premiere Pro. Click on
your timeline in PP and try the operation again.

### Red line: "Place your playhead on the clip"

For a Join operation, the playhead must be sitting directly on top of one
of the clips you are joining. Move it there and try again.

### Yellow line: "could not set projectItem outPoint"

A minor internal warning — SubMachine kept going. You can usually ignore
this unless the final result is also wrong.

### Nothing appears in the terminal when you perform an operation

SubMachine ran but wrote nothing to the log. This usually means the
operation returned immediately without doing anything. Run `ping` first
to confirm the connection is alive, then check that your sequence is open
and a clip is selected.

---

## If the Tool Does Not Respond

**"Timeout — no response from Premiere Pro"**

The debug tool cannot reach SubMachine. Try these in order:

1. Make sure the SubMachine panel tab is visible in Premiere Pro — not
   collapsed or hidden behind another panel.
2. Click anywhere inside the SubMachine panel.
3. Wait 3 seconds.
4. Type `ping` again.

If it still times out, close and reopen the SubMachine panel in PP, then
try once more.

---

## Closing the Tool

Type `quit` and press Enter, or press `Ctrl + C`.

The tool does not affect Premiere Pro in any way when it is closed. Your
timeline and project are untouched.
