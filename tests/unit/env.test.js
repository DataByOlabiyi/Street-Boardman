// TASK-008: production must never start with a missing, default, or short
// JWT secret. Each case reloads config/env.js fresh with a controlled
// process.env so we can assert the throw without polluting other tests.
describe('config/env — JWT secret fail-fast in production (TASK-008)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function loadEnv() {
    return require('../../server/config/env');
  }

  it('throws when JWT_ACCESS_SECRET is still the development default in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = 'a'.repeat(40);
    expect(loadEnv).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when JWT_REFRESH_SECRET is shorter than 32 characters in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'too-short';
    expect(loadEnv).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('starts fine in production with two distinct, long secrets', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
    expect(loadEnv).not.toThrow();
  });

  it('still allows the development defaults outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    expect(loadEnv).not.toThrow();
  });
});
