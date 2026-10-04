$content = [IO.File]::ReadAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", [System.Text.Encoding]::UTF8)
# Replace 3 closing div tags before section with 1
$content = $content -replace '</div>\s*</div>\s*</div>\s*</section>', '</div></section>'
[IO.File]::WriteAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", $content, [System.Text.Encoding]::UTF8)
Write-Host "Fixed"