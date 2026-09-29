// TASK-010: the app's `trust proxy` setting must actually reflect
// TRUST_PROXY_HOPS, not silently default to trusting nothing (breaks rate
// limiting behind a real proxy) or trusting everything (spoofable).
describe('app.js — trust proxy wiring (TASK-010)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults to 0 (trust nothing) when TRUST_PROXY_HOPS is unset', () => {
    delete process.env.TRUST_PROXY_HOPS;
    const env = require('../../server/config/env');
    expect(env.trustProxyHops).toBe(0);

    const app = require('../../server/app');
    expect(app.get('trust proxy')).toBe(0);
  });

  it('honours an explicit TRUST_PROXY_HOPS value', () => {
    process.env.TRUST_PROXY_HOPS = '2';
    const env = require('../../server/config/env');
    expect(env.trustProxyHops).toBe(2);

    const app = require('../../server/app');
    expect(app.get('trust proxy')).toBe(2);
  });
});
