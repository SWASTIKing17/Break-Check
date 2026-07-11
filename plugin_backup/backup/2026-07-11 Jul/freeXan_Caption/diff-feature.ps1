param([Parameter(Mandatory)][string]$Feature, [string]$Tag = "")

# If no specific tag given, use the most recent snapshot of this feature
if (-not $Tag) {
    $Tag = git tag -l "stable/$Feature*" | Sort-Object | Select-Object -Last 1
}

if (-not $Tag) {
    Write-Host "No snapshot found for: $Feature"
    Write-Host "Available snapshots: git tag -l stable/*"
    exit 1
}

Write-Host "Comparing against: $Tag`n"

git diff $Tag -- `
    panel/jsx/core/utils.jsx `
    panel/jsx/core/mogrt.jsx `
    panel/jsx/core/sync.jsx `
    panel/jsx/core/timeline.jsx `
    panel/js/command_center_react.js `
    panel/js/tools_refactor.js `
    panel/js/dynamic_ui_manager.js `
    panel/js/phrasing.js

Write-Host "`nTo save this diff to a file: .\diff-feature.ps1 $Feature > review.diff"
