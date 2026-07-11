# SubMachine: Data Schema Specification

This document defines the JSON structures used for communication between the Frontend (JavaScript) and the Backend (ExtendScript). 

---

## 1. MOGRT Property Object
Represents a single parameter inside a Motion Graphics Template (Slider, Color, Text, etc.).

```json
{
  "index": 0,
  "displayName": "Ⓣ Word Color",
  "value": [1, 0, 0, 1],
  "valueType": 6
}
```
*   `index`: The internal property index in the MGT component.
*   `displayName`: The name visible in the Essential Graphics Panel (prefixed with Ⓣ for SubMachine standards).
*   `value`: The data value. Colors are `[R, G, B, A]`, Sliders are `Number`, etc.
*   `valueType`: Premiere's internal property type code (e.g., 6 = Color).

---

## 2. Selection Map (`SelectedClipData`)
Used to target specific clips on the Premiere Pro timeline.

```json
{
  "trackNumber": 1,
  "clipNumber": 4
}
```
*   `trackNumber`: 0-indexed video track index.
*   `clipNumber`: 0-indexed clip index on that specific track.

---

## 3. Sync Inquiry Result (`syncAllGetData` Response)
The "Snapshot" of the current timeline state before a synchronization occurs.

```json
{
  "status": "Complete",
  "playhead": 12.5,
  "multiplePhrases": true,
  "masterMogrtData": [ ...MogrtProperty... ],
  "selectedMogrtData": [ ...SelectedClipData... ],
  "masterPositionValue": [0.5, 0.5],
  "masterScaleValue": 100,
  "masterRotationValue": 0
}
```

---

## 4. Batch Sync Payload (`sm_sync_batch` Request)
The instructions sent back to the backend to execute a sync.

```json
{
  "updatedMogrtData": [ ...MogrtProperty... ],
  "selectedMogrtData": [ ...SelectedClipData... ],
  "masterPositionValue": [0.5, 0.5],
  "masterScaleValue": 100,
  "masterRotationValue": 0,
  "multiplePhrases": true
}
```

---

## 5. Caption Creation Object (`createCaptions` Data)
Used during the SRT import process to generate word-level clips.

```json
{
  "wordStart": 1.2,
  "wordEnd": 1.5,
  "phraseText": "The quick brown fox",
  "wordText": "quick",
  "progressionValue": 2,
  "totalWords": 4,
  "videoTrack": 1,
  "firstVideoTrack": 2,
  "secondVideoTrack": 3
}
```

---

## 6. Safe Call Wrapper (Standard Response)
Every backend call should return this envelope for unified error handling.

```json
{
  "ok": true,
  "data": { ...any result... },
  "error": "Error message if ok is false"
}
```
