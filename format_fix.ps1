$content = [IO.File]::ReadAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", [System.Text.Encoding]::UTF8)
$content = $content -replace "`r`n", "`n"
$content = $content -replace "`r", "`n"
$content = $content -replace '(?<=>)\s*(?=<)', "`n"
$content = $content -replace '(?<=\{)\s*', "`n"
$content = $content -replace '(?<=\})\s*', "`n"
$content = $content -replace '(?<=>)\s+(?=<)', "`n"
$content = $content -replace '(?<=\{)\s*', "`n"
$content = $content -replace '(?<=\})\s*', "`n"
$content = $content -replace '(?<=>)\s+(?=<)', "`n"
[IO.File]::WriteAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", $content, [System.Text.Encoding]::UTF8)
Write-Host "Lines: $($content.Split("`n").Count)"