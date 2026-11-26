$ErrorActionPreference = "Stop"

$project = "C:\xampp\htdocs\ispbilling-node"
if (-not (Test-Path (Join-Path $project "app.js"))) {
    throw "Project not found: $project"
}

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$routeDir = Join-Path $project "routes\super-admin"
$pageDir = Join-Path $project "views\admin"
New-Item -ItemType Directory -Force -Path $routeDir, $pageDir | Out-Null

Copy-Item (Join-Path $source "routes\super-admin\support-numbers.routes.js") (Join-Path $routeDir "support-numbers.routes.js") -Force
Copy-Item (Join-Path $source "views\admin\super-admin-support-numbers.html") (Join-Path $pageDir "super-admin-support-numbers.html") -Force

$appPath = Join-Path $project "app.js"
$app = [System.IO.File]::ReadAllText($appPath, [System.Text.Encoding]::UTF8)

if ($app -notmatch 'supportNumbersRoutes') {
    $anchor = 'const websiteSupportRoutes = require\("\./routes/public/website-support\.routes"\);'
    if ($app -notmatch $anchor) { throw "Could not locate websiteSupportRoutes import in app.js" }
    $app = [regex]::Replace($app, $anchor, '$0' + "`r`n" + 'const supportNumbersRoutes = require("./routes/super-admin/support-numbers.routes");', 1)

    $mountAnchor = 'app\.use\(\s*"/api/website-support",\s*security\.publicWebsiteCors\(\),\s*websiteSupportRoutes\s*\);'
    if ($app -notmatch $mountAnchor) { throw "Could not locate public website-support API mount in app.js" }
    $mountText = '$0' + "`r`n" + 'app.use("/api/super-admin/support-numbers", supportNumbersRoutes);'
    $app = [regex]::Replace($app, $mountAnchor, $mountText, 1)
}

if ($app -notmatch '"/super-admin/support-numbers"') {
    $pageAnchor = 'app\.get\(\s*"/super-admin/apk-management",'
    if ($app -notmatch $pageAnchor) { throw "Could not locate APK management page route in app.js" }
    $pageRoute = @'
app.get(
    "/super-admin/support-numbers",
    requireSoftwareBilling,
    (req, res, next) => {
        const role = String((req.session && req.session.role) || "")
            .trim().toLowerCase().replace(/[\s_-]+/g, "");
        if (role !== "superadmin" || Number(req.session.company_id) !== 8) {
            return res.status(403).send("Super Admin access required.");
        }
        next();
    },
    (req, res) => res.sendFile(
        path.join(__dirname, "views", "admin", "super-admin-support-numbers.html")
    )
);

'@
    $app = [regex]::Replace($app, $pageAnchor, $pageRoute + '$0', 1)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($appPath, $app, $utf8NoBom)

$sidebarPath = Join-Path $project "public\partials\sidebar.html"
$sidebar = [System.IO.File]::ReadAllText($sidebarPath, [System.Text.Encoding]::UTF8)
if ($sidebar -notmatch '/super-admin/support-numbers') {
    $needle = @'
        <a
            class="submenu"
            href="/super-admin/apk-management"
        >
            <i class="fa fa-mobile-screen"></i>
            APK Management
        </a>
'@
    if (-not $sidebar.Contains($needle)) { throw "Could not locate APK Management sidebar link. Files copied; app/sidebar integration not completed." }
    $replacement = $needle + @'

        <a
            class="submenu"
            href="/super-admin/support-numbers"
        >
            <i class="fa fa-headset"></i>
            Amader Bill Support Numbers
        </a>
'@
    $sidebar = $sidebar.Replace($needle, $replacement)
    [System.IO.File]::WriteAllText($sidebarPath, $sidebar, $utf8NoBom)
}

Write-Host "Files installed and app.js/sidebar.html updated."
Write-Host "Now run:"
Write-Host "node --check app.js"
Write-Host "node --check routes\super-admin\support-numbers.routes.js"
