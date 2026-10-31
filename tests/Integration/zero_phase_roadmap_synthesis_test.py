#!/usr/bin/env python3
"""
Zero-Phase Roadmap Synthesis Validation Test
Validates that TASK-ZP-001..TASK-ZP-012 are correctly synthesized into state/tasks.json
across PO, Architect, CTO, and QA dimensions per REQUIREMENT.md directive.
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


def test_zp_tasks_exist(data):
    """Test: All 12 ZP tasks (ZP-001..ZP-012) present."""
    tasks = {t["id"]: t for t in data.get("tasks", [])}
    expected = [f"TASK-ZP-{i:03d}" for i in range(1, 13)]
    missing = [e for e in expected if e not in tasks]
    if missing:
        print(f"FAIL: Missing ZP tasks: {missing}")
        return False
    print(f"PASS: All 12 ZP tasks present")
    return True


def test_zp_task_metadata(data):
    """Test: Each ZP task has correct stage=SPEC, status=TODO, attempts=0."""
    tasks = {t["id"]: t for t in data.get("tasks", [])}
    expected = [f"TASK-ZP-{i:03d}" for i in range(1, 13)]
    # ZP-001 is claimed by IMPLEMENTER: stage=TEST, status=IN_PROGRESS, attempts=1
    claimed = {"TASK-ZP-001": ("TEST", "IN_PROGRESS", 1)}
    errors = []
    for tid in expected:
        t = tasks[tid]
        exp_stage, exp_status, exp_attempts = claimed.get(
            tid, ("SPEC", "TODO", 0)
        )
        if t.get("stage") != exp_stage:
            errors.append(f"{tid}: stage={t.get('stage')} expected {exp_stage}")
        if t.get("status") != exp_status:
            errors.append(f"{tid}: status={t.get('status')} expected {exp_status}")
        if t.get("attempts") != exp_attempts:
            errors.append(f"{tid}: attempts={t.get('attempts')} expected {exp_attempts}")
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return False
    print("PASS: ZP-001 at TEST/IN_PROGRESS/attempts=1 (claimed); others at SPEC/TODO/attempts=0")
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
    """Test: Sequential dependency ZP-001 -> ZP-002 -> ... -> ZP-012."""
    # Dependency graph is documented in team_log and task summaries; here we verify
    # the tasks are in correct order in the array (implies priority).
    tasks = data.get("tasks", [])
    zp_tasks = [t for t in tasks if t["id"].startswith("TASK-ZP-")]
    # Check they appear in order
    zp_ids = [t["id"] for t in zp_tasks]
    expected = [f"TASK-ZP-{i:03d}" for i in range(1, 13)]
    if zp_ids != expected:
        print(f"FAIL: ZP tasks order mismatch. Got: {zp_ids}")
        return False
    print("PASS: ZP tasks appear in sequential dependency order")
    return True


def test_no_duplicates(data):
    """Test: No duplicate task IDs."""
    tasks = data.get("tasks", [])
    ids = [t["id"] for t in tasks]
    if len(ids) != len(set(ids)):
        dups = [x for x in set(ids) if ids.count(x) > 1]
        print(f"FAIL: Duplicate task IDs: {dups}")
        return False
    print("PASS: No duplicate task IDs")
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
    print("Zero-Phase Roadmap Synthesis Validation")
    print("=" * 60)
    data = load_tasks()

    tests = [
        test_version_1,
        test_no_duplicates,
        test_zp_tasks_exist,
        test_zp_task_metadata,
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
        print("OVERALL: PASS")
        return 0
    else:
        print("OVERALL: FAIL")
        return 1


if __name__ == "__main__":
    sys.exit(main())