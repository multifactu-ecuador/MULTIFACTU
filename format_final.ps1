$content = [IO.File]::ReadAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", [System.Text.Encoding]::UTF8)
$content = $content -replace "`r`n", "`n"
$content = $content -replace "`r", "`n"

# Split into lines and reformat properly
$lines = $content -split "`n"
$output = ""
$indent = 0
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^</(div|section|main|aside|form|fieldset|button|label|select|textarea|input)>') { $indent -= 2 }
    $output += ("  " * $indent) + $line + "`n"
    if ($trimmed -match '^<(div|section|main|aside|form|fieldset|button|label|select|textarea|input)(?:\s|>)' -and $trimmed -notmatch '^</') { $indent += 2 }
    if ($trimmed -match '^</') { $indent -= 2 }
}
[IO.File]::WriteAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", $output, [System.Text.Encoding]::UTF8)
Write-Host "Lines: $($output.Split(\"`n\").Count)"