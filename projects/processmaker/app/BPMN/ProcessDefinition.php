<?php

declare(strict_types=1);

namespace App\BPMN;

class ProcessDefinition
{
    private string $id;
    private array $elements = [];
    private array $flows = [];
    private string $startEventId = '';
    private array $endEventIds = [];

    public function __construct(string $id, array $elements, array $flows, string $startEventId, array $endEventIds)
    {
        $this->id = $id;
        $this->elements = $elements;
        $this->flows = $flows;
        $this->startEventId = $startEventId;
        $this->endEventIds = $endEventIds;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getElements(): array
    {
        return $this->elements;
    }

    public function getStartEventId(): string
    {
        return $this->startEventId;
    }

    public function getEndEventIds(): array
    {
        return $this->endEventIds;
    }

    public function getOutgoingFlows(string $elementId): array
    {
        return $this->flows[$elementId] ?? [];
    }

    public function isEndEvent(string $elementId): bool
    {
        return in_array($elementId, $this->endEventIds, true);
    }

    public function getElementType(string $elementId): ?string
    {
        return $this->elements[$elementId]['type'] ?? null;
    }
}
