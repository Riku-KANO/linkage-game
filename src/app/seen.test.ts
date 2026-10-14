import { describe, expect, it } from 'vitest';
import { seenAfterStoredChange, seenToRecord } from './seen';

describe('seenToRecord', () => {
  it('lists transitions seen in memory but not saved yet', () => {
    expect(seenToRecord(new Set(['T-00', 'T-01']), ['T-00'])).toEqual(['T-01']);
    expect(seenToRecord(new Set(['T-00']), ['T-00', 'T-02'])).toEqual([]);
  });
});

describe('seenAfterStoredChange', () => {
  it('seeds memory from the saved list at boot', () => {
    const next = seenAfterStoredChange(null, ['T-00', 'T-01'], new Set());
    expect(next && [...next]).toEqual(['T-00', 'T-01']);
  });

  it('adds new saved ids and keeps memory-only ids', () => {
    const next = seenAfterStoredChange(['T-00'], ['T-00', 'T-02'], new Set(['T-00', 'T-05']));
    expect(next && [...next].sort()).toEqual(['T-00', 'T-02', 'T-05']);
  });

  it('does nothing when memory already has everything', () => {
    expect(seenAfterStoredChange(['T-00'], ['T-00', 'T-01'], new Set(['T-00', 'T-01']))).toBeNull();
  });

  it('follows a reset (ids removed from the saved list)', () => {
    const next = seenAfterStoredChange(['T-00', 'T-01'], [], new Set(['T-00', 'T-01']));
    expect(next && [...next]).toEqual([]);
    expect(seenAfterStoredChange(['T-00'], [], new Set())).toBeNull();
  });
});
