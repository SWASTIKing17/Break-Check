# SubMachine Command Center: The Bridge Guide 🌉

This document explains how the **Command Center (React)** talks to **Premiere Pro (ExtendScript)**. Think of this as the manual for the "Brain" of SubMachine.

---

## 1. The Two Worlds (Metaphor)

Imagine the Command Center as a **Digital Remote Control** (the UI) and Premiere Pro as a **Physical VCR Player** (the Backend).

- **The UI (React):** This is what you see. It's fast, pretty, and responsive. When you drag a word, the UI "optimistically" moves it instantly so you don't feel any lag.
- **The Backend (ExtendScript/JSX):** This is the heavy machinery inside Premiere Pro. It physically cuts clips, moves them to tracks, and changes their colors. It's slower because it has to talk to the Premiere engine.

---

## 2. The Bridge (`callJSX`)

Because these two worlds speak different languages (Modern Javascript vs. Legacy ExtendScript), they use a **Bridge**.

1. **The Request:** When you click "Split," the UI sends a message across the bridge: *"Hey Premiere, please cut Track 3, Clip 5 at the 2nd word."*
2. **The Surgery:** Premiere performs the "Surgical Operation" using the `sm_tools_split_join_v28` engine.
3. **The Confirmation:** Once finished, Premiere sends a "Success" message back.
4. **The Settle & Sync:** The UI waits a split second for Premiere to finish writing to its "Timeline Database" and then does a final scan to make sure everything matches.

---

## 3. The "Timeline as a Database"

Most apps need a database (like SQL) to remember things. **SubMachine is unique.**

- **The Source of Truth:** We use your **Premiere Pro Timeline** as the database.
- **Why?** Because if you manually move a clip in Premiere, we want the UI to know about it. By scanning the timeline directly, we never have "ghost words" or "missing phrases."
- **Metadata:** We store the "Word Progression" and "Phrase IDs" inside the MOGRT parameters themselves. The clips carry their own identity.

---

## 4. Surgical Rules (Guardrails)

To keep the timeline from breaking, we use "Strict Coupling" rules:
- **No Teleportation:** Words can only move to the phrase before or after them.
- **Chain Integrity:** You can only uncouple words from the front or back of a phrase.
- **Locked Tracks:** If a phrase is locked, the bridge refuses to send surgery commands to it.

---

## 5. Visual Summary

| Component | Responsibility | Technology |
| :--- | :--- | :--- |
| **Command Center** | User Interaction & Layout | React JS + CSS Grid |
| **The Bridge** | Translating & Error Handling | `callJSX` Wrapper |
| **Surgical Engine** | Timeline Manipulation | ExtendScript (JSX) |
| **Database** | Storing Text & Timing | Premiere Pro Timeline (`.prproj`) |
