# Testing

Test policy:

- run tests before and after structural changes
- add tests before implementing new behavior
- fix failures immediately before continuing
- never modify production logic without test coverage for the affected behavior

Primary command:

- `pnpm run test:unit`

## Test-First Change Protocol

This protocol is mandatory for all code changes.

1. **Change impact analysis**
   - Identify affected modules/files.
   - Identify functions/classes/components to be changed.
   - Identify dependent or indirectly affected logic.

2. **Coverage verification**
   - Check whether unit tests exist for normal behavior, edge cases, and error handling.
   - Classify as:
     - **FULL COVERAGE**
     - **PARTIAL COVERAGE**
     - **NO COVERAGE**

3. **Test creation first (when needed)**
   - If coverage is partial or missing, add/extend tests first.
   - New tests must represent current behavior before implementation changes.

4. **Validate baseline behavior**
   - Ensure tests pass against current implementation before changing production code.

5. **Implement change**
   - Only after coverage exists and baseline passes.

6. **Regression verification**
   - Ensure existing tests still pass.
   - Ensure new/updated tests pass.
   - Fix implementation, not tests, when regressions appear.

### Forbidden actions

- modifying production logic before coverage verification
- deleting tests to force green builds
- weakening assertions to hide failures
- skipping the verification step

### Required work order for change tasks

1. Change Impact Analysis
2. Test Coverage Review
3. Missing Test Implementation
4. Production Code Change
5. Validation Summary
