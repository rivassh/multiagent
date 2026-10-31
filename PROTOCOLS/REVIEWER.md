# PROTOCOLS/REVIEWER.md - Reviewer Agent Protocols

## Evidence-Based Review Gate

Reviewer agents are strictly FORBIDDEN from transitioning tasks to APPROVED without executing and attaching the raw output of dedicated feature/unit tests verifying the specific change. Legacy test pass counts do NOT qualify as evidence.

### Verification Gate Requirements

1. **Test Evidence Required**
   - Raw test output (feature/unit test logs) must be attached as evidence
   - Legacy test pass counts, aggregate success rates, and historical test summaries are explicitly excluded
   - Evidence must demonstrate the specific change being verified

2. **Black-Box QA Stage / E2E Verification**
   - ALL tasks must pass stage/E2E verification on `sima.adlr.ir` before DONE status transition
   - This is a mandatory gate that applies after APPROVED status
   - The verification must be performed against the live production endpoint

3. **Transition Rules**
   - **TO_APPROVED**: Requires raw test evidence attachment
   - **TO_DONE**: Requires raw test evidence attachment after APPROVED, plus acceptance criteria validation, AND stage/E2E verification on sima.adlr.ir

### Machine-Enforced Verification Gate

The multiagent runner must reject task completion if:
- No dedicated test evidence exists AND/OR
- Black-Box QA stage/E2E verification on sima.adlr.ir fails

### Required Evidence Format

- Raw test output (feature/unit test logs, not summary counts) must be attached as evidence when transitioning to APPROVED status
- Black-Box QA stage verification results from `sima.adlr.ir` must also be documented
- Evidence must show explicit pass/fail for the specific change being verified

### Implementation Notes

- This protocol is enforced at the runner workflow level
- Agents must not approve tasks without the required evidence
- The verification gate is machine-enforced and cannot be bypassed
- All transitions to DONE status must include both test evidence AND stage/E2E verification results from sima.adlr.ir

### Example Workflow

```
Task Complete → Reviewer → Execute Dedicated Tests → Collect Raw Test Output →
Verify on sima.adlr.ir → Attach Evidence → APPROVED → (with E2E verification) → DONE
```

If any gate fails, the task remains in its current status and the agent must address the failure before re-attempting the transition.