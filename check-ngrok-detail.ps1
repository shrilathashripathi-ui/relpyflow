$resp = Invoke-RestMethod -Uri 'http://localhost:4040/api/requests/http'
foreach ($r in $resp.requests) {
    if ($r.request.method -eq 'GET' -and $r.request.uri -like '*webhook*') {
        $method = $r.request.method
        $uri = $r.request.uri
        $status = $r.response.status_code
        $ua = $r.request.headers.'User-Agent'
        $ip = $r.request.headers.'X-Forwarded-For'
        Write-Host "---"
        Write-Host "$method $uri -> $status"
        Write-Host "UA: $ua"
        Write-Host "IP: $ip"
    }
}
