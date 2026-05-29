; installer.nsh — Custom NSIS hooks for freeXan
; Runs after the default electron-builder install/uninstall steps.

; ── After Install ─────────────────────────────────────────────────────────────
!macro customInstall
  ; Add to Windows startup (HKCU so no admin is needed).
  ; --hidden tells the app to start silently in the system tray.
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "freeXan" \
    '"$INSTDIR\freeXan.exe" --hidden'

  ; Enable Adobe CEP debug mode so the Premiere panel loads without signing.
  WriteRegStr HKCU "Software\Adobe\CSXS.9"  "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
!macroend

; ── After Uninstall ───────────────────────────────────────────────────────────
!macro customUninstall
  ; Remove the startup entry on uninstall.
  DeleteRegValue HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "freeXan"
!macroend
