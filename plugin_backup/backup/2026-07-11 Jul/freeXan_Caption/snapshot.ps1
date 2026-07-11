param([Parameter(Mandatory)][string]$Feature)

$stamp   = Get-Date -Format "yyyy-MM-dd HH:mm"
$tagStamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$tag = "stable/$Feature-$tagStamp"

git add panel/jsx/core/utils.jsx `
        panel/jsx/core/mogrt.jsx `
        panel/jsx/core/mogrt_editor.jsx `
        panel/jsx/core/sync.jsx `
        panel/jsx/core/timeline.jsx `
        panel/js/command_center_react.js `
        panel/js/tools_refactor.js `
        panel/js/dynamic_ui_manager.js `
        panel/js/phrasing.js `
        panel/js/mogrt_param_editor.js `
        panel/js/mogrt_patcher.js `
        panel/js/ui_manager.js `
        panel/js/workflow_refactor.js `
        install_mac.command

git commit -m "snapshot: $Feature ($stamp)"
git tag $tag

Write-Host "Snapshot saved: $tag"
