' ── TokenMerdiken — lanceur invisible du watcher (Windows) ──────────────────
' Démarre scripts/watch-session.mjs en arrière-plan, sans fenêtre.
' Place un raccourci vers ce fichier dans le dossier Démarrage pour qu'il se
' lance tout seul à chaque ouverture de session (voir README).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
' 0 = fenêtre cachée, False = ne pas attendre
sh.Run "cmd /c node scripts\watch-session.mjs --push", 0, False
