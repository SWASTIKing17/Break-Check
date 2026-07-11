$inputPath = "c:\Swastik Development\FreeXan Development\docs\FEATURE_GUIDE.md"
$outputPath = "c:\Swastik Development\FreeXan Development\docs\FEATURE_GUIDE.md"

$lines = Get-Content -Path $inputPath -Encoding Utf8
$newLines = @()
$inTable = $false

foreach ($line in $lines) {
    $stripped = $line.Trim()
    $isTableRow = $stripped.StartsWith('|') -and $stripped.EndsWith('|')
    
    if ($isTableRow) {
        $isSeparator = $stripped -match '^\|[\s\-:]*(\|[\s\-:]*)*$'
        
        if ($isSeparator) {
            $lastPipeIdx = $line.LastIndexOf('|')
            $newLine = $line.Substring(0, $lastPipeIdx) + '---|' + $line.Substring($lastPipeIdx)
            $newLines += $newLine
        } else {
            if (-not $inTable) {
                # Header row
                $lastPipeIdx = $line.LastIndexOf('|')
                $newLine = $line.Substring(0, $lastPipeIdx) + ' My Suggestion |' + $line.Substring($lastPipeIdx)
                $newLines += $newLine
                $inTable = $true
            } else {
                # Body row
                $lastPipeIdx = $line.LastIndexOf('|')
                $newLine = $line.Substring(0, $lastPipeIdx) + ' |' + $line.Substring($lastPipeIdx)
                $newLines += $newLine
            }
        }
    } else {
        $inTable = $false
        $newLines += $line
    }
}

$newLines | Out-File -FilePath $outputPath -Encoding utf8
Write-Host "Done processing tables in FEATURE_GUIDE.md"
