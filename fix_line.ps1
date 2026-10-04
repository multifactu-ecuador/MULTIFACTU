$content = [IO.File]::ReadAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", [System.Text.Encoding]::UTF8)
$content = $content -replace 'setError\(e instanceof Error \? e\.message : "Error duplicando"\); \} \} if \(loading\)', 'setError(e instanceof Error ? e.message : "Error duplicando"); } } if (loading)'
[IO.File]::WriteAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", $content, [System.Text.Encoding]::UTF8)
Write-Host "Fixed"