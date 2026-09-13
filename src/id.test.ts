import { randomId } from './id';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  it('returns a UUID v4 without using global crypto', () => {
    expect(randomId()).toMatch(UUID);
  });

  it('does not repeat in a small sample', () => {
    const values = new Set(Array.from({ length: 40 }, () => randomId()));
    expect(values.size).toBe(40);
  });
});
