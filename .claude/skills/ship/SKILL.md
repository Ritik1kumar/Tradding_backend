---
name: ship
description: Test, review, then push the current branch to GitHub. Use whenever the user wants to push/ship the current changes — this replaces a raw `git push`.
---

Run this sequence for whatever is currently uncommitted or ahead of the remote on this branch. Stop at the first gate that fails and report back — never skip a step.

## 1. Diff

Run `git status` and `git diff` (staged + unstaged) against the base branch to see the full change set. If there's nothing to ship, say so and stop.

## 2. Write tests — dispatch `test-writer`

Launch the `test-writer` subagent on this diff. Wait for it to finish and run the test suite itself. If it reports failures unrelated to its own new tests, or the suite fails outright, **stop here** and report the failure to the user — do not proceed to review or push.

## 3. Review — dispatch `code-reviewer`

Launch the `code-reviewer` subagent on the diff plus whatever tests were just added. Wait for its verdict.

- If it reports **BLOCKING ISSUES FOUND**, **stop here** and report the findings to the user, ranked most-severe first. Do not push.
- If it reports **PASS**, continue.

## 4. Commit

Stage the changed files (app code + new/updated tests). Never stage `.env` or other files covered by `.gitignore`. Write a commit message describing the *why*, following this repo's existing commit style if one exists (check `git log`).

## 5. Push — confirm first

Before running `git push`, show the user: the commit(s) about to be pushed, the branch, and the remote. Ask for explicit confirmation, since pushing is visible to others and not easily reversible. Only push after they confirm.

## 6. Report

Summarize what shipped: files changed, tests added, review verdict, and the resulting commit(s)/push.
