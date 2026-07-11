# Architecture Overview - The "Control Room" and the "Engine"

## Purpose
This guide explains how SubMachine works under the hood using a simple metaphor, intended for non-technical stakeholders.

---

## The Metaphor: The Racing Team
Imagine SubMachine is a high-performance racing car in a video editing competition.

### 1. The Dashboard (The Panel UI)
- **What it is**: `panel/panel.html` and `panel/js/panel.js`.
- **Its Job**: This is the interface the driver (the user) sees. It contains all the buttons, screens, and settings.
- **The Catch**: The dashboard itself cannot steer the car; it can only send electronic signals.

### 2. The Wire (The CEP Bridge)
- **What it is**: The system that connects the Panel to the Editing App.
- **Its Job**: It carries the driver's commands (like "Make Subtitles!") from the Dashboard into the Engine. It also brings back data (like "Sequence Time") to show on the Dashboard.

### 3. The Engine (The JSX Backend)
- **What it is**: `panel/jsx/main.jsx`.
- **Its Job**: This is where the real power lies. This code has direct access to the timeline. It can:
  - Add tracks.
  - Cut clips.
  - Move graphics.
  - Change colors on the timeline.
- **The Process**: When you click "Import," the Dashboard sends a signal through the Wire. The Engine receives the signal, opens up Premiere Pro's "toolbox," and starts building the subtitles piece by piece.

---

## Why Two Parts?
Adobe software is like a high-security vault. The **Dashboard** is outside (using standard web technology like HTML), while the **Engine** is inside (using Adobe's specific language). They need to work together to automate your workflow without compromising the stability of your project.
