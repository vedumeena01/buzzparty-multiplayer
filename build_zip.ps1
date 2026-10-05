$src = "C:\Users\vedpr\.gemini\antigravity-ide\scratch\buzzparty-multiplayer"
$tempDir = "C:\Users\vedpr\.gemini\antigravity-ide\scratch\netlify-staging"
$zipLocal = "C:\Users\vedpr\.gemini\antigravity-ide\scratch\buzzparty-multiplayer\netlify-ready-game.zip"
$zipDesktop = "C:\Users\vedpr\OneDrive\Desktop\netlify-ready-game.zip"

if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Copy-Item (Join-Path $src "netlify.toml") $tempDir -Force
Copy-Item (Join-Path $src "package.json") $tempDir -Force
Copy-Item (Join-Path $src "package-lock.json") $tempDir -Force
Copy-Item (Join-Path $src "questions.json") $tempDir -Force
Copy-Item (Join-Path $src "README.md") $tempDir -Force

Copy-Item (Join-Path $src "public") $tempDir -Recurse -Force
Copy-Item (Join-Path $src "netlify") $tempDir -Recurse -Force
Copy-Item (Join-Path $src "lib") $tempDir -Recurse -Force

if (Test-Path $zipLocal) { Remove-Item -Force $zipLocal }
if (Test-Path $zipDesktop) { Remove-Item -Force $zipDesktop }

Compress-Archive -Path "$tempDir\*" -DestinationPath $zipLocal -Force
Copy-Item $zipLocal $zipDesktop -Force

Remove-Item -Recurse -Force $tempDir

Write-Host "SUCCESS: ZIP files created"
Get-Item $zipLocal | Select-Object FullName, Length
Get-Item $zipDesktop | Select-Object FullName, Length
