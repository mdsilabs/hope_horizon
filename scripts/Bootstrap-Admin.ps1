# Hope Horizon: first-administrator Windows setup UI.
# Runs a local TypeScript program; NEVER sends a key/password to GitHub or the app.
# No secrets are saved to disk or passed as command-line arguments.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$root = Split-Path -Parent $PSScriptRoot
$form = New-Object System.Windows.Forms.Form
$form.Text = "Hope Horizon | First Administrator Setup"
$form.Size = New-Object System.Drawing.Size(720,715)
$form.MinimumSize = New-Object System.Drawing.Size(680,670)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI",10)
$form.AutoScroll = $true

$title = New-Object System.Windows.Forms.Label
$title.Text = "Create the first school administrator"
$title.Font = New-Object System.Drawing.Font("Segoe UI",16,[System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(22,16)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Target: supabase-cyclamen-park | iwfpdwihinhcwjgvmfei"
$subtitle.Location = New-Object System.Drawing.Point(24,55)
$subtitle.AutoSize = $true
$form.Controls.Add($subtitle)

$help = New-Object System.Windows.Forms.Label
$help.Text = "One-time local setup. Enter a freshly rotated Supabase secret key." +
  " It is kept only in this process, not written to a file."
$help.Location = New-Object System.Drawing.Point(24,82)
$help.Size = New-Object System.Drawing.Size(650,44)
$form.Controls.Add($help)

function Add-Entry($labelText, $y, $default, $mask = $false) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $labelText
    $label.Location = New-Object System.Drawing.Point(25,$y)
    $label.AutoSize = $true
    $form.Controls.Add($label)
    $field = New-Object System.Windows.Forms.TextBox
    $field.Location = New-Object System.Drawing.Point(25,($y+23))
    $field.Size = New-Object System.Drawing.Size(650,27)
    $field.Text = $default
    if ($mask) { $field.UseSystemPasswordChar = $true }
    $field.Anchor = "Top,Left,Right"
    $form.Controls.Add($field)
    return $field
}

$school = Add-Entry "School name (used only if no school exists)" 126 "Hope Horizon Academy"
$schoolId = Add-Entry "Existing school UUID (optional, only needed if several schools exist)" 189 ""
$adminName = Add-Entry "Administrator's full name" 252 ""
$email = Add-Entry "Administrator's email address" 315 ""
$password = Add-Entry "New administrator password (12+ characters, upper/lowercase, number, symbol)" 378 "" $true
$confirm = Add-Entry "Confirm administrator password" 441 "" $true
$secret = Add-Entry "Supabase server secret key (sb_secret_..., masked)" 504 "" $true

$button = New-Object System.Windows.Forms.Button
$button.Text = "Create first administrator"
$button.Location = New-Object System.Drawing.Point(25,568)
$button.Size = New-Object System.Drawing.Size(233,38)
$button.BackColor = [System.Drawing.Color]::FromArgb(30,86,179)
$button.ForeColor = [System.Drawing.Color]::White
$button.FlatStyle = "Flat"
$form.Controls.Add($button)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Requires Node.js, npm install, and database migrations 0001–0005."
$status.Location = New-Object System.Drawing.Point(25,622)
$status.Size = New-Object System.Drawing.Size(650,40)
$status.Anchor = "Bottom,Left,Right"
$form.Controls.Add($status)

$button.Add_Click({
    $adminNameText=$adminName.Text.Trim()
    $emailText=$email.Text.Trim()
    $schoolNameText=$school.Text.Trim()
    $schoolIdText=$schoolId.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($adminNameText) -or [string]::IsNullOrWhiteSpace($emailText) -or
        [string]::IsNullOrWhiteSpace($schoolNameText)) {
        $status.Text = "Enter a school name, administrator name, and valid email."
        return
    }
    if ([string]::IsNullOrWhiteSpace($secret.Text)) {
        $status.Text = "Enter the newly rotated Supabase server secret key."
        return
    }
    if ($password.Text -ne $confirm.Text) {
        $status.Text = "The passwords do not match."
        return
    }
    if ($password.Text.Length -lt 12) {
        $status.Text = "Use a stronger administrator password: at least 12 characters."
        return
    }
    if ([System.Windows.Forms.MessageBox]::Show(
        "Create the FIRST ADMIN account for supabase-cyclamen-park using this email? No existing admin will be replaced.",
        "Confirm privileged setup", "YesNo", "Question"
    ) -ne "Yes") { return }

    $node=Get-Command node -ErrorAction SilentlyContinue
    $runner=Join-Path $root "node_modules\tsx\dist\cli.mjs"
    $script=Join-Path $root "scripts\bootstrap-first-admin.ts"
    if (-not $node -or -not (Test-Path $runner)) {
        $status.Text = "Node.js or npm dependencies are missing. Run npm install in the project folder first."
        return
    }

    $button.Enabled=$false
    $status.Text = "Creating and verifying the first administrator account..."
    $form.Refresh()
    try {
        $payload=@{
            adminName=$adminNameText
            adminEmail=$emailText
            adminPassword=$password.Text
            schoolName=$schoolNameText
            confirmation="CREATE_FIRST_ADMIN"
        }
        if($schoolIdText){$payload["schoolId"]=$schoolIdText}
        $psi=New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName=$node.Source
        $psi.Arguments=('"{0}" "{1}"' -f $runner,$script)
        $psi.WorkingDirectory=$root
        $psi.UseShellExecute=$false
        $psi.RedirectStandardInput=$true
        $psi.RedirectStandardOutput=$true
        $psi.RedirectStandardError=$true
        $psi.CreateNoWindow=$true
        $psi.EnvironmentVariables["SUPABASE_SECRET_KEY"]=$secret.Text
        $process=[System.Diagnostics.Process]::Start($psi)
        $process.StandardInput.WriteLine(($payload | ConvertTo-Json -Compress -Depth 4))
        $process.StandardInput.Close()
        $out=$process.StandardOutput.ReadToEnd()
        $err=$process.StandardError.ReadToEnd()
        $process.WaitForExit()
        try { $response=$out.Trim() | ConvertFrom-Json -ErrorAction Stop }
        catch {
            $status.Text = "Setup did not return a valid response. Check npm install and project files."
            return
        }
        if ($response.status -eq "created") {
            $status.ForeColor=[System.Drawing.Color]::DarkGreen
            $status.Text = "Admin created: " + $response.email + ". Open your portal /login and use your chosen password."
            [System.Windows.Forms.MessageBox]::Show(
                "First administrator ready. Email: " + $response.email +
                ". Sign in at your Hope Horizon website /login. Password was not saved.",
                "Account created", "OK", "Information"
            ) | Out-Null
        } elseif ($response.status -eq "blocked") {
            $status.ForeColor=[System.Drawing.Color]::DarkOrange
            $status.Text=$response.message
        } else {
            $status.ForeColor=[System.Drawing.Color]::DarkRed
            $status.Text=$response.message
        }
    } catch {
        $status.ForeColor=[System.Drawing.Color]::DarkRed
        $status.Text="Unable to run local setup. Check Node.js, Supabase connectivity and your server secret."
    } finally {
        $password.Clear()
        $confirm.Clear()
        $secret.Clear()
        $button.Enabled=$true
    }
})
[void]$form.ShowDialog()
