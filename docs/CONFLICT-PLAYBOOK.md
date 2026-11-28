# Conflict Playbook

## When Merge Conflicts or Lost Edits Are Detected

### Immediate Actions (STOP)

1. **DO NOT force-push**
2. **DO NOT continue editing conflicted files**
3. **DO NOT manually resolve conflicts without following this protocol**
4. **STOP all work on the affected task(s)**

### Step 1: Assess the Situation

Check what happened:

```bash
# Check git status
git status

# Check recent commits
git log --oneline -10

# Check remote status
git fetch origin
git status --branch --long
```

Identify:
- Which files have conflicts?
- Which task(s) are affected?
- Which agent(s) were working on them?
- When did the conflict occur?

### Step 2: Create a BLOCKED Task

Create a task to track the conflict resolution:

```bash
# Create blocking task
bash scripts/task.sh new TASK-CONFLICT-$(date +%s) "Resolve merge conflict in $(basename $(pwd))"

# Claim it
bash scripts/task.sh claim TASK-CONFLICT-...

# Block it with conflict details
bash scripts/task.sh block TASK-CONFLICT-... "Merge conflict detected. Files: file1.py, file2.js. Agents involved: agent-a, agent-b."
```

### Step 3: Journal the Conflict

Document the conflict in the journal:

```bash
bash scripts/journal.sh append "$AGENT_ID" "TASK-CONFLICT-..." "CONFLICT_DETECTED" "Merge conflict in files: file1.py, file2.js. Stopping work per protocol."
```

### Step 4: Notify Human Supervisor

Add to the human-readable journal:

```markdown
## Conflict Alert [$(date -u +"%Y-%m-%dT%H:%M:%SZ")]

**Task**: TASK-XXX (if applicable)
**Files**: file1.py, file2.js
**Agents involved**: agent-a, agent-b
**Status**: BLOCKED
**Action required**: Human intervention needed for merge conflict resolution.
```

### Step 5: Wait for Human Decision

Do NOT proceed until:
1. Human supervisor reviews the conflict
2. Resolution strategy is approved
3. BLOCKED task is updated with resolution plan

## Conflict Resolution Strategies

### Strategy A: Rebase and Continue (Preferred)

If the conflict is simple and one agent's work should be preserved:

```bash
# Backup current state
git stash

# Update from remote
git fetch origin
git rebase origin/main

# Resolve conflicts (if any)
# Edit conflicted files, then:
git add <resolved-files>
git rebase --continue

# Restore work
git stash pop
```

### Strategy B: Create Merge Commit

If both agents' work should be preserved:

```bash
# Update from remote
git fetch origin
git merge origin/main

# Resolve conflicts
# Edit conflicted files, then:
git add <resolved-files>
git commit -m "[TASK-XXX][agent-id] Merge resolution: brief description"
```

### Strategy C: Cherry-pick Critical Changes

If only specific changes are needed:

```bash
# Identify needed commits
git log --oneline origin/main..HEAD

# Cherry-pick specific commits
git cherry-pick <commit-hash1> <commit-hash2>

# Resolve any conflicts during cherry-pick
```

### Strategy D: Reset and Reapply

If the local work is small and can be reapplied:

```bash
# Backup current changes as patch
git diff HEAD > changes.patch

# Reset to remote
git fetch origin
git reset --hard origin/main

# Reapply changes
git apply changes.patch

# Clean up
rm changes.patch
```

## Preventing Conflicts

### Best Practices

1. **Work in Isolation**: Always use worktrees
   ```bash
   bash scripts/worktree.sh new TASK-XXX
   cd ../wt-TASK-XXX
   ```

2. **Push Frequently**: Small, frequent commits
   ```bash
   git add .
   git commit -m "[TASK-XXX][agent-id] Brief description"
   git push origin task/TASK-XXX
   ```

3. **Update Regularly**: Rebase against main often
   ```bash
   git fetch origin
   git rebase origin/main
   ```

4. **Use Leases**: Acquire leases for shared files
   ```bash
   bash scripts/lease.sh acquire "src/shared/*.py" TASK-XXX
   ```

5. **Communicate**: Check journal for other agents' activity
   ```bash
   bash scripts/journal.sh tail 20
   bash scripts/lease.sh list
   ```

### Early Detection

Set up monitoring:

```bash
# Check for potential conflicts before starting work
git fetch origin
git log --oneline origin/main..HEAD

# Check leases on files you plan to edit
bash scripts/lease.sh verify "src/file-i-will-edit.py"
```

## Recovery After Resolution

Once human supervisor approves resolution:

1. **Update BLOCKED Task**:
   ```bash
   bash scripts/task.sh status TASK-CONFLICT-... IN_PROGRESS
   ```

2. **Document Resolution**:
   ```bash
   bash scripts/journal.sh append "$AGENT_ID" "TASK-CONFLICT-..." "CONFLICT_RESOLVED" "Resolution strategy C applied. Files resolved: file1.py, file2.js"
   ```

3. **Resume Normal Work**:
   ```bash
   # Update task that was blocked
   bash scripts/task.sh status TASK-XXX IN_PROGRESS
   
   # Continue work
   cd ../wt-TASK-XXX
   ```

4. **Complete Conflict Task**:
   ```bash
   bash scripts/task.sh status TASK-CONFLICT-... DONE
   ```

## Emergency Override

Only in extreme cases with human approval:

```bash
# Force push (DANGEROUS - last resort)
git push origin --force-with-lease

# Skip hooks (only for emergency fixes)
git commit --no-verify -m "[EMERGENCY][agent-id] Emergency conflict resolution"
```

**WARNING**: Force pushes and hook skipping can cause data loss and coordination breakdown. Only use with explicit human approval and thorough documentation.

## Post-Conflict Analysis

After resolution, document lessons learned:

1. What caused the conflict?
2. How could it have been prevented?
3. What improvements to the protocol are needed?
4. Update documentation and scripts accordingly.

---

**Remember**: Conflicts are normal in distributed development. The key is handling them systematically without data loss or coordination breakdown.