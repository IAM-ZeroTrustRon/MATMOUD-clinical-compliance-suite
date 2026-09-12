/**
 * Jest configuration for the Clinical Compliance API.
 *
 * ts-jest was already a devDependency but no config existed, so `npm test`
 * had nothing to run. Added alongside the first security regression tests
 * (audit findings MOUD-01 / MOUD-08).
 *
 * `types` is overridden here rather than in tsconfig.json so that jest
 * globals typecheck in test files without adding them to the build.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { types: ['node', 'jest'], esModuleInterop: true } },
    ],
  },
  clearMocks: true,
  resetModules: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
