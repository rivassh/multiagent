<?php
$file = '/home/hamid/multiagent2/state/sima/tasks.json';
$data = json_decode(file_get_contents($file), true);
$myId = 'ses_ded284e5fffeb6Luoou6c4EogZ';

foreach ($data['tasks'] as &$task) {
    if ($task['id'] === 'TASK-137') {
        $task['reviewer'] = $myId;
        $task['status'] = 'IN_REVIEW';
        break;
    }
}

file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
echo "Task updated\n";