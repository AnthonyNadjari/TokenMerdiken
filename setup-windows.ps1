# TokenMerdiken — installe le watcher en arrière-plan, lancé tout seul à chaque
# ouverture de session Windows. À exécuter UNE fois dans le dossier du repo.
# (Ferme d'abord toute fenêtre du watcher déjà ouverte : Ctrl+C.)

@'
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Run "cmd /c node scripts\watch-session.mjs --push", 0, False
'@ | Set-Content -Encoding ASCII (Join-Path $PSScriptRoot 'run-watcher.vbs')

$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'TokenMerdiken.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"' + (Join-Path $PSScriptRoot 'run-watcher.vbs') + '"'
$s.WorkingDirectory = $PSScriptRoot
$s.Save()

Start-Process wscript (Join-Path $PSScriptRoot 'run-watcher.vbs')
Write-Host "OK - le watcher tourne en arriere-plan et se relancera a chaque ouverture de session."
