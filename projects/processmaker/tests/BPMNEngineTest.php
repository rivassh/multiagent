<?php

declare(strict_types=1);

use App\BPMN\Engine;
use App\BPMN\ProcessInstance;
use App\BPMN\ProcessDefinition;

use PHPUnit\Framework\TestCase;

class BPMNEngineTest extends TestCase
{
    private const SIMPLE_PROCESS = <<<'BPMN'
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="true">
    <startEvent id="start_1" name="Start" />
    <sequenceFlow id="flow_1" sourceRef="start_1" targetRef="task_1" />
    <userTask id="task_1" name="Review Application" />
    <sequenceFlow id="flow_2" sourceRef="task_1" targetRef="end_1" />
    <endEvent id="end_1" name="End" />
  </process>
</definitions>
BPMN;

    public function testLoadsValidBPMNDefinition(): void
    {
        $engine = new Engine();
        $definition = $engine->loadDefinition(self::SIMPLE_PROCESS);

        $this->assertInstanceOf(ProcessDefinition::class, $definition);
        $this->assertSame('Process_1', $definition->getId());
        $this->assertCount(3, $definition->getElements());
    }

    public function testStartsProcessInstanceAtStartEvent(): void
    {
        $engine = new Engine();
        $engine->loadDefinition(self::SIMPLE_PROCESS);

        $instance = $engine->startInstance('Process_1');

        $this->assertInstanceOf(ProcessInstance::class, $instance);
        $this->assertSame('Process_1', $instance->getProcessId());
        $this->assertSame('running', $instance->getStatus());
        $this->assertContains('start_1', $instance->getActiveTokens());
    }

    public function testCompletingUserTaskAdvancesTokenToEndEvent(): void
    {
        $engine = new Engine();
        $engine->loadDefinition(self::SIMPLE_PROCESS);

        $instance = $engine->startInstance('Process_1');
        $engine->completeTask($instance->getId(), 'task_1');

        $this->assertNotContains('task_1', $instance->getActiveTokens());
        $this->assertContains('end_1', $instance->getActiveTokens());
        $this->assertSame('completed', $instance->getStatus());
    }

    public function testThrowsOnUnknownProcessId(): void
    {
        $engine = new Engine();
        $engine->loadDefinition(self::SIMPLE_PROCESS);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Process not found: Unknown_Process');

        $engine->startInstance('Unknown_Process');
    }

    public function testThrowsOnCompletingNonExistentTask(): void
    {
        $engine = new Engine();
        $engine->loadDefinition(self::SIMPLE_PROCESS);

        $instance = $engine->startInstance('Process_1');

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('No active token at task: fake_task');

        $engine->completeTask($instance->getId(), 'fake_task');
    }

    public function testSupportsMultipleConcurrentInstances(): void
    {
        $engine = new Engine();
        $engine->loadDefinition(self::SIMPLE_PROCESS);

        $instanceA = $engine->startInstance('Process_1');
        $instanceB = $engine->startInstance('Process_1');

        $this->assertNotSame($instanceA->getId(), $instanceB->getId());
        $this->assertContains('start_1', $instanceA->getActiveTokens());
        $this->assertContains('start_1', $instanceB->getActiveTokens());

        $engine->completeTask($instanceA->getId(), 'task_1');

        $this->assertContains('end_1', $instanceA->getActiveTokens());
        $this->assertContains('start_1', $instanceB->getActiveTokens());
    }
}
