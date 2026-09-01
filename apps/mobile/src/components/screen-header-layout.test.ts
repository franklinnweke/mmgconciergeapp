import { describe, expect, it } from 'vitest';

import { shouldCondenseScreenHeader } from './screen-header-layout';

describe('shouldCondenseScreenHeader', () => {
  it('keeps the full wordmark when there is no right-side content', () => {
    expect(shouldCondenseScreenHeader({ hasBack: true, hasRight: false, width: 320 })).toBe(false);
  });

  it('condenses top-level headers with right-side actions at and below 360 px', () => {
    expect(shouldCondenseScreenHeader({ hasBack: false, hasRight: true, width: 359 })).toBe(true);
    expect(shouldCondenseScreenHeader({ hasBack: false, hasRight: true, width: 360 })).toBe(true);
    expect(shouldCondenseScreenHeader({ hasBack: false, hasRight: true, width: 361 })).toBe(false);
  });

  it('condenses nested headers with both back and right-side content at and below 420 px', () => {
    expect(shouldCondenseScreenHeader({ hasBack: true, hasRight: true, width: 390 })).toBe(true);
    expect(shouldCondenseScreenHeader({ hasBack: true, hasRight: true, width: 420 })).toBe(true);
    expect(shouldCondenseScreenHeader({ hasBack: true, hasRight: true, width: 421 })).toBe(false);
  });
});
