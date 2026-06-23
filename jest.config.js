module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  collectCoverageFrom: [
    'sdk/src/**/*.ts',
    'knowledge/src/**/*.ts',
    'templates/src/**/*.ts',
    'deploy/src/**/*.ts',
    'audit/src/**/*.ts',
    'mcp/src/**/*.ts',
    'skills/src/**/*.ts',
    'cli/src/**/*.ts',
    'intent/src/**/*.ts',
    'plan/src/**/*.ts',
    'runtime/src/**/*.ts',
    'repair/src/**/*.ts',
    'memory/src/**/*.ts',
    'composition/src/**/*.ts',
    'agent-runtime/src/**/*.ts',
    'agent/src/**/*.ts',
    'review/src/**/*.ts',
    'monadforge/src/**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/tests/**'
  ]
};
