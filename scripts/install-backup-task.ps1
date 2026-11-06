param([string]$Workspace = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$backupWorkspace = (Resolve-Path -LiteralPath $Workspace).Path
$backupNode = (Get-Command node -ErrorAction Stop).Source
$backupRunner = Join-Path $backupWorkspace 'scripts/database-backup.ts'
if (!(Test-Path -LiteralPath $backupRunner)) { throw 'No se encontró el script de respaldo.' }
$backupTaskName = 'Gymora-Encrypted-Database-Backup'
if (Get-ScheduledTask -TaskName $backupTaskName -ErrorAction SilentlyContinue) { throw 'La tarea ya existe; revísala antes de reemplazarla.' }
$backupArguments = '--env-file=.env node_modules/tsx/dist/cli.mjs scripts/database-backup.ts create'
$backupAction = New-ScheduledTaskAction -Execute $backupNode -Argument $backupArguments -WorkingDirectory $backupWorkspace
$backupTrigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$backupPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger -Settings $backupSettings -Principal $backupPrincipal -Description 'Respaldo diario PostgreSQL de Gymora cifrado con AES-256-GCM. Requiere sesión de Windows y base accesible.' | Out-Null
Write-Output 'Respaldo diario registrado a las 03:00 (hora del equipo), con recuperación al estar disponible.'
