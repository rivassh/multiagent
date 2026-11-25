<?php
require_once '/home/hamid/multiagent/vendor/autoload.php';

use Carbon\Carbon;
use Illuminate\Support\Str;

$YOUR_ID = 'qa-agent-' . uniqid();
$PARTITION = 'sima';
$LEASE_TTL = 120;

$leasesFile = "/home/hamid/multiagent/state/sima/leases.json";
$teamLogFile = "/home/hamid/multiagent/state/sima/team_log.md";

if (!file_exists($leasesFile)) {
    $leases = ["version" => 1, "leases" => []];
} else {
    $leases = json_decode(file_get_contents($leasesFile), true);
}

$resource = "$PARTITION/tasks.json";
$now = Carbon::now()->toIso8601String();
$expiresAt = Carbon::now()->addSeconds($LEASE_TTL)->toIso8601String();

$existingLease = null;
foreach ($leases['leases'] as $i => $lease) {
    if ($lease['resource'] === $resource) {
        $existingLease = $i;
        break;
    }
}

if ($existingLease !== null) {
    $lease = $leases['leases'][$existingLease];
    $expiresAtLease = Carbon::parse($lease['expires_at']);
    
    if ($expiresAtLease->isPast()) {
        // Zombie lease - force break
        file_put_contents($teamLogFile, "[FORCE-BREAK] Zombie lease of {$lease['holder']} expired. Broken by $YOUR_ID.\n", FILE_APPEND);
    } elseif ($lease['holder'] === $YOUR_ID) {
        // Our lease - extend
        $leases['leases'][$existingLease]['expires_at'] = $expiresAt;
    } else {
        echo "Lease held by another worker: {$lease['holder']}\n";
        exit(1);
    }
} else {
    // No lease - create new
    $leases['leases'][] = [
        "resource" => $resource,
        "holder" => $YOUR_ID,
        "lease_id" => (string) Str::uuid(),
        "acquired_at" => $now,
        "expires_at" => $expiresAt
    ];
}

file_put_contents($leasesFile, json_encode($leases, JSON_PRETTY_PRINT));

echo "Lease acquired successfully by $YOUR_ID\n";