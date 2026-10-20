$ErrorActionPreference = 'Stop'
$deckPath = Join-Path (Get-Location) 'presentation-deck.pptx'
$previewPath = Join-Path (Get-Location) 'presentation\dark-preview'
New-Item -ItemType Directory -Force -Path $previewPath | Out-Null
$pptApp = New-Object -ComObject PowerPoint.Application
$pptApp.DisplayAlerts = 1
$pres = $null
try {
  $pres = $pptApp.Presentations.Open($deckPath, $false, $false, $false)
  $report = @()
  $overflows = @()
  foreach ($slide in $pres.Slides) {
    $sequence = $slide.TimeLine.MainSequence
    while ($sequence.Count -gt 0) { $sequence.Item(1).Delete() }
    $targets = @()
    foreach ($item in $slide.Shapes) {
      if ($item.Name -match '^(reveal|chart|wipe)_(\d+)$') {
        $targets += [PSCustomObject]@{ Shape = $item; Kind=$Matches[1]; Order = [int]$Matches[2] }
      }
      if ($item.HasTextFrame -eq -1 -and $item.TextFrame.HasText -eq -1) {
        if ($item.TextFrame2.TextRange.BoundHeight -gt ($item.Height + 2)) {
          $overflows += [PSCustomObject]@{Slide=$slide.SlideIndex; Shape=$item.Name; Text=$item.TextFrame.TextRange.Text; BoundHeight=$item.TextFrame2.TextRange.BoundHeight; Height=$item.Height}
        }
      }
    }
    $lastOrder = -1
    $chartBuilds = 0
    foreach ($target in ($targets | Sort-Object Order)) {
      $trigger = 2
      if ($target.Order -ne $lastOrder) { $trigger = 3 }
      $effectId = 10
      if ($target.Kind -eq 'chart' -or $target.Kind -eq 'wipe') { $effectId = 22 }
      $buildLevel = 0
      if ($target.Kind -eq 'chart') { $chartBuilds++ }
      $effect = $sequence.AddEffect($target.Shape, $effectId, $buildLevel, $trigger)
      $effect.Timing.Duration = 0.6
      $effect.Timing.TriggerDelayTime = 0.0
      $lastOrder = $target.Order
    }
    $slide.SlideShowTransition.AdvanceOnClick = -1
    $slide.SlideShowTransition.AdvanceOnTime = 0
    $report += [PSCustomObject]@{ Slide = $slide.SlideIndex; Effects = $sequence.Count; AnimatedCharts=$chartBuilds; Shapes = $slide.Shapes.Count }
  }
  $pres.Save()
  $pres.Export($previewPath, 'PNG', 1600, 900)
  $report | ConvertTo-Json | Set-Content -Encoding utf8 'presentation\dark-animation-report.json'
  ConvertTo-Json -InputObject @($overflows) -Depth 5 | Set-Content -Encoding utf8 'presentation\dark-layout-report.json'
  $report | Format-Table
  if ($overflows.Count) { $overflows | ConvertTo-Json } else { 'No PowerPoint text overflow.' }
} finally {
  if ($null -ne $pres) { $pres.Close(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null }
  if ($pptApp.Presentations.Count -eq 0) { $pptApp.Quit() }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pptApp) | Out-Null
}
