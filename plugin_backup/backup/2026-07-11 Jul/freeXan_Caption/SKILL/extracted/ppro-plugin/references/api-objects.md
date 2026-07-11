# Premiere Pro API Objects Reference

> This file covers both **ExtendScript** (CEP/legacy) and **UXP** syntax.  
> UXP access pattern: `const ppro = require('premierepro'); const app = await ppro.app;`  
> ExtendScript access pattern: global `app` object, all synchronous.

---

## Table of Contents

1. [Application (`app`)](#1-application-app)
2. [Project (`app.project`)](#2-project-appproject)
3. [Sequence](#3-sequence)
4. [Track](#4-track)
5. [TrackItem (Clip)](#5-trackitem-clip)
6. [ProjectItem](#6-projectitem)
7. [Marker / MarkerCollection](#7-marker--markercollection)
8. [Encoder](#8-encoder)
9. [QE DOM (unofficial)](#9-qe-dom-unofficial)
10. [Time Object](#10-time-object)

---

## 1. Application (`app`)

### Key Attributes

| Property | Type | Description |
|---|---|---|
| `app.project` | Project | Currently active project |
| `app.projects` | ProjectCollection | All open projects |
| `app.encoder` | Encoder | Access to Adobe Media Encoder |
| `app.metadata` | Metadata | Application-level metadata |
| `app.version` | String | Premiere version string e.g. `"25.6.0"` |
| `app.build` | String | Build number |
| `app.path` | String | Path to Premiere executable |
| `app.userGuid` | String | CC user GUID |

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `app.enableQE()` | Boolean | Enable QE DOM (ExtendScript only) |
| `app.getWorkspaces()` | String[] | List workspace names |
| `app.setWorkspace(name)` | Boolean | Switch active workspace |
| `app.newProject(path)` | Boolean | Create new .prproj |
| `app.openDocument(path, ...)` | Boolean | Open a project file |
| `app.isDocumentOpen()` | Boolean | Is any project open? |
| `app.setSDKEventMessage(msg, type)` | Boolean | Write to Events panel; type: `'info'`, `'warning'`, `'error'` |
| `app.setExtensionPersistent(id, 0\|1)` | Boolean | Keep CEP extension in memory |
| `app.setScratchDiskPath(path, type)` | Boolean | Set scratch disk |
| `app.bind(eventName, fn)` | Boolean | Subscribe to app-level events |
| `app.getEnableProxies()` | 0\|1 | Proxy state |
| `app.setEnableProxies(0\|1)` | 0\|1 | Toggle proxies |
| `app.broadcastPrefsChanged()` | void | Force pref broadcast |

**UXP equivalents** — call on `await ppro.app`:
```js
const app = await ppro.app;
const project = await app.getActiveProject();     // replaces app.project
const allProjects = await app.getProjects();       // replaces app.projects
```

---

## 2. Project (`app.project`)

### Key Attributes

| Property | Type | Description |
|---|---|---|
| `project.name` | String | Project filename |
| `project.path` | String | Full path to .prproj |
| `project.rootItem` | ProjectItem | Root bin; iterate `.children` |
| `project.sequences` | SequenceCollection | All sequences |
| `project.activeSequence` | Sequence | Currently open sequence |
| `project.documentID` | String | Unique project ID |

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `project.save()` | void | Save project |
| `project.saveAs(path)` | void | Save copy to path |
| `project.close(...)` | Boolean | Close project |
| `project.importFiles(paths[], suppressUI, targetBin, importAsNumberedStills)` | Boolean | Import media |
| `project.importSequences(project)` | Boolean | Import sequences from another project |
| `project.createNewSequence(name, id)` | Sequence | Create empty sequence |
| `project.deleteSequence(seq)` | Boolean | Delete a sequence |
| `project.consolidateSequences()` | void | Consolidate + transcode |
| `project.placeAsset(projectItem, seq, time, videoTrackIdx, audioTrackIdx)` | Boolean | Insert clip onto timeline |

**ExtendScript import example:**
```jsx
var filePaths = ['/path/to/clip.mp4', '/path/to/audio.wav'];
app.project.importFiles(filePaths, true, app.project.rootItem, false);
```

**UXP import example:**
```js
const project = await app.getActiveProject();
await project.importFiles(['/path/to/clip.mp4']);
```

---

## 3. Sequence

Access: `app.project.activeSequence` (ExtendScript) or `await project.getActiveSequence()` (UXP).

### Key Attributes

| Property | Type | Description |
|---|---|---|
| `sequence.name` | String | Sequence name (writable) |
| `sequence.sequenceID` | String | Unique ID |
| `sequence.videoTracks` | TrackCollection | All video tracks |
| `sequence.audioTracks` | TrackCollection | All audio tracks |
| `sequence.markers` | MarkerCollection | Sequence markers |
| `sequence.timebase` | String | Ticks per second (denominator) |
| `sequence.frameSizeHorizontal` | Number | Width in pixels |
| `sequence.frameSizeVertical` | Number | Height in pixels |
| `sequence.end` | String | End time in ticks |
| `sequence.zeroPoint` | String | Start offset in ticks |
| `sequence.audioDisplayFormat` | Number | Audio time format |
| `sequence.videoDisplayFormat` | Number | Video time format |
| `sequence.previewFilePath` | String | Preview file path |
| `sequence.previewFrameRate` | String | Preview frame rate |

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `sequence.setInPoint(ticks)` | void | Set In point |
| `sequence.setOutPoint(ticks)` | void | Set Out point |
| `sequence.getInPoint()` | String | Get In point ticks |
| `sequence.getOutPoint()` | String | Get Out point ticks |
| `sequence.setPlayerPosition(ticks)` | void | Move playhead |
| `sequence.getPlayerPosition()` | Time | Current playhead position |
| `sequence.exportAsMediaDirect(path, presetPath, workAreaType)` | String | Export sequence |
| `sequence.getExportFileExtension(presetPath)` | String | Extension for preset |
| `sequence.clone()` | Sequence | Duplicate the sequence |
| `sequence.openInSource()` | void | Open in Source Monitor |
| `sequence.razor(time)` | void | Razor all clips at time |
| `sequence.attach(sequence)` | void | Attach/append sequence |
| `sequence.autoReframeSequence(...)` | Boolean | Auto-reframe |
| `sequence.createSubsequence(ignoreTrackTargeting)` | Sequence | New subclip |
| `sequence.isWorkAreaEnabled()` | Boolean | Is work area on? |
| `sequence.setWorkAreaEnabled(enabled)` | void | Toggle work area |
| `sequence.getWorkArea()` | Object | `{ inPoint, outPoint }` |
| `sequence.setWorkArea(inPoint, outPoint)` | void | Set work area bounds |

**Working with In/Out in ExtendScript:**
```jsx
var seq = app.project.activeSequence;
var inTime = new Time();
inTime.seconds = 5.0;
seq.setInPoint(inTime.ticks);
var outTime = new Time();
outTime.seconds = 30.0;
seq.setOutPoint(outTime.ticks);
```

---

## 4. Track

Access: `sequence.videoTracks[i]` or `sequence.audioTracks[i]`.  
Track index is zero-based. `numTracks` gives the count.

### Key Attributes

| Property | Type | Description |
|---|---|---|
| `track.name` | String | Track name (writable) |
| `track.id` | Number | Track index |
| `track.clips` | TrackItemCollection | All clips on track |
| `track.transitions` | TrackItemCollection | Transitions |
| `track.mediaType` | String | `"Video"` or `"Audio"` |
| `track.isMuted()` | Boolean | Is muted? |
| `track.isSolo()` | Boolean | (audio) Is solo? |
| `track.isLocked()` | Boolean | Is locked? |

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `track.setMute(0\|1)` | void | Mute/unmute |
| `track.setSolo(0\|1)` | void | Solo/unsolo (audio) |
| `track.setLock(0\|1)` | void | Lock/unlock |
| `track.insertClip(projectItem, time)` | void | Insert clip at time |
| `track.overwriteClip(projectItem, time)` | void | Overwrite clip at time |
| `track.moveClip(time, clipIndex)` | void | Move clip |

**Iterating all clips on all video tracks:**
```jsx
var seq = app.project.activeSequence;
for (var t = 0; t < seq.videoTracks.numTracks; t++) {
  var track = seq.videoTracks[t];
  for (var c = 0; c < track.clips.numItems; c++) {
    var clip = track.clips[c];
    $.writeln(clip.name + ' at ' + clip.start.seconds);
  }
}
```

---

## 5. TrackItem (Clip)

Access: `track.clips[i]`.

### Key Attributes

| Property | Type | Description |
|---|---|---|
| `clip.name` | String | Clip name (writable) |
| `clip.start` | Time | Start on timeline |
| `clip.end` | Time | End on timeline |
| `clip.duration` | Time | Duration on timeline |
| `clip.inPoint` | Time | In point within source |
| `clip.outPoint` | Time | Out point within source |
| `clip.mediaType` | String | `"Video"`, `"Audio"` |
| `clip.projectItem` | ProjectItem | Source project item |
| `clip.type` | Number | Clip type enum |
| `clip.disabled` | Boolean | Is disabled? |
| `clip.components` | ComponentCollection | Effects/components |

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `clip.remove(ripple, alignToVideo)` | void | Delete clip |
| `clip.move(time)` | void | Move clip to new time |
| `clip.setInPoint(time, type)` | void | Trim in point |
| `clip.setOutPoint(time, type)` | void | Trim out point |
| `clip.getSpeed()` | Number | Playback speed (1.0 = 100%) |
| `clip.setSpeed(speed, ...)` | void | Change clip speed |
| `clip.isSelected()` | Boolean | Is clip selected? |
| `clip.setSelected(state, updateUI)` | void | Select/deselect |
| `clip.addTransition(transition, alignment)` | void | Apply transition |

---

## 6. ProjectItem

Access: `app.project.rootItem.children[i]` or via `importFiles`.

### Key Attributes

| Property | Type | Description |
|---|---|---|
| `item.name` | String | Item name (writable) |
| `item.nodeId` | String | Unique item ID |
| `item.treePath` | String | Bin path |
| `item.type` | Number | 1=clip, 2=bin, 4=sequence, 5=root |
| `item.children` | ProjectItemCollection | Children (if bin) |
| `item.videoComponents` | ComponentCollection | Video effects |
| `item.startTime` | Time | Source start time |
| `item.duration` | Time | Source duration |

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `item.getMediaPath()` | String | Absolute path to source media |
| `item.getInPoint(mediaType)` | Time | Master clip in point |
| `item.getOutPoint(mediaType)` | Time | Master clip out point |
| `item.setInPoint(time, mediaType)` | void | Set master in point |
| `item.setOutPoint(time, mediaType)` | void | Set master out point |
| `item.setScaleToFrameSize()` | void | Scale to frame size |
| `item.createBin(name)` | ProjectItem | Create sub-bin |
| `item.renameBin(name)` | Boolean | Rename a bin |
| `item.moveBin(targetBin)` | void | Move item to bin |
| `item.getMetadata()` | String | XMP metadata as string |
| `item.setMetadata(xmpStr)` | Boolean | Write XMP metadata |
| `item.refreshMedia()` | void | Refresh/relink media |
| `item.isOffline()` | Boolean | Is media offline? |
| `item.changeMediaPath(path, ...)` | Boolean | Relink to new path |

**Recursive bin walk in ExtendScript:**
```jsx
function walkBin(item, depth) {
  $.writeln(Array(depth+1).join('  ') + item.name);
  if (item.type === ProjectItemType.BIN) {
    for (var i = 0; i < item.children.numItems; i++) {
      walkBin(item.children[i], depth + 1);
    }
  }
}
walkBin(app.project.rootItem, 0);
```

---

## 7. Marker / MarkerCollection

Access: `sequence.markers` or `clip.markers`.

### MarkerCollection Methods

| Method | Returns | Description |
|---|---|---|
| `markers.createMarker(time)` | Marker | Add marker at time |
| `markers.deleteMarker(marker)` | void | Remove marker |
| `markers.getFirstMarker()` | Marker | First marker |
| `markers.getLastMarker()` | Marker | Last marker |
| `markers.getNextMarkerAtOrAfterTime(time)` | Marker | Next marker |
| `markers.numMarkers` | Number | Count |

### Marker Properties

| Property | Type | Description |
|---|---|---|
| `marker.name` | String | Label (writable) |
| `marker.comments` | String | Comments (writable) |
| `marker.start` | Time | Start time (writable) |
| `marker.end` | Time | End time (writable) |
| `marker.duration` | Time | Duration |
| `marker.type` | String | `"Comment"`, `"Chapter"`, `"Segmentation"`, `"WebLink"` |

**Add a chapter marker at 10 seconds:**
```jsx
var seq = app.project.activeSequence;
var t = new Time();
t.seconds = 10;
var m = seq.markers.createMarker(t.ticks);
m.name = 'Chapter 1';
m.type = 'Chapter';
```

---

## 8. Encoder

Access: `app.encoder`.  
> ⚠️ Broken on Mac in Premiere 14.3.1–15. Fixed in 22+.

### Key Methods

| Method | Returns | Description |
|---|---|---|
| `encoder.encodeSequence(seq, outputPath, presetPath, workAreaType, removeFromQueueWhenDone)` | String | Enqueue and export |
| `encoder.encodeProjectItem(item, outputPath, presetPath, workAreaType, removeFromQueueWhenDone)` | String | Export a project item |
| `encoder.startBatch()` | Boolean | Start AME queue |
| `encoder.getExporters()` | String[] | Available exporters |
| `encoder.launchEncoder()` | Boolean | Launch AME |
| `encoder.setSidecarXMPEnabled(state)` | Boolean | Sidecar XMP toggle |

**workAreaType constants:**
- `0` — encode entire sequence
- `1` — encode work area
- `2` — encode in/out points

```jsx
var seq = app.project.activeSequence;
var outputPath = '/path/to/output.mp4';
var presetPath = '/path/to/preset.epr';
app.encoder.encodeSequence(seq, outputPath, presetPath, 0, true);
app.encoder.startBatch();
```

---

## 9. QE DOM (unofficial)

The QE DOM exposes internal APIs not available in the public ExtendScript API. Must call `app.enableQE()` first. **ExtendScript only; not available in UXP.**

```jsx
app.enableQE();

// Access QE app
var qeApp = qe;

// Active sequence via QE
var qeSeq = qe.project.getActiveSequence();

// Render all
qeSeq.renderAll();

// Export frame
qeSeq.exportCurrentFrameToDisk('/path/to/frame.png');

// Access track via QE (more granular than public API)
var qeTrack = qeSeq.getVideoTrackAt(0);

// Apply LUT
qeTrack.getClipAt(0).setLUT('/path/to/lut.cube', 1);
```

> Use QE with caution: undocumented, subject to change between versions, not supported by Adobe.

---

## 10. Time Object

Time values in Premiere are stored as **ticks** (1 second = 254016000000 ticks at the base rate). Always convert via the `Time` object — never hardcode tick values.

### ExtendScript
```jsx
// Create a Time at 5.5 seconds
var t = new Time();
t.seconds = 5.5;
var ticks = t.ticks;       // ticks string
var backToSecs = t.seconds; // number

// From frames (sequence must be active for context)
t.frames = 120;             // 120 frames from start

// Zero time
var zero = new Time();
zero.seconds = 0;
```

### UXP
```js
const ppro = require('premierepro');

// From seconds
const t = ppro.TickTime.fromSeconds(5.5);

// From ticks string
const t2 = ppro.TickTime.fromTicks('1270080000000');

// Access value
t.seconds;    // number
t.ticks;      // string
```
