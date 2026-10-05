<?php
header('Content-Type: application/json; charset=utf-8');

// Allow local origin or subdomains of glenhalton.com
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('/^https?:\/\/(localhost|([a-z0-9-]+\.)?glenhalton\.com)(:\d+)?$/i', $origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || empty($data['email']) || !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// Data storage directory (protected)
$dir = __DIR__ . '/../data';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
    // Add .htaccess to deny direct web access to data directory
    file_put_contents($dir . '/.htaccess', "Require all denied\n");
}

$rosterFile = $dir . '/testers.json';
$current = [];
if (file_exists($rosterFile)) {
    $current = json_decode(file_get_contents($rosterFile), true) ?: [];
}

// Check for duplicate by email
$email = strtolower(trim($data['email']));
$existingIndex = -1;
foreach ($current as $idx => $entry) {
    if (isset($entry['email']) && strtolower($entry['email']) === $email) {
        $existingIndex = $idx;
        break;
    }
}

$record = [
    'name' => htmlspecialchars($data['name'] ?? '', ENT_QUOTES, 'UTF-8'),
    'email' => $email,
    'tracks' => is_array($data['tracks'] ?? null) ? $data['tracks'] : [],
    'agent' => htmlspecialchars($data['agent'] ?? '', ENT_QUOTES, 'UTF-8'),
    'channel' => htmlspecialchars($data['channel'] ?? 'rc', ENT_QUOTES, 'UTF-8'),
    'notes' => htmlspecialchars($data['notes'] ?? '', ENT_QUOTES, 'UTF-8'),
    'registered_at' => date('c'),
    'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
];

if ($existingIndex >= 0) {
    $current[$existingIndex] = array_merge($current[$existingIndex], $record);
} else {
    $current[] = $record;
}

file_put_contents($rosterFile, json_encode($current, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// Server-side email relay helper
function send_email_via_relay($payload) {
    if (!function_exists('curl_init')) {
        return ['status' => 0, 'error' => 'cURL not available'];
    }
    $ch = curl_init('https://gmailer-gda.fly.dev/send-email');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $httpCode, 'response' => $response];
}

$fullName = $record['name'] ?: 'Developer';
$tracksStr = implode(', ', $record['tracks']);
$channelLabel = ($record['channel'] === 'bleeding-edge') ? 'Bleeding-edge (@next Nightlies)' : 'Release Candidates (RC)';
$primaryAgent = $record['agent'] ?: 'Not specified';
$projectNotes = $record['notes'] ?: 'None specified';

// 1. Welcome Email for the Tester
$welcomeHtml = <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0d12; color: #e8edf2; margin: 0; padding: 24px; }
.card { max-width: 600px; margin: 0 auto; background: #0e1319; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 32px; }
.badge { display: inline-block; font-family: monospace; font-size: 11px; padding: 4px 10px; border-radius: 20px; background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.3); margin-bottom: 20px; }
h1 { font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 16px; }
p { font-size: 15px; line-height: 1.6; color: #8a94a6; margin: 0 0 16px; }
.code-box { background: #06080b; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px 18px; font-family: monospace; font-size: 13px; color: #6ee7b7; margin: 20px 0; }
.footer { border-top: 1px solid rgba(255,255,255,0.08); margin-top: 32px; padding-top: 20px; font-size: 12px; color: #566070; }
</style>
</head>
<body>
<div class="card">
  <div class="badge">NEXUS INSIDERS · EARLY ACCESS</div>
  <h1>Welcome to the Nexus Tester Program</h1>
  <p>Hello {$fullName},</p>
  <p>Thank you for joining the Nexus Insiders program. You are registered to receive early access dispatches for upcoming releases.</p>
  
  <p><b>Your Enrolled Tracks:</b> {$tracksStr}<br>
  <b>Preferred Channel:</b> {$channelLabel}<br>
  <b>Primary AI Tool:</b> {$primaryAgent}</p>

  <p>To start testing cutting-edge builds ahead of npm latest, install the preview tag:</p>
  <div class="code-box">npm install -g @nexus-framework/cli@next</div>

  <p>Or launch the Nexus Harness GUI directly:</p>
  <div class="code-box">nexus harness</div>

  <p>Whenever a new release candidate or major experimental feature lands, you will receive a testing brief detailing what changed and what to test.</p>

  <p>Got immediate feedback or found an anomaly? You can reply directly to this email or run <code style="color:#6ee7b7">nexus doctor --severity=warn</code> in your project.</p>

  <div class="footer">
    © 2026 NEXUS Framework by GDA Africa · <a href="https://nexus.glenhalton.com/docs" style="color:#34d399;text-decoration:none">Documentation</a> · <a href="https://github.com/GDA-Africa/nexus-cli" style="color:#34d399;text-decoration:none">GitHub</a>
  </div>
</div>
</body>
</html>
HTML;

// 2. Notification Email for the Core Team
$teamHtml = <<<HTML
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: monospace; background:#f4f6f8; padding:20px; color:#111; }
.box { background:#fff; padding:24px; border-radius:8px; border:1px solid #ddd; max-width:600px; margin:0 auto; }
h2 { color:#06281c; margin-top:0; }
li { margin-bottom:8px; }
</style>
</head>
<body>
<div class="box">
  <h2>🎉 New Nexus Tester Signup</h2>
  <ul>
    <li><strong>Name / Handle:</strong> {$fullName}</li>
    <li><strong>Email:</strong> {$email}</li>
    <li><strong>Focus Areas:</strong> {$tracksStr}</li>
    <li><strong>Release Channel:</strong> {$channelLabel}</li>
    <li><strong>Primary AI Tool:</strong> {$primaryAgent}</li>
    <li><strong>Project Notes:</strong> {$projectNotes}</li>
    <li><strong>Timestamp:</strong> {$record['registered_at']}</li>
    <li><strong>IP:</strong> {$record['ip']}</li>
  </ul>
</div>
</body>
</html>
HTML;

$testerRes = send_email_via_relay([
    'to' => $email,
    'subject' => 'Welcome to Nexus Insiders — Early Access & Instructions',
    'html_body' => $welcomeHtml,
    'sender_name' => 'Nexus Framework',
    'source_url' => 'https://nexus.glenhalton.com/testers',
    'logo_url' => 'https://nexus.glenhalton.com/favicon.svg'
]);

$teamRes = send_email_via_relay([
    'to' => 'hello@gdaafrica.org',
    'subject' => "[Nexus Tester Signup] {$fullName} ({$email})",
    'html_body' => $teamHtml,
    'sender_name' => 'Nexus Insiders Gateway',
    'source_url' => 'https://nexus.glenhalton.com/testers',
    'logo_url' => 'https://nexus.glenhalton.com/favicon.svg'
]);

http_response_code(200);
echo json_encode([
    'status' => 'ok',
    'message' => 'Tester registered successfully',
    'tester_email_status' => $testerRes['status'],
    'team_email_status' => $teamRes['status']
]);
