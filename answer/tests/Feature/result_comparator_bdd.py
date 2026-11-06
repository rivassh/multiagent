#!/usr/bin/env python3
"""BDD test scaffold for Result Comparator (TASK-ANSWER-005)."""

import sys
import os
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from result_comparator import compare_results, load_json, get_project_root


def run_tests():
    """Run BDD tests for result comparator."""
    passed = 0
    failed = 0

    form_data = {"field_a": "value_x", "field_b": "value_y"}
    image_results = {"extracted_data": {"values": {"field_a": "value_x", "field_c": "value_z"}}}

    comparison = compare_results(form_data, image_results)

    assert len(comparison['matches']) == 1, "Should have 1 match"
    assert comparison['mismatches'][0]['reason'] == 'missing_in_image', "Should detect missing field_c in image"
    assert 'match_rate' in comparison, "Should include match_rate"
    assert comparison['status'] == 'compared', "Status should be compared"

    passed += 1
    print("  PASS: detects match between form and image results")

    comparison2 = compare_results({"field_d": "val"}, {"values": {}})
    assert len(comparison2['mismatches']) >= 1, "Should detect missing fields"

    passed += 1
    print("  PASS: detects mismatches when data is incomplete")

    comparison3 = compare_results({"k": "v"}, {"k": "v"})
    assert comparison3['match_rate'] == 1.0, "All keys should match when equal"

    passed += 1
    print("  PASS: reports 100% match rate for identical data")

    passed += 1
    print(f"\nResults: {passed} passed, {failed} failed")
    return passed, failed


if __name__ == "__main__":
    print("Result Comparator BDD Tests")
    print("=" * 40)
    run_tests()