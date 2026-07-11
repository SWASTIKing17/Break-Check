!macro customUnInstall
  ; This macro runs during the uninstallation process.

  ; 1. Kill the background usage monitor if it is currently running.
  ; Without this, the uninstaller might fail to delete the bin folder because the executable is locked.
  nsExec::ExecToLog 'taskkill /F /IM usage_monitor.exe'

  ; 2. Remove the registry key to prevent Windows from attempting to start the deleted executable on boot.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FreeXanUsageMonitor"
!macroend
