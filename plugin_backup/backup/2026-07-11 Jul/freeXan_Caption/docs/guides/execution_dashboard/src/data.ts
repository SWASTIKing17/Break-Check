export interface Container {
  id: string;
  label: string;
  column: number;
  color: string;
  accent: string;
}

export interface NodeDef {
  id: string;
  label: string;
  container: string;
  row: number;
  detail: string;
}

export interface Branch {
  id: string;
  label: string;
  color: string;
  active: boolean;
  steps: string[];
}

export const CONTAINERS: Container[] = [
  { id: 'panel_html',  label: 'panel.html  [UI Events]',          column: 0, color: '#1b3a5c', accent: '#3a7bd5' },
  { id: 'panel_js',   label: 'panel.js  [jQuery Handlers]',       column: 1, color: '#1a4030', accent: '#27ae60' },
  { id: 'react_js',   label: 'command_center_react.js  [React]',  column: 1, color: '#2d1b4e', accent: '#8e44ad' },
  { id: 'utils',      label: 'utils.jsx  [ExtendScript]',         column: 2, color: '#3d2b00', accent: '#e67e22' },
  { id: 'mogrt',      label: 'mogrt.jsx  [Caption Creation]',     column: 2, color: '#3a1515', accent: '#e74c3c' },
  { id: 'sync',       label: 'sync.jsx  [Property Sync]',         column: 2, color: '#0f3040', accent: '#16a085' },
  { id: 'timeline',   label: 'timeline.jsx  [Timeline Ops]',      column: 2, color: '#1a1a40', accent: '#2980b9' },
  { id: 'pp_api',     label: 'Premiere Pro API  [Terminal]',      column: 3, color: '#3a1040', accent: '#9b59b6' },
];

export const NODES_DEF: NodeDef[] = [
  { id:'ui_selectSRT',       label:'#selectSRT [click]',         container:'panel_html', row:0,  detail:'User clicks "Select SRT File" button in Workflow tab.' },
  { id:'ui_selectMogrt',     label:'#selectMogrt [click]',       container:'panel_html', row:1,  detail:'User clicks "Select MOGRT Template" button in Workflow tab.' },
  { id:'ui_createCaptions',  label:'#createCaptions [click]',    container:'panel_html', row:2,  detail:'User clicks "Create Captions" button to build MOGRT clips on timeline.' },
  { id:'ui_syncAll',         label:'#syncAll [click]',           container:'panel_html', row:3,  detail:'User clicks "Sync All" in Tools tab to copy all MOGRT properties from master clip.' },
  { id:'ui_syncText',        label:'#syncText [click]',          container:'panel_html', row:4,  detail:'User clicks "Sync Text" to copy text + typeface only.' },
  { id:'ui_splitPhrase',     label:'#splitPhrase [click]',       container:'panel_html', row:5,  detail:'User clicks "Split Phrase" to divide a phrase at the playhead position.' },
  { id:'ui_joinPhrases',     label:'#joinPhrases [click]',       container:'panel_html', row:6,  detail:'User clicks "Join Phrases" to merge two adjacent phrases into one.' },
  { id:'ui_addWord',         label:'#addWordBtn [click]',        container:'panel_html', row:7,  detail:'User clicks "Add Word" or presses Enter in the word input field.' },
  { id:'ui_removeWord',      label:'#removeWordBtn [click]',     container:'panel_html', row:8,  detail:'User clicks "Remove Word" to delete the word under the playhead.' },
  { id:'ui_resetAll',        label:'#resetAll [click]',          container:'panel_html', row:9,  detail:'User clicks "Reset All" in Advanced Tools to wipe all MOGRT properties to defaults.' },
  { id:'ui_syncPSR',         label:'#syncPSR [click]',           container:'panel_html', row:10, detail:'User clicks "Sync PSR" to copy Position, Scale, and Rotation from master clip.' },
  { id:'react_bubbleClick',  label:'WordBubble [onClick]',       container:'panel_html', row:11, detail:'User clicks a word bubble in the React Edit tab.' },
  { id:'react_split',        label:'WordBubble [onSplit]',       container:'panel_html', row:12, detail:'User clicks the split icon on a word bubble.' },
  { id:'react_merge',        label:'Footer Merge [click]',       container:'panel_html', row:13, detail:'User clicks the ⚡ Merge button in the React Edit tab footer.' },
  { id:'react_transfer',     label:'Sortable [onEnd]',           container:'panel_html', row:14, detail:'User drag-drops a word bubble between phrases via Sortable.js.' },
  { id:'h_selectSRT',       label:'$("#selectSRT").click()',       container:'panel_js', row:0,  detail:'jQuery click handler. Calls evalScript("selectSRT()") via Adobe CEP bridge.' },
  { id:'h_selectMogrt',     label:'$("#selectMogrt").click()',     container:'panel_js', row:1,  detail:'jQuery click handler. Calls evalScript("selectMogrt()") via CEP bridge.' },
  { id:'h_createCaptions',  label:'$("#createCaptions").click()', container:'panel_js', row:2,  detail:'jQuery click handler. Serialises form data to JSON, calls evalScript("createCaptions(data)").' },
  { id:'h_syncAll',         label:'$("#syncAll").click()',         container:'panel_js', row:3,  detail:'jQuery click handler → evalScript("syncAllGetData(params)").' },
  { id:'h_syncText',        label:'$("#syncText").click()',        container:'panel_js', row:4,  detail:'jQuery click handler → evalScript("syncTextGetData(params)").' },
  { id:'h_splitPhrase',     label:'$("#splitPhrase").click()',     container:'panel_js', row:5,  detail:'jQuery click handler → evalScript("splitPhraseGetMogrtData()").' },
  { id:'h_joinPhrases',     label:'$("#joinPhrases").click()',     container:'panel_js', row:6,  detail:'jQuery click handler → evalScript("sm_tools_join_v28()").' },
  { id:'h_addWord',         label:'$("#addWordBtn").click()',      container:'panel_js', row:7,  detail:'jQuery click handler → evalScript("sm_tools_add_word_v28(params)").' },
  { id:'h_removeWord',      label:'$("#removeWordBtn").click()',   container:'panel_js', row:8,  detail:'jQuery click handler → evalScript("sm_tools_remove_word_v28()").' },
  { id:'h_resetAll',        label:'$("#resetAll").click()',        container:'panel_js', row:9,  detail:'jQuery click handler → evalScript("resetAllGetData()").' },
  { id:'h_syncPSR',         label:'$("#syncPSR").click()',         container:'panel_js', row:10, detail:'jQuery click handler → evalScript("syncPSRGetData()").' },
  { id:'handleBubbleClick', label:'handleBubbleClick()',           container:'react_js', row:0, detail:'Sets activeClipId state. Calls callJSX("updateMogrtProperty", params) to activate clip in Premiere.' },
  { id:'handleSplit',       label:'handleSplit()',                 container:'react_js', row:1, detail:'Calls callJSX("sm_tools_split_join_v28", {pIdx, cIdx}) to split/join a word at a laser gap.' },
  { id:'handleMerge',       label:'handleMerge()',                 container:'react_js', row:2, detail:'Calls callJSX("sm_tools_join_v28", params) to merge selected words.' },
  { id:'handleTransfer',    label:'handleTransfer()',              container:'react_js', row:3, detail:'Calls callJSX("executeWordTransfer", params) after Sortable.js drag-drop ends.' },
  { id:'callJSX',           label:'callJSX(fn, params)',           container:'react_js', row:4, detail:'React helper. Calls evalScript via Adobe CEP bridge, parses JSON result, updates React state.' },
  { id:'selectSRT',         label:'selectSRT()',                   container:'utils', row:0, detail:'Opens OS file dialog filtered to .srt files. Returns JSON {srtFilePath, srtFileName}.' },
  { id:'selectMogrt',       label:'selectMogrt()',                 container:'utils', row:1, detail:'Opens OS file dialog filtered to .mogrt files. Returns JSON {mogrtPath, mogrtName}.' },
  { id:'safeCall',          label:'safeCall(fn, args)',            container:'utils', row:2, detail:'Error wrapper used around every JSX function. Catches exceptions, returns {status:"Error", message}.' },
  { id:'startUndo',         label:'startUndo(label)',              container:'utils', row:3, detail:'Begins a Premiere undo group so all operations are atomic.' },
  { id:'endUndo',           label:'endUndo()',                     container:'utils', row:4, detail:'Closes the Premiere undo group.' },
  { id:'createCaptions',    label:'createCaptions(captionData)',   container:'mogrt', row:0, detail:'Main entry point. Iterates SRT cues and creates one MOGRT clip per word with timing.' },
  { id:'findProjectItem',   label:'findProjectItem(name)',         container:'mogrt', row:1, detail:'Recursively searches the Premiere project tree for a project item by name.' },
  { id:'importMGT',         label:'clip.importMGT()',              container:'mogrt', row:2, detail:'Premiere API: creates a new MOGRT clip instance on the sequence from the template item.' },
  { id:'syncAllGetData',    label:'syncAllGetData(params)',        container:'sync', row:0,  detail:'Phase 1 of Sync All: finds the master MOGRT clip under the playhead and extracts all 40+ properties.' },
  { id:'syncAll',           label:'syncAll(data)',                 container:'sync', row:1,  detail:'Phase 2 of Sync All: applies master properties to all selected clips, guarding phrase-specific glyphs.' },
  { id:'syncTextGetData',   label:'syncTextGetData(params)',       container:'sync', row:2,  detail:'Phase 1 of Sync Text: extracts text content and typeface properties from master clip.' },
  { id:'syncText',          label:'syncText(data)',                container:'sync', row:3,  detail:'Phase 2 of Sync Text: applies text and typeface to selected clips.' },
  { id:'sm_sync_batch',     label:'sm_sync_batch(data)',           container:'sync', row:4,  detail:'Batch helper called by syncText. Loops through clips and calls setValue() for each matched property.' },
  { id:'updateMogrtProp',   label:'updateMogrtProperty(params)',   container:'sync', row:5,  detail:'Updates a single MOGRT property on a specific clip. Used by React on word click/edit.' },
  { id:'executeWordXfer',   label:'executeWordTransfer(params)',   container:'sync', row:6,  detail:'Moves a word (clip) from one phrase track to another after React drag-drop.' },
  { id:'syncPSRGetData',    label:'syncPSRGetData(params)',        container:'sync', row:7,  detail:'Phase 1 of Sync PSR: extracts Position, Scale, Rotation values from master clip.' },
  { id:'syncPSR',           label:'syncPSR(data)',                 container:'sync', row:8,  detail:'Phase 2 of Sync PSR: applies PSR values to selected clips.' },
  { id:'resetAllGetData',   label:'resetAllGetData()',             container:'sync', row:9,  detail:'Phase 1 of Reset All: reads current property count from master clip.' },
  { id:'resetAll',          label:'resetAll(data)',                container:'sync', row:10, detail:'Phase 2 of Reset All: calls setValue() with default values for every MOGRT property on selected clips.' },
  { id:'splitPhraseGetData',label:'splitPhraseGetMogrtData()',     container:'timeline', row:0, detail:'Gathers clip data at playhead needed for the split operation.' },
  { id:'sm_split_v28',      label:'sm_tools_split_v28(params)',    container:'timeline', row:1, detail:'Splits a phrase at a word boundary. Moves Part B clips to the next video track.' },
  { id:'sm_join_v28',       label:'sm_tools_join_v28(params)',     container:'timeline', row:2, detail:'Joins two adjacent phrases by moving Part B clips back to the anchor track.' },
  { id:'sm_splitjoin_v28',  label:'sm_tools_split_join_v28()',     container:'timeline', row:3, detail:'Word Surgery: routes to add-word or remove-word based on clip state under playhead.' },
  { id:'sm_add_word',       label:'sm_tools_add_word_v28()',       container:'timeline', row:4, detail:'Inserts a new word clip after the playhead. Updates word progression sliders.' },
  { id:'sm_remove_word',    label:'sm_tools_remove_word_v28()',    container:'timeline', row:5, detail:'Deletes the word clip under the playhead. Shifts remaining word slots.' },
  { id:'getPhraseClips',    label:'getPhraseClips(track, idx)',    container:'timeline', row:6, detail:'Returns all MOGRT clips belonging to the same phrase on a given track.' },
  { id:'moveClipToTrack',   label:'moveClipToTrack(clip, track)',  container:'timeline', row:7, detail:'Moves a clip to a different video track, preserving in/out timing.' },
  { id:'findNeighborPhrase',label:'findNeighborPhrase()',          container:'timeline', row:8, detail:'Finds the adjacent phrase (above or below) that can be joined to the current one.' },
  { id:'api_fileDialog',    label:'File.openDialog()',             container:'pp_api', row:0,  detail:'ExtendScript File API. Opens native OS file picker. Returns a File object.' },
  { id:'api_setValue',      label:'mgt.properties[n].setValue()', container:'pp_api', row:1,  detail:'Premiere API: sets a MOGRT numeric/slider property value on a clip.' },
  { id:'api_setColorValue', label:'mgt.properties[n].setColorValue()', container:'pp_api', row:2, detail:'Premiere API: sets a MOGRT color property (RGBA).' },
  { id:'api_importMGT',     label:'seq.videoTracks[n].overwriteClip()', container:'pp_api', row:3, detail:'Premiere API: places the MOGRT clip instance onto the timeline at the given time.' },
  { id:'api_getClips',      label:'track.clips[] [access]',      container:'pp_api', row:4,  detail:'Premiere API: iterates clips on a video track to find neighbors.' },
  { id:'api_moveClip',      label:'clip.move() / track rearrange', container:'pp_api', row:5, detail:'Premiere API: moves a clip to a different track at the same timecode.' },
];

export const BRANCHES: Branch[] = [
  {
    id: 'b1', label: '#selectSRT click', color: '#FF6B6B', active: true,
    steps: ['ui_selectSRT', 'h_selectSRT', 'selectSRT', 'api_fileDialog']
  },
  {
    id: 'b2', label: '#selectMogrt click', color: '#FF9F43', active: true,
    steps: ['ui_selectMogrt', 'h_selectMogrt', 'selectMogrt', 'api_fileDialog']
  },
  {
    id: 'b3', label: '#createCaptions click', color: '#FECA57', active: true,
    steps: ['ui_createCaptions', 'h_createCaptions', 'createCaptions', 'findProjectItem', 'importMGT', 'startUndo', 'api_setValue', 'api_importMGT', 'endUndo']
  },
  {
    id: 'b4', label: '#syncAll click', color: '#48DBFB', active: true,
    steps: ['ui_syncAll', 'h_syncAll', 'syncAllGetData', 'syncAll', 'startUndo', 'api_setValue', 'api_setColorValue', 'endUndo']
  },
  {
    id: 'b5', label: '#syncText click', color: '#1DD1A1', active: true,
    steps: ['ui_syncText', 'h_syncText', 'syncTextGetData', 'syncText', 'sm_sync_batch', 'api_setValue', 'endUndo']
  },
  {
    id: 'b6', label: '#splitPhrase click', color: '#54A0FF', active: true,
    steps: ['ui_splitPhrase', 'h_splitPhrase', 'splitPhraseGetData', 'sm_split_v28', 'getPhraseClips', 'startUndo', 'moveClipToTrack', 'api_moveClip', 'endUndo']
  },
  {
    id: 'b7', label: '#joinPhrases click', color: '#A29BFE', active: true,
    steps: ['ui_joinPhrases', 'h_joinPhrases', 'sm_join_v28', 'findNeighborPhrase', 'getPhraseClips', 'startUndo', 'moveClipToTrack', 'api_moveClip', 'endUndo']
  },
  {
    id: 'b8', label: '#addWordBtn click', color: '#C8D6E5', active: true,
    steps: ['ui_addWord', 'h_addWord', 'sm_add_word', 'updateMogrtProp', 'startUndo', 'api_setValue', 'endUndo']
  },
  {
    id: 'b9', label: '#removeWordBtn click', color: '#EE5A24', active: true,
    steps: ['ui_removeWord', 'h_removeWord', 'sm_remove_word', 'updateMogrtProp', 'startUndo', 'api_setValue', 'endUndo']
  },
  {
    id: 'b10', label: 'React: WordBubble click', color: '#00D2D3', active: true,
    steps: ['react_bubbleClick', 'handleBubbleClick', 'callJSX', 'updateMogrtProp', 'api_setValue']
  },
  {
    id: 'b11', label: 'React: Word split', color: '#9B59B6', active: true,
    steps: ['react_split', 'handleSplit', 'callJSX', 'sm_splitjoin_v28', 'sm_split_v28', 'getPhraseClips', 'api_moveClip']
  },
  {
    id: 'b12', label: 'React: Merge words', color: '#10AC84', active: true,
    steps: ['react_merge', 'handleMerge', 'callJSX', 'sm_join_v28', 'findNeighborPhrase', 'getPhraseClips', 'api_moveClip']
  },
  {
    id: 'b13', label: 'React: Word transfer (drag)', color: '#F368E0', active: true,
    steps: ['react_transfer', 'handleTransfer', 'callJSX', 'executeWordXfer', 'startUndo', 'api_setValue', 'api_moveClip', 'endUndo']
  },
  {
    id: 'b14', label: '#resetAll click', color: '#BDC3C7', active: true,
    steps: ['ui_resetAll', 'h_resetAll', 'resetAllGetData', 'resetAll', 'startUndo', 'api_setValue', 'endUndo']
  },
  {
    id: 'b15', label: '#syncPSR click', color: '#6C5CE7', active: true,
    steps: ['ui_syncPSR', 'h_syncPSR', 'syncPSRGetData', 'syncPSR', 'startUndo', 'api_setValue', 'endUndo']
  },
];
