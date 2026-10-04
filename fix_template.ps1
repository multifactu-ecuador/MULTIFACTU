$content = [IO.File]::ReadAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", [System.Text.Encoding]::UTF8)
# Fix the template variable syntax: { { -> {{ and } } -> }}
$content = $content -replace '\{ \{', '{{'
$content = $content -replace '\} \}', '}}'
# Also fix any remaining issues with split style objects
$content = $content -replace 'style=\{\s*\{', 'style={{'
$content = $content -replace '\}\s*\}[\s]*\>', '}}>'
[IO.File]::WriteAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", $content, [System.Text.Encoding]::UTF8)
Write-Host "Fixed"