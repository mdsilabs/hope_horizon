# Hope Horizon setup assistant (Windows 10/11, GUI).
# Read-only: no secret values are displayed or written to log files.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
$cfg = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $v = $Matches[2].Trim()
            if ($v.Length -ge 2 -and ($v.StartsWith('"') -and $v.EndsWith('"') -or $v.StartsWith("'") -and $v.EndsWith("'"))) {
                $v = $v.Substring(1, $v.Length - 2)
            }
            $cfg[$Matches[1]] = $v
        }
    }
}
function Configured($name) { return ($cfg.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($cfg[$name])) }
function Request-Status($url, $headers = @{}) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -TimeoutSec 8 -UseBasicParsing -ErrorAction Stop
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Hope Horizon | Integration Setup Assistant"
$form.Size = New-Object System.Drawing.Size(795,565)
$form.StartPosition = "CenterScreen"
$form.MinimumSize = New-Object System.Drawing.Size(700,460)
$heading = New-Object System.Windows.Forms.Label
$heading.Text = "Hope Horizon - Integration Diagnostics"
$heading.Font = New-Object System.Drawing.Font("Segoe UI",15,[System.Drawing.FontStyle]::Bold)
$heading.Location = New-Object System.Drawing.Point(20,16)
$heading.AutoSize = $true
$form.Controls.Add($heading)
$info = New-Object System.Windows.Forms.Label
$info.Text = "Read-only checks. Keys and passwords are never displayed."
$info.Location = New-Object System.Drawing.Point(23,52)
$info.AutoSize = $true
$form.Controls.Add($info)
$button = New-Object System.Windows.Forms.Button
$button.Text = "Run checks"
$button.Location = New-Object System.Drawing.Point(23,82)
$button.Size = New-Object System.Drawing.Size(115,32)
$form.Controls.Add($button)
$grid = New-Object System.Windows.Forms.DataGridView
$grid.Location = New-Object System.Drawing.Point(20,128)
$grid.Size = New-Object System.Drawing.Size(737,352)
$grid.Anchor = [System.Windows.Forms.AnchorStyles]"Top,Bottom,Left,Right"
$grid.ReadOnly = $true
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.RowHeadersVisible = $false
$grid.AutoSizeColumnsMode = "Fill"
[void]$grid.Columns.Add("integration","Integration")
[void]$grid.Columns.Add("status","Status")
[void]$grid.Columns.Add("details","Details")
$grid.Columns[0].FillWeight=28
$grid.Columns[1].FillWeight=14
$grid.Columns[2].FillWeight=58
$form.Controls.Add($grid)
$footer = New-Object System.Windows.Forms.Label
$footer.Location = New-Object System.Drawing.Point(23,488)
$footer.Anchor = [System.Windows.Forms.AnchorStyles]"Bottom,Left"
$footer.Text = "For protected database/RLS checks, sign in at /admin/integrations."
$footer.AutoSize = $true
$form.Controls.Add($footer)
function Row($name,$status,$detail) { [void]$grid.Rows.Add($name,$status,$detail) }
$button.Add_Click({
    $button.Enabled=$false; $grid.Rows.Clear()
    try {
        Row "Local overrides" $(if(Test-Path $envFile){"PRESENT"}else{"OPTIONAL"}) ".env.local is optional for public values; server secrets stay private"
        $expectedUrl = "https://iwfpdwihinhcwjgvmfei.supabase.co"
        $configPath = Join-Path $root "lib\supabase\config.ts"
        $publicKey = ""
        if (Test-Path $configPath) {
            $source = Get-Content $configPath -Raw
            if ($source -match 'SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"') {
                $publicKey = $Matches[1]
            }
        }
        if(Configured "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
            $publicKey = $cfg["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
        }
        Row "Pinned project" $(if(Test-Path $configPath){"FOUND"}else{"MISSING"}) "supabase-cyclamen-park (iwfpdwihinhcwjgvmfei)"
        Row "Public publishable key" $(if($publicKey -match '^sb_publishable_'){"PRESENT"}else{"MISSING"}) "Only a public key is read; the value is never displayed"
        $serverSecret = (Configured "SUPABASE_SECRET_KEY") -or (Configured "SUPABASE_SERVICE_ROLE_KEY")
        Row "Local server credential" $(if($serverSecret){"PRESENT"}else{"NOT SET"}) "For deployment, configure the secret through Vercel Environment Variables"
        Row "App origin" $(if(Configured "NEXT_PUBLIC_APP_URL"){"PRESENT"}else{"LOCAL DEFAULT"}) "Deployed HTTPS origin required for email setup redirects"
        $url = if(Configured "NEXT_PUBLIC_SUPABASE_URL"){$cfg["NEXT_PUBLIC_SUPABASE_URL"].TrimEnd('/')}else{$expectedUrl}
        Row "Project URL matches" $(if($url -eq $expectedUrl){"OK"}else{"MISMATCH"}) "Will not test an unexpected project"

        foreach($tool in @("node","npm")) {
            $cmd = Get-Command $tool -ErrorAction SilentlyContinue
            Row $tool $(if($cmd){"FOUND"}else{"MISSING"}) "Installed command on system PATH"
        }
        if($url -eq $expectedUrl -and $publicKey -match '^sb_publishable_') {
            $headers=@{ "apikey" = $publicKey }
            $status = Request-Status "$url/auth/v1/health" $headers
            Row "Supabase Auth URL" $(if($status -eq 200){"OK"}else{"REVIEW"}) "HTTP status: $status"
            $status = Request-Status "$url/rest/v1/" $headers
            Row "Supabase REST URL" $(if($status -ge 200 -and $status -lt 400){"OK"}else{"REVIEW"}) "HTTP status: $status"
        }else{Row "Supabase connectivity" "SKIPPED" "Resolve the public project URL/key mismatch first"}
        if(Configured "NEXT_PUBLIC_APP_URL"){
            $target=$cfg["NEXT_PUBLIC_APP_URL"].TrimEnd('/')
            if($target -match '^https?://'){
                $status=Request-Status "$target/login"
                Row "Portal login route" $(if($status -ge 200 -and $status -lt 400){"OK"}else{"REVIEW"}) "HTTP status: $status"
            }
        }
        Row "Migration / row security" "IN APP" "Check via the protected /admin/integrations dashboard"
    }catch {Row "Diagnostics" "ERROR" "Check URL/network configuration, then rerun."}
    finally{$button.Enabled=$true}
})
[void]$form.ShowDialog()
