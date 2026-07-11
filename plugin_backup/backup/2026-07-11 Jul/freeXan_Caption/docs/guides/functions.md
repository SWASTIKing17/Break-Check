#### mogrt.jsx
### function getData(requestData)
### function createCaptions(captionData)
## function findProjectItem(root, name, id)
### function bridgeCaptionGaps()

#### properties.jsx
### function getSMProperty(mgt, key)

#### sync.jsx
### function syncAllGetData(params)
### function syncAll(params)
### function joinGetSelection(params)
### function syncTextGetData(params)
### function syncText(data)
### function sm_sync_batch(data)
### function sm_sync_text_batch(data)
### function getTimelinePhraseMap()
### function setPlayheadTime(params)
### function inspectMogrtProperties(params)
## function componentToHex(c)
## function rgbToHex(r, g, b)
### function updateMogrtProperty(params)
### function executeWordTransfer(params)
### function _updateMogrtTextAndProg(clip, phraseText, progression, labelColor)
### function updateSingleWordText(params)

#### timeline.jsx
### function _clipKey(trackIdx, clip)
### function _getClipTrackIndex(clip)
### function moveClipToTrack(clip, sourceTrack, destTrack)
### function getPhraseClips(track, anchorIdxRaw)
### function findNeighborPhrase(anchorClip, direction)
### function extractMasterStyle(clip)
### function _isNumericSlider(p)
### function _extractSpecificWordSliderSlots(clip)
### function _setSpecificWordSliderSlots(clip, sliderValues)
### function _readPhraseSliderValues(clip)
### function applyMasterStyle(clip, styleMap)
### function sm_tools_split_v28(params)
### function _findClipByTime(track, ticks)
### function _bridgeGaps(clips)
### function sm_tools_join_v28(params)
### function sm_tools_split_join_v28(params)
## function fullyCovered(phrase, trackIdx)
### function sm_tools_remove_word_v28(params)
### function sm_tools_add_word_v28(params)
### function splitPhraseGetMogrtData(request)
### function findClipUnderPlayhead(request)

#### utils.jsx
### function getUserData()
### function selectSRT()
### function selectMogrt()
### function getProjectDirectory()
### function jsxLog(msg, level)
### function dataLog(msg, type)
### function reportError(err, context)
### function dumpObject(obj, name, indent)
### function _resolveUndoApi()
### function startUndo(undoName)
### function endUndo(undoName)
### function resetUndoApiProbe()
### function _getClipColor(clip)
### function _setClipColor(clip, label)
### function getSafeAlternatingColor(neighborPhraseA, neighborPhraseB)
### function getSafeAlternatingTrack(neighborTrackIdxA, neighborTrackIdxB)
### function buildTextObj(srcTextObj, newWords, wordIndices)
### function mergeTextObjs(textObjArray, texts)
### function applyMasterStyleToTextObj(masterTextObj, targetTextObj)
### function safeCall(fn, context)

#### json2.jsx
### (function () { ... } ())

#### debug_bridge.jsx
### function sm_debug_poll()
Reads `debug_inbox.json` on every call (invoked every 2 s by the panel heartbeat).
If the file is absent the function returns immediately — zero overhead in normal use.
When a command is found: deletes the inbox, executes the command, writes the result
to `debug_outbox.json`. Exposed as `$.global.sm_debug_poll` so the panel can reach
it via `evalScript`.

Supported commands (set via `debug_inbox.json → { cmd, args }`):
- `ping`            — returns PP version + timestamp
- `playhead`        — returns current CTI in seconds
- `timeline`        — returns full videoTracks/clips structure (text, progression, ticks)
- `phraseMap`       — calls `getTimelinePhraseMap()` and returns the result
- `clip <t> <c>`    — dumps every MOGRT property + Motion component for track T, clip C
- `log <msg>`       — writes a custom entry to `debug_jsx.log` via `jsxLog`

IPC file paths (both under `Folder.userData/Adobe/CEP/extensions/com.aescripts.submachine/panel/logs/`):
- `debug_inbox.json`  — terminal → JSX  (written by `submachine-debug.js`, deleted by `sm_debug_poll`)
- `debug_outbox.json` — JSX → terminal  (written by `sm_debug_poll`, deleted by `submachine-debug.js`)

---

## debug/ — Terminal Debug CLI

#### submachine-debug.js  (Node.js, zero dependencies)

Entry point: `node debug/submachine-debug.js`

**Modes:**

| Invocation | Behaviour |
|---|---|
| `node submachine-debug.js` | Interactive: live log tail + REPL prompt |
| `node submachine-debug.js watch` | Log tail only (no REPL) |
| `node submachine-debug.js watch --filter <str>` | Filtered log tail |
| `node submachine-debug.js tail <N>` | Print last N lines and exit |
| `node submachine-debug.js send <cmd> [args]` | Send one IPC command, print response, exit |
| `node submachine-debug.js clear` | Truncate log file and exit |

**Interactive REPL commands** (same as IPC commands above, plus):
- `help`    — list all commands
- `clear`   — truncate log file
- `quit`    — exit

**Log output format:**
Each line is parsed as `[HH:MM:SS] [LEVEL] message` and printed with:
- ANSI colour per level: `ERROR`=red, `WARN`=yellow, `INFO`=cyan, `SUCCESS`=green, `DEBUG`=gray, `BRIDGE`=magenta
- Function names, quoted strings, tick values, and error keywords highlighted automatically
