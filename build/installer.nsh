; installer.nsh — Custom NSIS hooks for freeXan
;
; Adds a custom "Plugins" wizard page after the directory page, with one
; checkbox per CEP plugin (all checked by default). The user's selection
; is written to `plugins-enabled.json` next to the installed exe.
; On every app launch, main.js reads that file and copies only enabled
; plugins from `resources/plugins/<name>/` to
; %APPDATA%/Adobe/CEP/extensions/<name>/.
;
; electron-builder includes our installer.nsh BEFORE MUI2.nsh, so we must
; pull in the headers we depend on (MUI2 for MUI_HEADER_TEXT, nsDialogs for
; the dialog/checkbox helpers, LogicLib for ${If}/${Else}). NSIS uses header
; guards, so re-including is safe.
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; The Plugins page is only meaningful in the installer build. Gating with
; `!ifndef BUILD_UNINSTALLER` prevents NSIS warning 6010 ("function not
; referenced") and warning 6001 ("variable never set, wasting memory")
; during the uninstaller compile pass, which would otherwise be promoted
; to fatal errors by `warningsAsErrors: true`.
!ifndef BUILD_UNINSTALLER

; ── State variables for each plugin checkbox ───────────────────────────────────
Var Dialog
Var IntroLabel
Var ChkLink
Var ChkAudio
Var ChkMister
Var ChkSub
Var EnableLink
Var EnableAudio
Var EnableMister
Var EnableSub

; ── Default the checkbox state-vars to "checked" so a silent / Back-navigated
; install still produces a sensible plugins-enabled.json.
!macro preInit
  StrCpy $EnableLink   ${BST_CHECKED}
  StrCpy $EnableAudio  ${BST_CHECKED}
  StrCpy $EnableMister ${BST_CHECKED}
  StrCpy $EnableSub    ${BST_CHECKED}
!macroend

; ── Plugins page: create ───────────────────────────────────────────────────────
Function PluginsPageCreate
  !insertmacro MUI_HEADER_TEXT \
    "Choose Plugins" \
    "Select which freeXan plugins to install with the app. All are recommended."

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u \
    "freeXan ships with four Adobe Premiere Pro plugins. Uncheck any you do not want to install. You can re-run the installer at any time to change this selection."
  Pop $IntroLabel

  ${NSD_CreateCheckbox} 0 38u 100% 12u "Link freeXan   —   Bridges freeXan to Premiere (auto-import, project sync)"
  Pop $ChkLink
  ${If} $EnableLink == ${BST_CHECKED}
    ${NSD_Check} $ChkLink
  ${EndIf}

  ${NSD_CreateCheckbox} 0 54u 100% 12u "Audio freeXan   —   Audio library panel (browse, trim, drag to timeline)"
  Pop $ChkAudio
  ${If} $EnableAudio == ${BST_CHECKED}
    ${NSD_Check} $ChkAudio
  ${EndIf}

  ${NSD_CreateCheckbox} 0 70u 100% 12u "MisterBloomX   —   MOGRT browser (search, favorites, tag editor)"
  Pop $ChkMister
  ${If} $EnableMister == ${BST_CHECKED}
    ${NSD_Check} $ChkMister
  ${EndIf}

  ${NSD_CreateCheckbox} 0 86u 100% 12u "freeXan Caption   —   MOGRT timeline executor (applies MOGRT to sequence)"
  Pop $ChkSub
  ${If} $EnableSub == ${BST_CHECKED}
    ${NSD_Check} $ChkSub
  ${EndIf}

  nsDialogs::Show
FunctionEnd

; ── Plugins page: leave (capture state into vars) ──────────────────────────────
Function PluginsPageLeave
  ${NSD_GetState} $ChkLink   $EnableLink
  ${NSD_GetState} $ChkAudio  $EnableAudio
  ${NSD_GetState} $ChkMister $EnableMister
  ${NSD_GetState} $ChkSub    $EnableSub
FunctionEnd

; ── Register the custom page with electron-builder's NSIS template ─────────────
; This macro is invoked by electron-builder right after MUI_PAGE_DIRECTORY.
!macro customPageAfterChangeDir
  Page custom PluginsPageCreate PluginsPageLeave
!macroend

!endif ; !BUILD_UNINSTALLER

; ── After Install ─────────────────────────────────────────────────────────────
!macro customInstall
  ; Write the plugin-selection manifest. main.js reads this on every launch
  ; to decide which plugins to install into %APPDATA%/Adobe/CEP/extensions/.
  FileOpen $0 "$INSTDIR\plugins-enabled.json" w
  FileWrite $0 "{$\r$\n"

  ${If} $EnableLink == ${BST_CHECKED}
    FileWrite $0 '  "Link_freeXan": true,$\r$\n'
  ${Else}
    FileWrite $0 '  "Link_freeXan": false,$\r$\n'
  ${EndIf}

  ${If} $EnableAudio == ${BST_CHECKED}
    FileWrite $0 '  "Audio_freeXan": true,$\r$\n'
  ${Else}
    FileWrite $0 '  "Audio_freeXan": false,$\r$\n'
  ${EndIf}

  ${If} $EnableMister == ${BST_CHECKED}
    FileWrite $0 '  "MisterBloomX": true,$\r$\n'
  ${Else}
    FileWrite $0 '  "MisterBloomX": false,$\r$\n'
  ${EndIf}

  ${If} $EnableSub == ${BST_CHECKED}
    FileWrite $0 '  "SubMachine": true$\r$\n'
  ${Else}
    FileWrite $0 '  "SubMachine": false$\r$\n'
  ${EndIf}

  FileWrite $0 "}$\r$\n"
  FileClose $0

  ; Add to Windows startup (HKCU so no admin is needed).
  ; --hidden tells the app to start silently in the system tray.
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "freeXan" \
    '"$INSTDIR\freeXan.exe" --hidden'

  ; Enable Adobe CEP debug mode so the panels load without signing.
  WriteRegStr HKCU "Software\Adobe\CSXS.9"  "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
!macroend

; ── After Uninstall ───────────────────────────────────────────────────────────
; Note: electron-builder expects the macro name `customUnInstall` (capital I).
!macro customUnInstall
  ; Remove the startup entry on uninstall.
  DeleteRegValue HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "freeXan"

  ; Remove all installed CEP plugin folders from Adobe extensions dir.
  ; Bundle-id folders (current install convention — matches .bat installers
  ; and the runtime installCEPExtension() in main.js).
  RMDir /r "$APPDATA\Adobe\CEP\extensions\com.bloomx.freexan.link"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\com.bloomx.freexan.audio"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\com.bloomx.misterbloomx"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\com.bloomx.freexan.caption"
  ; Pre-rebrand id (≤ v3.1.4, when SubMachine still shipped as com.aescripts.submachine)
  RMDir /r "$APPDATA\Adobe\CEP\extensions\com.aescripts.submachine"
  ; Legacy folder-name installs (pre-bundle-id-standardisation, ≤ v3.1.3).
  RMDir /r "$APPDATA\Adobe\CEP\extensions\Link_freeXan"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\Audio_freeXan"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\MisterBloomX"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\SubMachine"
  ; Legacy combined bundle (pre-v3.1.0)
  RMDir /r "$APPDATA\Adobe\CEP\extensions\freexan-link"

  ; Remove the plugin manifest written at install.
  Delete "$INSTDIR\plugins-enabled.json"
!macroend
