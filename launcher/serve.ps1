<#
 Athanor web edition - the small local web server behind "Start Athanor.cmd" (made by tools\build_web.ps1).
 Serves the folder above this one to this computer only (127.0.0.1) and opens the default browser at Athanor.
 Nothing is installed and nothing needs the internet. Closing the window stops it.

 The first free port from -Port is used; if Athanor (this same folder) is already being served there, the browser is
 simply opened at it. Keep to the same address: what you save in Athanor is kept by the browser per address.
 -NoBrowser: serve without opening the browser (for testing).
#>
param([int]$Port = 8778, [string]$Edition = 'personal', [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$Token = "Athanor|$Edition|$Root"
try { $Host.UI.RawUI.WindowTitle = "Athanor ($Edition) - close this window to stop" } catch {}

$Mime = @{
    '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
    '.xml' = 'application/xml; charset=utf-8'
    '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.avif' = 'image/avif'
    '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.ttf' = 'font/ttf'; '.otf' = 'font/otf'
    '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.wav' = 'audio/wav'; '.m4a' = 'audio/mp4'; '.mp4' = 'video/mp4'
    '.pdf' = 'application/pdf'; '.zip' = 'application/zip'
    '.docx' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

# Is this same Athanor folder already served on $p? (a second double-click: just open the browser)
function Test-Ours([int]$p) {
    try {
        $rq = [Net.HttpWebRequest]::Create("http://127.0.0.1:$p/__athanor")
        $rq.Proxy = $null; $rq.Timeout = 1500; $rq.ReadWriteTimeout = 1500
        $rs = $rq.GetResponse()
        try { $text = (New-Object IO.StreamReader($rs.GetResponseStream())).ReadToEnd() } finally { $rs.Close() }
        return $text -eq $Token
    } catch { return $false }
}

$listener = $null; $url = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
    if (Test-Ours $p) {
        $url = "http://127.0.0.1:$p/www/index.html"
        Write-Host "Athanor is already running at http://127.0.0.1:$p/ (in another window) - opening it."
        if (-not $NoBrowser) { Start-Process $url }
        Start-Sleep -Seconds 3
        exit 0
    }
    $l = New-Object Net.HttpListener
    $l.Prefixes.Add("http://127.0.0.1:$p/")
    try { $l.Start(); $listener = $l; break } catch { $l.Close() }
}
if (-not $listener) {
    Write-Host "Could not start: ports $Port to $($Port + 19) are all in use." -ForegroundColor Red
    exit 1
}
$base = "http://127.0.0.1:$p"
$url = "$base/www/index.html"

Write-Host ''
Write-Host '  Athanor is running.' -ForegroundColor Yellow
Write-Host "  $url"
Write-Host ''
Write-Host '  Keep this window open while you use Athanor; close it to stop.'
if ($p -ne $Port) {
    Write-Host "  Note: port $Port was busy, so this is a different address than usual - what you saved at" -ForegroundColor DarkYellow
    Write-Host "  http://127.0.0.1:$Port shows there again once that port is free." -ForegroundColor DarkYellow
}
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

function Send([Net.HttpListenerContext]$ctx, [int]$code, [string]$type, [byte[]]$body) {
    $res = $ctx.Response
    $res.StatusCode = $code
    $res.ContentType = $type
    $res.Headers['Cache-Control'] = 'no-cache'
    $res.Headers['X-Content-Type-Options'] = 'nosniff'
    $res.ContentLength64 = $body.Length
    if ($ctx.Request.HttpMethod -ne 'HEAD' -and $body.Length) { $res.OutputStream.Write($body, 0, $body.Length) }
}
function SendText([Net.HttpListenerContext]$ctx, [int]$code, [string]$text) {
    Send $ctx $code 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($text))
}

function Handle([Net.HttpListenerContext]$ctx) {
    $req = $ctx.Request
    if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { SendText $ctx 405 'Method not allowed'; return }
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/__athanor') { SendText $ctx 200 $Token; return }
    if ($path -eq '/') { $ctx.Response.Redirect("$base/www/index.html"); return }
    $rel = $path.TrimStart('/').Replace('/', '\')
    $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $full.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { SendText $ctx 403 'Forbidden'; return }
    if ([IO.Directory]::Exists($full)) {
        if ([IO.File]::Exists((Join-Path $full 'index.html'))) {
            $ctx.Response.Redirect($base + $req.Url.AbsolutePath.TrimEnd('/') + '/index.html'); return
        }
        SendText $ctx 404 'Not found'; return
    }
    if (-not [IO.File]::Exists($full)) { SendText $ctx 404 'Not found'; return }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    $type = $Mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
    Send $ctx 200 $type ([IO.File]::ReadAllBytes($full))
}

try {
    while ($listener.IsListening) {
        $ar = $listener.BeginGetContext($null, $null)
        while (-not $ar.AsyncWaitHandle.WaitOne(500)) { }
        $ctx = $listener.EndGetContext($ar)
        try { Handle $ctx }
        catch { try { $ctx.Response.StatusCode = 500 } catch {} }   # e.g. the browser went away mid-file
        finally { try { $ctx.Response.Close() } catch {} }
    }
} finally {
    try { $listener.Stop(); $listener.Close() } catch {}
}
