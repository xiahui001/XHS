param(
  [string]$Url = "https://eventwang.cn/",
  [int]$MaxPages = 3,
  [int]$MaxImages = 60,
  [int]$LoginWaitMs = 180000,
  [ValidateSet("all", "poster", "landscape", "square")]
  [string]$ImageType = "all",
  [int]$MinWidth = 320,
  [int]$MinHeight = 240,
  [string]$RequireKeyword = "",
  [string]$ContinueFlag = ".auth/eventwang.continue",
  [string]$Output = "data/eventwang"
)

$ErrorActionPreference = "Stop"

$node = $env:CODEX_NODE
if (-not $node) {
  $node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path $node)) {
  throw "Node runtime not found. Set CODEX_NODE to node.exe."
}

& $node ".\scripts\crawl-eventwang.mjs" `
  "--url=$Url" `
  "--maxPages=$MaxPages" `
  "--maxImages=$MaxImages" `
  "--loginWaitMs=$LoginWaitMs" `
  "--imageType=$ImageType" `
  "--minWidth=$MinWidth" `
  "--minHeight=$MinHeight" `
  "--requireKeyword=$RequireKeyword" `
  "--continueFlag=$ContinueFlag" `
  "--output=$Output"
