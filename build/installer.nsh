!macro customInstall
  DetailPrint "Registering Moztro Windows Context Menu..."
  ; Register context menu for all files (*)
  WriteRegStr HKCU "Software\Classes\*\shell\MoztroSend" "" "Send with Moztro"
  WriteRegStr HKCU "Software\Classes\*\shell\MoztroSend" "Icon" '"$INSTDIR\Moztro.exe",0'
  WriteRegStr HKCU "Software\Classes\*\shell\MoztroSend\command" "" '"$INSTDIR\Moztro.exe" "%1"'

  ; Register context menu for folders (Directory)
  WriteRegStr HKCU "Software\Classes\Directory\shell\MoztroSend" "" "Send with Moztro"
  WriteRegStr HKCU "Software\Classes\Directory\shell\MoztroSend" "Icon" '"$INSTDIR\Moztro.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\MoztroSend\command" "" '"$INSTDIR\Moztro.exe" "%1"'

  ; Register context menu for folder background (Directory\Background)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\MoztroSend" "" "Send with Moztro"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\MoztroSend" "Icon" '"$INSTDIR\Moztro.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\MoztroSend\command" "" '"$INSTDIR\Moztro.exe" "%V"'

  ; Register Windows Startup Auto-run (enabled by default)
  DetailPrint "Configuring Windows Startup Run key..."
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Moztro" '"$INSTDIR\Moztro.exe" --autostart'
!macroend

!macro customUnInstall
  DetailPrint "Removing Moztro Windows Context Menu..."
  DeleteRegKey HKCU "Software\Classes\*\shell\MoztroSend"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\MoztroSend"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\MoztroSend"

  DetailPrint "Removing Moztro Windows Startup..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Moztro"
!macroend
