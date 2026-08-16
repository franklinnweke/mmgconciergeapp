# ADR 0001: Date intervals are date-only [startDate, endDate)

- Status: Accepted
- Date: 2026-08-16

## Context

Booking dates span full calendar days in Africa/Lagos. We must define whether intervals are inclusive or exclusive on each end, and whether time components or DST transitions are relevant.

## Decision

- Dates are `YYYY-MM-DD` strings interpreted in `Africa/Lagos`.
- Intervals use `[startDate, endDate)` semantics: start is inclusive, end is exclusive.
- August 1 to August 2 is one charged day.
- `chargedDays = max(1, dateOnlyToEpochDay(endDate) - dateOnlyToEpochDay(startDate))`.
- Overlap uses `leftStart < rightEnd && rightStart < leftEnd` (touching intervals do not collide).

## Consequences

- No timezone or DST arithmetic; pure epoch-day subtraction.
- One booking may begin on another's end date without conflict.
- All availability, booking, and calendar functions must use the same date-only primitives from `@mmg/domain`.