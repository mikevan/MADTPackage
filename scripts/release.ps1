<#
.SYNOPSIS
  Aligns every repository in MikeVan's AI Development Toolkit on one version, in one go.

.DESCRIPTION
  Runs the five trees in dependency order (the complexity and Witness libraries
  first, because both extensions bundle their dist), and stops at the first failure so a half-aligned
  toolkit never gets committed.

  First the library: every document under MADTPackage\library is copied to its
  mirrors in the tool trees (the table $mirrors below), and every mirror is then
  checked against the library byte for byte. A document is edited in the library
  and nowhere else; see library\README.md.

  Per tree: set the version, run the tests, build, package (extensions only),
  install the VSIX locally, then, if -Commit, commit and push, and, if -Tag, tag.

  Nothing is committed unless you pass -Commit. Nothing is tagged unless you pass
  -Tag. The script shows every working tree's git status and asks once before the
  first git write, unless -Yes.

.PARAMETER Version
  The version to set everywhere, e.g. 1.0.0 or 1.1.0. Required.

.PARAMETER Subject
  The commit subject, one line. Required with -Commit.

.PARAMETER BodyFile
  A text file holding the commit body (the engineering reason). Optional with -Commit.

.PARAMETER Commit
  Commit and push each tree after it builds and tests green.

.PARAMETER Tag
  Also create an annotated tag v<Version> on each tree and push it. Only for a
  release that marks a known-good point (a 1.x language release, a 1.0).

.PARAMETER SkipTests
  Skip npm test. For a docs-only alignment. Do not use for a tagged release.

.PARAMETER NoInstall
  Do not install the built VSIXs into VS Code.

.PARAMETER Yes
  Do not ask before git writes.

.EXAMPLE
  .\release.ps1 -Version 1.0.0
  Build, test, package, and install everything at 1.0.0. No git writes.

.EXAMPLE
  .\release.ps1 -Version 1.0.0 -Commit -Tag -Subject "Toolkit 1.0.0" -BodyFile C:\temp\body.txt
  The full release: test, build, commit, tag v1.0.0, push, on all five trees.

.EXAMPLE
  .\release.ps1 -Version 1.0.1 -Commit -Subject "Install button names the interpreter"
  A patch across the toolkit without a tag.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^\d+\.\d+\.\d+$')] [string] $Version,
  [string] $Subject,
  [string] $BodyFile,
  [switch] $Commit,
  [switch] $Tag,
  [switch] $SkipTests,
  [switch] $NoInstall,
  [switch] $Yes
)

$ErrorActionPreference = 'Stop'
$root = "C:\workspace\MikeVan's AI Development Toolkit"

# Dependency order. The libraries first: both extensions bundle their dist.
$trees = @(
  @{ Name = 'complexity';  Path = "$root\complexity";  Branch = 'master'; Kind = 'library';   PackageArgs = @() },
  @{ Name = 'Witness';     Path = "$root\Witness";     Branch = 'master'; Kind = 'library';   PackageArgs = @() },
  @{ Name = 'UntangleIt';  Path = "$root\UntangleIt";  Branch = 'master'; Kind = 'extension'; PackageArgs = @('--no-dependencies') },
  @{ Name = 'DeepTest';    Path = "$root\DeepTest";    Branch = 'main';   Kind = 'extension'; PackageArgs = @('--no-dependencies') },
  @{ Name = 'MADTPackage'; Path = "$root\MADTPackage"; Branch = 'main';   Kind = 'pack';      PackageArgs = @() }
)

# The library and its mirrors. Source on the left, under MADTPackage\library;
# every copy it feeds on the right. A tool carries the documents it needs to be
# read on its own; the library is where they are written.
$library = "$root\MADTPackage\library"
$mirrors = @(
  @{ From = 'toolkit\toolkit-roadmap.md';               To = @("$root\MADTPackage\ROADMAP.md", "$root\DeepTest\docs\toolkit\toolkit-roadmap.md", "$root\UntangleIt\docs\toolkit\toolkit-roadmap.md", "$root\complexity\docs\toolkit-roadmap.md") },
  @{ From = 'toolkit\toolkit-architecture.md';          To = @("$root\DeepTest\docs\toolkit\toolkit-architecture.md", "$root\UntangleIt\docs\toolkit\toolkit-architecture.md") },
  @{ From = 'toolkit\toolkit-api.md';                   To = @("$root\DeepTest\docs\toolkit\toolkit-api.md", "$root\UntangleIt\docs\toolkit\toolkit-api.md") },
  @{ From = 'toolkit\plan-1.0-javascript-frameworks.md'; To = @("$root\DeepTest\docs\toolkit\plan-1.0-javascript-frameworks.md", "$root\UntangleIt\docs\toolkit\plan-1.0-javascript-frameworks.md") },
  @{ From = 'toolkit\mbcc-why-and-how.md';              To = @("$root\DeepTest\docs\toolkit\mbcc-why-and-how.md", "$root\UntangleIt\docs\toolkit\mbcc-why-and-how.md", "$root\complexity\docs\mbcc-why-and-how.md") },
  @{ From = 'toolkit\untangle-it-spec.md';              To = @("$root\DeepTest\docs\toolkit\untangle-it-spec.md", "$root\UntangleIt\docs\toolkit\untangle-it-spec.md") },
  @{ From = 'toolkit\witness.md';                       To = @("$root\Witness\docs\witness.md", "$root\DeepTest\docs\witness.md", "$root\UntangleIt\docs\witness.md") },
  @{ From = 'deeptest\build-status.md';                 To = @("$root\DeepTest\docs\build-status.md") },
  @{ From = 'deeptest\engineering-notes.md';            To = @("$root\DeepTest\docs\engineering-notes.md") },
  @{ From = 'deeptest\uat.md';                          To = @("$root\DeepTest\docs\uat.md") },
  @{ From = 'untangleit\build-status.md';               To = @("$root\UntangleIt\docs\build-status.md") },
  @{ From = 'untangleit\engineering-notes.md';          To = @("$root\UntangleIt\docs\engineering-notes.md") },
  @{ From = 'untangleit\uat.md';                        To = @("$root\UntangleIt\docs\uat.md") },
  @{ From = 'complexity\measures.md';                   To = @("$root\complexity\docs\measures.md") }
)

function Step {
  param([string] $What, [scriptblock] $Do)
  Write-Host ""
  Write-Host ">>> $What" -ForegroundColor Cyan
  & $Do
  if ($LASTEXITCODE -ne 0) {
    throw "FAILED: $What (exit code $LASTEXITCODE). Nothing after this point ran."
  }
}

if ($Commit -and -not $Subject) {
  throw 'Pass -Subject with -Commit.'
}
if ($Tag -and -not $Commit) {
  throw '-Tag needs -Commit.'
}
if ($Tag -and $SkipTests) {
  throw 'A tagged release runs the tests. Drop -SkipTests or -Tag.'
}
if ($BodyFile -and -not (Test-Path $BodyFile)) {
  throw "Body file not found: $BodyFile"
}
foreach ($t in $trees) {
  if (-not (Test-Path (Join-Path $t.Path 'package.json'))) {
    throw "Missing tree: $($t.Path)"
  }
}

Write-Host "Toolkit release $Version" -ForegroundColor Green
Write-Host "Trees, in order: $($trees.Name -join ', ')"
Write-Host "Commit: $Commit   Tag: $Tag   Tests: $(-not $SkipTests)   Install: $(-not $NoInstall)"

# ---- Phase 0: the library to its mirrors, then every mirror checked. ----
Write-Host ""
Write-Host ">>> library: mirror $($mirrors.Count) documents" -ForegroundColor Cyan
foreach ($m in $mirrors) {
  $from = Join-Path $library $m.From
  if (-not (Test-Path $from)) { throw "Library document missing: $from" }
  foreach ($to in $m.To) {
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    Copy-Item -Path $from -Destination $to -Force
  }
}
foreach ($m in $mirrors) {
  $want = (Get-FileHash (Join-Path $library $m.From) -Algorithm SHA256).Hash
  foreach ($to in $m.To) {
    $have = (Get-FileHash $to -Algorithm SHA256).Hash
    if ($have -ne $want) { throw "Mirror differs from the library after copying: $to" }
  }
}
Write-Host "library: every mirror matches." -ForegroundColor Green

# ---- Phase 1: version, test, build, package, install. No git writes. ----
foreach ($t in $trees) {
  Set-Location $t.Path
  Step "$($t.Name): set version $Version" { npm version $Version --no-git-tag-version --allow-same-version | Out-Null }
  if ($t.Name -eq 'UntangleIt') {
    # The panel title carries the version in package.json's view name.
    $pkg = Get-Content package.json -Raw
    $pkg = [regex]::Replace($pkg, '"name": "UntangleIt \d+\.\d+\.\d+"', "`"name`": `"UntangleIt $Version`"")
    Set-Content -Path package.json -Value $pkg -NoNewline
  }
  if ($t.Kind -ne 'pack') {
    if (-not $SkipTests) {
      Step "$($t.Name): npm test" { npm test }
    }
    Step "$($t.Name): npm run build" { npm run build }
  }
  if ($t.Kind -ne 'library') {
    Remove-Item (Join-Path $t.Path '*.vsix') -ErrorAction SilentlyContinue
    Step "$($t.Name): package" { npx @vscode/vsce package @($t.PackageArgs) }
    $vsix = Get-ChildItem (Join-Path $t.Path '*.vsix') | Select-Object -First 1
    if (-not $vsix) { throw "$($t.Name): no VSIX was produced." }
    if ($vsix.Name -notmatch [regex]::Escape($Version)) { throw "$($t.Name): VSIX is $($vsix.Name), not version $Version." }
    if (-not $NoInstall) {
      Step "$($t.Name): install $($vsix.Name)" { code --install-extension $vsix.FullName --force }
    }
  }
}

Write-Host ""
Write-Host "Phase 1 green: every tree is at $Version, tested, built, and packaged." -ForegroundColor Green

if (-not $Commit) {
  Write-Host "No git writes requested (pass -Commit to commit and push, -Tag to tag)."
  exit 0
}

# ---- Phase 2: check every branch and remote, show the trees, ask once, then commit, tag, push. ----

# Every branch and every remote is checked before the first git write. This used to sit inside
# the commit loop, which let an early tree commit and push and then a later
# tree fail, leaving exactly the half-aligned toolkit this script exists to
# prevent. symbolic-ref, not rev-parse: on a repository whose first commit has
# not been made yet, `rev-parse --abbrev-ref HEAD` answers the literal string
# 'HEAD', so a brand new tree could never pass its own branch check.
Write-Host ""
Write-Host ">>> checking every branch and remote before any git write" -ForegroundColor Cyan
foreach ($t in $trees) {
  Set-Location $t.Path
  # No stderr redirection here: under $ErrorActionPreference = 'Stop', PowerShell
  # can turn a redirected native command's stderr into a terminating error.
  $current = git symbolic-ref --short HEAD
  if ($LASTEXITCODE -ne 0 -or -not $current) {
    throw "$($t.Name): HEAD is not on a branch. Nothing has been committed anywhere."
  }
  $current = ($current | Select-Object -First 1).Trim()
  if ($current -ne $t.Branch) {
    throw "$($t.Name) is on '$current', expected '$($t.Branch)'. Nothing has been committed anywhere."
  }
  # The remote has to answer before the first commit, not when this tree's turn
  # to push arrives. A repository that was never created fails at push, after
  # earlier trees have already committed and pushed, which is the half-aligned
  # toolkit this script exists to prevent. Plain ls-remote, not --exit-code:
  # a newly created empty repository answers with no refs and that is fine.
  $null = git ls-remote origin
  if ($LASTEXITCODE -ne 0) {
    throw "$($t.Name): its remote did not answer. Create or fix it before releasing. Nothing has been committed anywhere."
  }
  Write-Host ("{0,-12} {1}  remote ok" -f $t.Name, $current)
}

Write-Host ""
Write-Host "Working trees about to be committed:" -ForegroundColor Yellow
foreach ($t in $trees) {
  Set-Location $t.Path
  Write-Host "--- $($t.Name) ($($t.Branch))"
  git status --short
}
if (-not $Yes) {
  $answer = Read-Host "Commit all five with subject '$Subject'$(if ($Tag) { " and tag v$Version" })? (yes/no)"
  if ($answer -ne 'yes') {
    Write-Host 'Stopped before any git write.'
    exit 1
  }
}

$msgFile = Join-Path $env:TEMP "toolkit-release-$Version.txt"
$lines = @($Subject)
if ($BodyFile) { $lines += ''; $lines += (Get-Content $BodyFile) }
Set-Content -Path $msgFile -Value $lines

foreach ($t in $trees) {
  Set-Location $t.Path
  Step "$($t.Name): git add -A" { git add -A }
  $staged = git diff --cached --name-only
  if (-not $staged) {
    Write-Host "$($t.Name): nothing to commit." -ForegroundColor DarkYellow
  } else {
    Step "$($t.Name): git commit" { git commit -F $msgFile }
  }
  if ($Tag) {
    Step "$($t.Name): tag v$Version" { git tag -a "v$Version" -m "Toolkit $Version" }
  }
  Step "$($t.Name): push $($t.Branch)" { git push origin $t.Branch --follow-tags }
}

Write-Host ""
Write-Host "Done. Every tree is at $Version$(if ($Tag) { ", tagged v$Version" }), committed, and pushed." -ForegroundColor Green
foreach ($t in $trees) {
  Set-Location $t.Path
  Write-Host ("{0,-12} {1}" -f $t.Name, ((git log --oneline -1) -join ''))
}
