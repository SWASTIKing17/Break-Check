# Conversation Brief - Split SRT for Hindi

## Context
The user requested a new button in the "Workflow" tab to split an SRT file into word-by-word segments, using logic from an external Python script `split_srt.py`.

## Actions Taken
- **UI Enhancement**: Added a "Split for Hindi" button to `panel.html` in the Workflow tab.
- **Backend (JSX)**: Added `getProjectDirectory()` to `main.jsx` to allow the plugin to find the current Premiere Pro project folder.
- **Logic Integration**: Ported the logic from `split_srt.py` to JavaScript within `phrasing.js` for smoother integration and zero external dependencies.
- **Refinement**: Ensured the output is saved as `Hindi_Subtitle.srt` in the project directory.

## Technical Details
- The logic parses SRT timestamps into milliseconds, interpolates timing for each word in a sentence, and generates a new SRT file.
- `fs` and `path` modules are used within the Node.js/CEP environment to handle file I/O.
- The UI uses Bootstrap styling consistent with the rest of the plugin.

## Next Steps
- Verify the button behavior in the extension panel.
- Confirm the generated SRT works as expected in the subtitle creation pipeline.
