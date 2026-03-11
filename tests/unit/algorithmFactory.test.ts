import { getAlgorithmFn, UnknownAlgorithmError } from '../../src/algorithms/index';

describe('getAlgorithmFn', () => {
  it('returns a function for token_bucket', () => {
    const fn = getAlgorithmFn('token_bucket');
    expect(typeof fn).toBe('function');
  });

  it('returns a function for sliding_window', () => {
    const fn = getAlgorithmFn('sliding_window');
    expect(typeof fn).toBe('function');
  });

  it('returns a function for fixed_window', () => {
    const fn = getAlgorithmFn('fixed_window');
    expect(typeof fn).toBe('function');
  });

  it('returns a different function for each algorithm', () => {
    const tb = getAlgorithmFn('token_bucket');
    const sw = getAlgorithmFn('sliding_window');
    const fw = getAlgorithmFn('fixed_window');
    expect(tb).not.toBe(sw);
    expect(sw).not.toBe(fw);
    expect(tb).not.toBe(fw);
  });

  it('throws UnknownAlgorithmError for an unknown algorithm name', () => {
    expect(() => getAlgorithmFn('unknown_algo' as never)).toThrow(UnknownAlgorithmError);
  });

  it('thrown error message contains the unknown algorithm name', () => {
    expect(() => getAlgorithmFn('bogus' as never)).toThrow('bogus');
  });
});
