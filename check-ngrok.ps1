$resp = Invoke-RestMethod -Uri 'http://localhost:4040/api/requests/http'
foreach ($r in $resp.requests) {
    $method = $r.request.method
    $uri = $r.request.uri
    $status = $r.response.status_code
    Write-Host "$method $uri -> $status"
}
