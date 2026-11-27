<?php

declare(strict_types=1);

namespace App\BPMN;

class Engine
{
    private array $definitions = [];
    private array $instances = [];

    public function loadDefinition(string $xml): ProcessDefinition
    {
        $xml = trim($xml);
        if ($xml === '') {
            throw new \InvalidArgumentException('BPMN XML is empty');
        }

        $sxe = new \SimpleXMLElement($xml);

        $process = null;
        foreach ($sxe->process as $candidate) {
            $process = $candidate;
            break;
        }

        if ($process === null) {
            throw new \InvalidArgumentException('No process found in BPMN definition');
        }

        $processId = (string) $process['id'];
        $elements = [];
        $flows = [];
        $startEventId = '';
        $endEventIds = [];

        foreach ($process->children() as $child) {
            $childName = $child->getName();
            $childId = (string) $child['id'];

            if ($childId === '') {
                continue;
            }

            switch ($childName) {
                case 'startEvent':
                    $elements[$childId] = ['type' => 'startEvent', 'name' => (string) $child['name'] ?? ''];
                    if ($startEventId === '') {
                        $startEventId = $childId;
                    }
                    break;
                case 'endEvent':
                    $elements[$childId] = ['type' => 'endEvent', 'name' => (string) $child['name'] ?? ''];
                    $endEventIds[] = $childId;
                    break;
                case 'userTask':
                case 'serviceTask':
                case 'scriptTask':
                    $elements[$childId] = ['type' => $childName, 'name' => (string) $child['name'] ?? ''];
                    break;
                case 'sequenceFlow':
                    $source = (string) $child['sourceRef'];
                    $target = (string) $child['targetRef'];
                    $flows[$source][] = $target;
                    break;
            }
        }

        if ($startEventId === '') {
            throw new \InvalidArgumentException('No start event found in process ' . $processId);
        }

        $definition = new ProcessDefinition($processId, $elements, $flows, $startEventId, $endEventIds);
        $this->definitions[$processId] = $definition;

        return $definition;
    }

    public function startInstance(string $processId): ProcessInstance
    {
        if (!isset($this->definitions[$processId])) {
            throw new \InvalidArgumentException('Process not found: ' . $processId);
        }

        $definition = $this->definitions[$processId];
        $instanceId = 'instance_' . uniqid('', true);
        $instance = new ProcessInstance($instanceId, $processId, $definition->getStartEventId());
        $this->instances[$instanceId] = $instance;

        return $instance;
    }

    public function completeTask(string $instanceId, string $taskId): void
    {
        if (!isset($this->instances[$instanceId])) {
            throw new \InvalidArgumentException('Instance not found: ' . $instanceId);
        }

        $instance = $this->instances[$instanceId];
        $definition = $this->definitions[$instance->getProcessId()];
        $activeTokens = $instance->getActiveTokens();

        if (in_array($taskId, $activeTokens, true)) {
            $this->completeActiveTask($instance, $definition, $taskId);
            return;
        }

        $advanced = $this->advanceThroughStartEvents($instance, $definition, $taskId);
        if (!$advanced) {
            throw new \InvalidArgumentException('No active token at task: ' . $taskId);
        }

        $this->completeActiveTask($instance, $definition, $taskId);
    }

    private function completeActiveTask(ProcessInstance $instance, ProcessDefinition $definition, string $taskId): void
    {
        $outgoing = $definition->getOutgoingFlows($taskId);
        if (empty($outgoing)) {
            throw new \InvalidArgumentException('No outgoing flow from task: ' . $taskId);
        }

        $instance->moveToken($taskId, $outgoing[0]);

        if ($definition->isEndEvent($outgoing[0])) {
            $instance->complete();
        }
    }

    private function advanceThroughStartEvents(ProcessInstance $instance, ProcessDefinition $definition, string $targetTaskId): bool
    {
        $activeTokens = $instance->getActiveTokens();

        foreach ($activeTokens as $token) {
            if ($definition->getElementType($token) !== 'startEvent') {
                continue;
            }

            $outgoing = $definition->getOutgoingFlows($token);
            foreach ($outgoing as $next) {
                if ($next === $targetTaskId) {
                    $instance->moveToken($token, $targetTaskId);
                    return true;
                }
            }
        }

        return false;
    }
}
