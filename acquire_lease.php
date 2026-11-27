<?php
require_once '/home/hamid/multiagent2/state/kanban_leases.php';

$partition = 'sima';
$resource = "$partition/tasks.json";
$holder = 'ses_ded284e5fffeb6Luoou6c4EogZ';
$leaseId = 'lease-' . bin2hex(random_bytes(16));
$acquiredAt = (new DateTime('now', new DateTimeZone('UTC')))->format(DateTime::ATOM);
$expiresAt = (new DateTime('now + 120 seconds', new DateTimeZone('UTC')))->format(DateTime::ATOM);

$leasesFile = "/home/hamid/multiagent2/state/$partition/leases.json";
$leases = json_decode(file_get_contents($leasesFile), true);

// Check for existing lease
$existingLease = null;
foreach ($leases['leases'] as $i => $lease) {
    if ($lease['resource'] === $resource) {
        $existingLease = &$leases['leases'][$i];
        break;
    }
}

$now = new DateTime('now', new DateTimeZone('UTC'));

if ($existingLease) {
    $expires = new DateTime($existingLease['expires_at'], new DateTimeZone('UTC'));
    if ($now > $expires) {
        // Zombie lease - force break
        file_put_contents("/home/hamid/multiagent2/state/$partition/team_log.md", "[FORCE-BREAK] Zombie lease of {$existingLease['holder']} expired. Broken by $holder.\n", FILE_APPEND);
    } elseif ($existingLease['holder'] === $holder) {
        // Our lease - extend
        $existingLease['expires_at'] = $expiresAt;
        $existingLease['lease_id'] = $leaseId;
        $existingLease['acquired_at'] = $acquiredAt;
    } else {
        // Held by another worker
        echo "Lease held by another worker: {$existingLease['holder']}\n";
        exit(1);
    }
} else {
    // No existing lease - create new
    $leases['leases'][] = [
        'resource' => $resource,
        'holder' => $holder,
        'lease_id' => $leaseId,
        'acquired_at' => $acquiredAt,
        'expires_at' => $expiresAt
    ];
}

file_put_contents($leasesFile, json_encode($leases, JSON_PRETTY_PRINT));
echo "Lease acquired successfully\n";