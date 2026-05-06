$ErrorActionPreference = "Stop"

$node = $env:CODEX_NODE
if (-not $node) {
  $node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path $node)) {
  throw "Node runtime not found. Set CODEX_NODE to node.exe."
}

& $node ".\node_modules\next\dist\bin\next" dev --hostname 127.0.0.1 --port 3000
