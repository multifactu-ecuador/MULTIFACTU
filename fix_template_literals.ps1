$content = [IO.File]::ReadAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", [System.Text.Encoding]::UTF8)

# Fix template literals split across lines
# Match patterns like {{ ... }} split across lines
$content = $content -replace '\{\s*\{\s*cliente\.nombre\s*\}\s*\}\s*,\s*\{\{\s*total\s*\}\s*\}\s*,\s*\{\{\s*logo\s*\}\}\s*\.', '{{cliente.nombre}}, {{total}}, {{logo}}'
$content = $content -replace 'Usa \{\s*\{\s*cliente\.nombre\}\s*\}\s*,\s*\{\s*\{\s*total\s*\}\}\s*,\s*\{\s*\{\s*logo\s*\}\}\}\s*\.\s*HTML/CSS\.', 'Usa {{cliente.nombre}}, {{total}}, {{logo}}. HTML/CSS.'
$content = $content -replace 'Usa \{\s*\{\s*cliente\.nombre\}\}\s*,\s*\{\s*\{\s*total\s*\}\}\s*,\s*\{\s*\{\s*logo\s*\}\}\}\s*\.\s*HTML/CSS\.', 'Usa {{cliente.nombre}}, {{total}}, {{logo}}. HTML/CSS.'
$content = $content -replace 'Usa \{\s*\{\s*cliente\.nombre\}\}\s*,\s*\{\s*\{\s*total\s*\}\}\s*,\s*\{\s*\{\s*logo\s*\}\}\}\s*\.\s*HTML/CSS\.', 'Usa {{cliente.nombre}}, {{total}}, {{logo}}. HTML/CSS.'
# Fix any remaining split template literals
$content = $content -replace '\{\s*\{', '{{'
$content = $content -replace '\}\s*\}', '}}'
# Fix any remaining style attributes
$content = $content -replace '<p style=\{\s*\{', '<p style={{'
$content = $content -replace '<legend style=\{\s*\{', '<legend style={{'
$content = $content -replace '<div style=\{\s*\{', '<div style={{'
$content = $content -replace '<button style=\{\s*\{', '<button style={{'
$content = $content -replace '<input style=\{\s*\{', '<input style={{'
$content = $content -replace '<textarea style=\{\s*\{', '<textarea style={{'
$content = $content -replace '<select style=\{\s*\{', '<select style={{'
$content = $content -replace '<fieldset style=\{\s*\{', '<fieldset style={{'
$content = $content -replace '<legend style=\{\s*\{', '<legend style={{'
$content = $content -replace '<p style=\{\s*\{', '<p style={{'
$content = $content -replace '<label style=\{\s*\{', '<label style={{'
$content = $content -replace '<button style=\{\s*\{', '<button style={{'
$content = $content -replace '<input style=\{\s*\{', '<input style={{'
$content = $content -replace '<textarea style=\{\s*\{', '<textarea style={{'
$content = $content -replace '<select style=\{\s*\{', '<select style={{'
$content = $content -replace '<fieldset style=\{\s*\{', '<fieldset style={{'
$content = $content -replace '<legend style=\{\s*\{', '<legend style={{'
$content = $content -replace '<p style=\{\s*\{', '<p style={{'
$content = $content -replace '<label style=\{\s*\{', '<label style={{'
$content = $content -replace '<button style=\{\s*\{', '<button style={{'
$content = $content -replace '<input style=\{\s*\{', '<input style={{'
$content = $content -replace '<textarea style=\{\s*\{', '<textarea style={{'
$content = $content -replace '<select style=\{\s*\{', '<select style={{'
$content = $content -replace '<fieldset style=\{\s*\{', '<fieldset style={{'
$content = $content -replace '<legend style=\{\s*\{', '<legend style={{'
$content = $content -replace '<p style=\{\s*\{', '<p style={{'
$content = $content -replace '\}\s*\}\s*>', '}}>'
$content = $content -replace '\}\s*\}\s*\)', '}})'
$content = $content -replace '\}\s*\}\s*\}\s*>', '}}}>'
[IO.File]::WriteAllText("C:\Users\Sebastian Lopez\Desktop\MULTIFACTU-Supabase\client\src\pages\TemplatesEditor.tsx", $content, [System.Text.Encoding]::UTF8)
Write-Host "Fixed template literals"