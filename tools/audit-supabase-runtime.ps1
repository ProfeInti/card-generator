$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Rg([string]$Pattern, [string[]]$Paths) {
  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if (-not $rg) {
    throw "ripgrep (rg) no esta disponible en este entorno."
  }

  & $rg.Path -n $Pattern @Paths -S
}

Write-Host "== Supabase runtime audit =="
Write-Host "Workspace: $root"
Write-Host ""

Write-Host "-- Auth references --"
Invoke-Rg "auth\.getUser\(|auth\.getSession\(|auth\.signInWithPassword|auth\.signUp|auth\.signOut|createClient\(" @("src", "server")
Write-Host ""

Write-Host "-- Data / realtime references that should be absent --"
$runtimeHits = Invoke-Rg "supabase\.from\(|supabase\.rpc\(|supabase\.channel\(|postgres_changes" @("src", "server")
if ($runtimeHits) {
  Write-Host $runtimeHits
} else {
  Write-Host "No runtime data/realtime Supabase references found in src/ or server/."
}
Write-Host ""

Write-Host "-- Env references --"
Invoke-Rg "SUPABASE_|VITE_SUPABASE" @(".env.example", "README.md", "src", "server")
