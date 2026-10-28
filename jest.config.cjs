/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.cjs'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
  clearMocks: true,
};
