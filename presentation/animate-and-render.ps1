$ErrorActionPreference = 'Stop'
$deckPath = Join-Path (Get-Location) 'presentation-deck.pptx'
$previewPath = Join-Path (Get-Location) 'presentation\preview'
New-Item -ItemType Directory -Force -Path $previewPath | Out-Null
$pptApp = New-Object -ComObject PowerPoint.Application
$pptApp.DisplayAlerts = 1
$pres = $null
try {
  $pres = $pptApp.Presentations.Open($deckPath, $false, $false, $false)
  $report = @()
  foreach ($slide in $pres.Slides) {
    $sequence = $slide.TimeLine.MainSequence
    $targets = @()
    foreach ($item in $slide.Shapes) {
      if ($item.Name -match '^reveal_(\d+)$') {
        $targets += [PSCustomObject]@{ Shape = $item; Order = [int]$Matches[1] }
      }
    }
    $lastOrder = -1
    foreach ($target in ($targets | Sort-Object Order)) {
      $trigger = 2
      if ($target.Order -ne $lastOrder) { $trigger = 3 }
      $effect = $sequence.AddEffect($target.Shape, 10, 0, $trigger)
      $effect.Timing.Duration = 0.38
      $effect.Timing.TriggerDelayTime = 0.0
      $lastOrder = $target.Order
    }
    $slide.SlideShowTransition.AdvanceOnClick = -1
    $slide.SlideShowTransition.AdvanceOnTime = 0
    $report += [PSCustomObject]@{ Slide = $slide.SlideIndex; Effects = $sequence.Count; Shapes = $slide.Shapes.Count }
  }
  $pres.Save()
  $pres.Export($previewPath, 'PNG', 1600, 900)
  $report | ConvertTo-Json | Set-Content -Encoding utf8 'presentation\animation-report.json'
  $report | Format-Table
} finally {
  if ($null -ne $pres) { $pres.Close(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null }
  if ($pptApp.Presentations.Count -eq 0) { $pptApp.Quit() }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pptApp) | Out-Null
}
