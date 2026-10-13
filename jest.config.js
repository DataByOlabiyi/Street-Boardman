module.exports = {
  // Server tests only. client/ has its own runner (Vitest); without this,
  // the server's Jest also picked up client/**/*.test.jsx and failed on
  // the JSX.
  roots: ['<rootDir>/tests'],
  testEnvironment: 'node',
  testTimeout: 20000,
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
};
