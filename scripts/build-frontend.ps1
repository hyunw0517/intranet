# 인트라넷 프론트엔드 arm64 이미지 빌드 (절차: docs/frontend/fe-21-docker.md)
#
# 사용법 (intranet 폴더에서)
#   .\scripts\build-frontend.ps1 v1.0.0          # 로컬에 빌드 + 실행 파일 확인
#   .\scripts\build-frontend.ps1 v1.0.0 -Push    # 빌드 + GHCR에 올리기 (docker login ghcr.io 먼저)
#
# 빌드 로그는 Docker가 stderr로 내보낸다. Windows PowerShell 5.1에서 2>&1로 합치면 성공해도 빨간 오류처럼 보이므로 합치지 않는다.

param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [switch]$Push
)

$ErrorActionPreference = 'Stop'
$image = "ghcr.io/hyunw0517/intranet-frontend:$Tag"
$context = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend'

$buildArgs = @('buildx', 'build', '--platform', 'linux/arm64', '-t', $image)
if ($Push) { $buildArgs += '--push' } else { $buildArgs += '--load' }
$buildArgs += $context

Write-Host "빌드: $image"
& docker @buildArgs
if ($LASTEXITCODE -ne 0) { throw "빌드 실패 (exit $LASTEXITCODE). 위 로그에서 ERROR 줄을 찾는다." }

if ($Push) {
    Write-Host "올림: $image"
} else {
    # arm64(에뮬레이션)에서 standalone server.js·정적 파일이 있고, 이미지 최적화용 sharp가 arm64 바이너리로 로드되는지 확인한다.
    & docker run --rm --platform linux/arm64 $image node -e "const fs = require('fs'); for (const f of ['server.js', '.next/static']) if (!fs.existsSync(f)) throw new Error(f + ' 없음'); require('sharp'); console.log(process.arch, 'OK')"
    if ($LASTEXITCODE -ne 0) { throw "실행 파일 확인 실패 (exit $LASTEXITCODE)" }
}
