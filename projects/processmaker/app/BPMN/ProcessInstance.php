<?php

declare(strict_types=1);

namespace App\BPMN;

class ProcessInstance
{
    private string $id;
    private string $processId;
    private string $status = 'running';
    private array $activeTokens = [];

    public function __construct(string $id, string $processId, string $startEventId)
    {
        $this->id = $id;
        $this->processId = $processId;
        $this->activeTokens = [$startEventId];
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getProcessId(): string
    {
        return $this->processId;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getActiveTokens(): array
    {
        return $this->activeTokens;
    }

    public function moveToken(string $from, string $to): void
    {
        $this->activeTokens = array_values(array_filter($this->activeTokens, fn (string $t) => $t !== $from));
        $this->activeTokens[] = $to;
    }

    public function complete(): void
    {
        $this->status = 'completed';
    }
}
