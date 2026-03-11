describe('sanity check', () => {
  it('basic arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });

  it('truthiness works', () => {
    expect(true).toBe(true);
    expect(false).toBe(false);
  });

  it('string operations work', () => {
    expect('rate-limiter'.toUpperCase()).toBe('RATE-LIMITER');
  });
});
