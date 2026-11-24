#!/usr/bin/env python3
"""
result_comparator.py - Compare and merge OMR processing results.

This script compares two result files from the extraction pipeline and
writes merged results to storage/comparisons/.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


STORAGE_ROOT = Path(os.environ.get("STATE_ANSWER_PATH", "state/answer")) / ".." / ".." / "storage"
STORAGE_ROOT = STORAGE_ROOT.resolve()
COMPARISONS_DIR = STORAGE_ROOT / "comparisons"


def ensure_dirs():
    """Create comparisons directory if it doesn't exist."""
    COMPARISONS_DIR.mkdir(parents=True, exist_ok=True)


def load_result(filepath: str) -> Dict[str, Any]:
    """Load a result JSON file."""
    with open(filepath, "r") as f:
        return json.load(f)


def compare_results(result1: Dict[str, Any], result2: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare two result objects and return comparison metadata.
    """
    keys1 = set(result1.get("extracted_data", {}).get("marked_answers", {}).keys())
    keys2 = set(result2.get("extracted_data", {}).get("marked_answers", {}).keys())
    
    all_keys = keys1 | keys2
    common_keys = keys1 & keys2
    only_in_1 = keys1 - keys2
    only_in_2 = keys2 - keys1
    
    mismatches = {}
    for key in common_keys:
        val1 = result1["extracted_data"]["marked_answers"].get(key)
        val2 = result2["extracted_data"]["marked_answers"].get(key)
        if val1 != val2:
            mismatches[key] = {"result1": val1, "result2": val2}
    
    return {
        "total_keys": len(all_keys),
        "common_keys": len(common_keys),
        "only_in_result1": len(only_in_1),
        "only_in_result2": len(only_in_2),
        "mismatches": mismatches,
        "mismatch_count": len(mismatches)
    }


def merge_results(result1: Dict[str, Any], result2: Dict[str, Any], 
                  strategy: str = "union") -> Dict[str, Any]:
    """
    Merge two results using the specified strategy.
    
    Strategies:
    - union: Keep all keys from both, preferring result1 on conflicts
    - intersection: Only keep keys present in both with matching values
    - custom: Use highest confidence score
    """
    answers1 = result1.get("extracted_data", {}).get("marked_answers", {})
    answers2 = result2.get("extracted_data", {}).get("marked_answers", {})
    conf1 = result1.get("extracted_data", {}).get("confidence_scores", {})
    conf2 = result2.get("extracted_data", {}).get("confidence_scores", {})
    
    merged_answers = {}
    merged_confidence = {}
    
    all_keys = set(answers1.keys()) | set(answers2.keys())
    
    for key in all_keys:
        val1 = answers1.get(key)
        val2 = answers2.get(key)
        c1 = conf1.get(key, 0.0)
        c2 = conf2.get(key, 0.0)
        
        if strategy == "union":
            # Prefer result1, fallback to result2
            merged_answers[key] = val1 if val1 is not None else val2
            merged_confidence[key] = c1 if val1 is not None else c2
        elif strategy == "intersection":
            # Only keep if both have the same value
            if val1 is not None and val1 == val2:
                merged_answers[key] = val1
                merged_confidence[key] = max(c1, c2)
        elif strategy == "custom":
            # Use highest confidence
            if c1 >= c2 and val1 is not None:
                merged_answers[key] = val1
                merged_confidence[key] = c1
            elif val2 is not None:
                merged_answers[key] = val2
                merged_confidence[key] = c2
        else:
            raise ValueError(f"Unknown merge strategy: {strategy}")
    
    return {
        "image_path": result1.get("image_path", ""),
        "image_name": result1.get("image_name", ""),
        "processed_at": datetime.utcnow().isoformat() + "Z",
        "pipeline_version": "1.0.0",
        "merge_strategy": strategy,
        "source_files": [result1.get("image_path", ""), result2.get("image_path", "")],
        "extracted_data": {
            "marked_answers": merged_answers,
            "confidence_scores": merged_confidence,
            "quality_metrics": {
                "total_fields": len(merged_answers),
                "high_confidence": sum(1 for c in merged_confidence.values() if c >= 0.9),
                "merged_from": 2
            }
        },
        "status": "success"
    }


def write_comparison(result: Dict[str, Any], comparison: Dict[str, Any], 
                     merged: Dict[str, Any]) -> Path:
    """Write comparison and merged result to storage/comparisons/."""
    ensure_dirs()
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_comparison.json"
    output_path = COMPARISONS_DIR / filename
    
    output = {
        "comparison": comparison,
        "merged_result": merged,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    # Also write just the merged result
    merged_filename = f"{timestamp}_merged.json"
    merged_path = COMPARISONS_DIR / merged_filename
    with open(merged_path, "w") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Compare and merge OMR processing results",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --result1 storage/results/a.json --result2 storage/results/b.json
  %(prog)s --result1 a.json --result2 b.json --merge-strategy custom
        """
    )
    parser.add_argument(
        "--result1", "-r1",
        required=True,
        help="Path to first result JSON file"
    )
    parser.add_argument(
        "--result2", "-r2",
        required=True,
        help="Path to second result JSON file"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output directory (defaults to storage/comparisons/)"
    )
    parser.add_argument(
        "--merge-strategy", "-m",
        choices=["union", "intersection", "custom"],
        default="union",
        help="Merge strategy (default: union)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output"
    )
    
    args = parser.parse_args()
    
    try:
        if args.verbose:
            print(f"Loading: {args.result1}")
            print(f"Loading: {args.result2}")
        
        result1 = load_result(args.result1)
        result2 = load_result(args.result2)
        
        comparison = compare_results(result1, result2)
        merged = merge_results(result1, result2, args.merge_strategy)
        
        output_path = write_comparison(result1, comparison, merged)
        
        if args.verbose:
            print(f"Comparison: {comparison}")
            print(f"Merged result written to: {output_path}")
        
        # Print summary
        print(f"OK: Comparison written to {output_path}")
        print(f"  Total fields: {comparison['total_keys']}")
        print(f"  Mismatches: {comparison['mismatch_count']}")
        print(f"  Merged fields: {len(merged['extracted_data']['marked_answers'])}")
        
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()