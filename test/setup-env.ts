// Defaults exclusivos para tests sin DB. Las integraciones usan otro archivo/config.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'mysql://test:test@localhost:3306/nutriline_unit_test';
process.env.OBSERVE_ENABLED = 'false';
process.env.DEMO_MODE = 'false';
process.env.AUTH_ACCESS_SECRET =
  'unit-test-only-secret-not-for-production-0123456789abcdef';
