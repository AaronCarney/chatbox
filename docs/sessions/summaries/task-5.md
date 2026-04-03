# Task 5: PII Strip All Roles + Address Pattern

## What Was Built

Extended PII stripping to apply to all message roles (not just user messages) and added missing street address pattern detection.

## Files Modified

- `server/src/middleware/pii.ts` — Added address regex pattern
  - Detects street addresses: `\d+ [word]+ (Street|St|Avenue|Ave|...)`
  - Replaces with `[REDACTED_ADDRESS]`
  - Placed after phone patterns to avoid interference

- `server/src/routes/chat.ts` — Extended PII stripping to all roles
  - Changed from `msg.role === 'user'` filter to `typeof msg.content === 'string'` check
  - Now strips PII from assistant messages that echo user PII
  - Consistent with spec: "Assistant messages echoing user PII pass through [stripped]"

- `server/tests/middleware/pii.test.ts` — Added address pattern tests
  - "strips street addresses" — covers Street, Ave, Boulevard formats
  - "handles multiple address formats" — verifies non-greedy matching doesn't consume "and"

- `server/tests/routes/chat.test.ts` — Added all-roles stripping test
  - "strips PII from all message roles, not just user"
  - Verifies stripPii called ≥2 times with both user and assistant content

## Test Results

All 91 tests passing:
```
Test Files  11 passed (11)
Tests  91 passed (91)
```

## TDD Process

1. ✓ Write failing test for address pattern (2 failing tests added)
2. ✓ Run test, verify FAIL (expected failures confirmed)
3. ✓ Add address regex to pii.ts (non-greedy match to handle "and")
4. ✓ Run test, verify address tests PASS
5. ✓ Write failing test for all-roles stripping (1 failing test added)
6. ✓ Run test, verify FAIL (stripPii called only 1 time instead of 2+)
7. ✓ Update chat.ts sanitization logic (content type check vs role check)
8. ✓ Run all tests, verify PASS (91/91)
9. ✓ Commit: `feat: PII strip all message roles + address pattern (I1, I2)`

## Key Decisions

- Address regex uses non-greedy match (`[\w][\w\s]*?`) to prevent "and" from being treated as part of street name
- Covers common abbreviations: St, Ave, Rd, Blvd, Dr, Ln, Ct (not just full words)
- All-roles stripping based on content type check (simpler, handles all message types)
- Preserves existing sanitization order: SSN → email → phone → address

## Implementation Details

Address pattern:
```typescript
/\b\d+\s+[\w][\w\s]*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\b/gi
```

All-roles map:
```typescript
const sanitizedMessages = messages.map((msg) => {
  if (typeof msg.content === 'string') {
    return { ...msg, content: stripPii(msg.content) };
  }
  return msg;
});
```

## No Deviations

Task completed exactly as specified. Both I1 (address pattern) and I2 (all-roles stripping) implemented with full test coverage.
