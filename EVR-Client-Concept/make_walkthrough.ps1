$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$audioDir = Join-Path $root 'assets'
Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoice('Microsoft Zira Desktop')
$voice.Rate = 2
$segments = (Get-Content -LiteralPath (Join-Path $root 'WALKTHROUGH-SCRIPT.txt') -Raw) -split '\r?\n\r?\n'
try {
    for ($i = 0; $i -lt $segments.Length; $i++) {
        $path = Join-Path $audioDir ("narration-{0}.wav" -f ($i + 1))
        $voice.SetOutputToWaveFile($path)
        $voice.Speak($segments[$i])
    }
} finally {
    $voice.Dispose()
}
Write-Output 'Created five local synthetic narration segments.'
