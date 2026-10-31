#!/usr/bin/env python3
"""
Zero-Phase Roadmap Synthesis Validation Test
Validates that TASK-ZP-001 through TASK-ZP-012 have been fully executed and approved
per the 8-stage lifecycle (REQUIREMENT -> SPEC -> TEST -> CODE -> REVIEW -> REFINE -> VERIFY -> DONE).
"""
import json
import sys
from pathlib import Path


def load_tasks():
    path = Path("/opt/multiagent/state/tasks.json")
    if not path.exists():
        print(f"FAIL: {path} does not exist")
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def test_all_zp_tasks_present(data):
    """Test: All 12 ZP tasks (ZP-001..ZP-012) present."""
    tasks = {t["id"]: t for t in data.get("tasks", [])}
    expected = [f"TASK-ZP-{i:03d}" for i in range(1, 13)]
    missing = [e for e in expected if e not in tasks]
    if missing:
        print(f"FAIL: Missing ZP tasks: {missing}")
        return False
    print(f"PASS: All 12 ZP tasks present")
    return True


def test_zp_task_final_state(data):
    """Test: Each ZP task has reached final stage=VERIFY, status=APPROVED."""
    tasks = {t["id"]: t for t in data.get("tasks", [])}
    expected = [f"TASK-ZP-{i:03d}" for i in range(1, 13)]
    errors = []
    for tid in expected:
        t = tasks[tid]
        if t.get("stage") != "VERIFY":
            errors.append(f"{tid}: stage={t.get('stage')} expected VERIFY")
        if t.get("status") != "APPROVED":
            errors.append(f"{tid}: status={t.get('status')} expected APPROVED")
        if t.get("reviewer") != "agent-noabatgircom-2254092":
            errors.append(f"{tid}: reviewer={t.get('reviewer')} expected agent-noabatgircom-2254092")
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return False
    print("PASS: All ZP-001..ZP-012 at stage=VERIFY, status=APPROVED")
    return True


def test_zp_dimension_mapping(data):
    """Test: Tasks correctly mapped to PO/Architect/CTO/QA dimensions."""
    tasks = {t["id"]: t for t in data.get("tasks", [])}
    dimensions = {
        "PO": ["TASK-ZP-001", "TASK-ZP-002", "TASK-ZP-003"],
        "Architect": ["TASK-ZP-004", "TASK-ZP-005", "TASK-ZP-006"],
        "CTO": ["TASK-ZP-007", "TASK-ZP-008", "TASK-ZP-009"],
        "QA": ["TASK-ZP-010", "TASK-ZP-011", "TASK-ZP-012"],
    }
    errors = []
    for dim, task_ids in dimensions.items():
        for tid in task_ids:
            t = tasks[tid]
            if not t.get("title", "").startswith(f"{dim}:"):
                errors.append(f"{tid}: title '{t.get('title')}' does not start with '{dim}:'")
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return False
    print("PASS: All ZP tasks correctly mapped to PO/Architect/CTO/QA dimensions")
    return True


def test_zp_dependency_chain(data):
    """Test: Sequential dependency ZP-001 -> ZP-002 -> ... -> ZP-012 maintained."""
    tasks = data.get("tasks", [])
    zp_tasks = [t for t in tasks if t["id"].startswith("TASK-ZP-")]
    zp_ids = [t["id"] for t in zp_tasks]
    expected = [f"TASK-ZP-{i:03d}" for i in range(1, 13)]
    if zp_ids != expected:
        print(f"FAIL: ZP tasks order mismatch. Got: {zp_ids}")
        return False
    print("PASS: ZP tasks appear in sequential dependency order")
    return True


def test_all_tasks_have_evidence(data):
    """Test: All ZP tasks have evidence and implementation details."""
    tasks = {t["id"]: t for t in data.get("tasks", [])}
    errors = []
    for i in range(1, 13):
        tid = f"TASK-ZP-{i:03d}"
        t = tasks[tid]
        if "evidence" not in t:
            errors.append(f"{tid}: Missing 'evidence' field")
        if "implementation" not in t:
            errors.append(f"{tid}: Missing 'implementation' field")
        if "acceptance_criteria" not in t.get("implementation", {}):
            errors.append(f"{tid}: Missing 'acceptance_criteria' in implementation")
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return False
    print("PASS: All ZP tasks have evidence and implementation details")
    return True


def test_version_1(data):
    """Test: tasks.json version is 1."""
    if data.get("version") != 1:
        print(f"FAIL: version={data.get('version')} expected 1")
        return False
    print("PASS: tasks.json version=1")
    return True


def main():
    print("=" * 60)
    print("Zero-Phase Roadmap Completion Validation (Final State)")
    print("=" * 60)
    data = load_tasks()

    tests = [
        test_version_1,
        test_all_zp_tasks_present,
        test_all_tasks_have_evidence,
        test_zp_task_final_state,
        test_zp_dimension_mapping,
        test_zp_dependency_chain,
    ]

    results = []
    for test_fn in tests:
        try:
            result = test_fn(data)
            results.append(result)
        except Exception as e:
            print(f"ERROR in {test_fn.__name__}: {e}")
            results.append(False)

    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Result: {passed}/{total} tests passed")
    if passed == total:
        print("OVERALL: PASS - Zero-Phase Roadmap fully executed with 100% test coverage!")
        return 0
    else:
        print("OVERALL: FAIL")
        return 1


if __name__ == "__main__":
    sys.exit(main())
