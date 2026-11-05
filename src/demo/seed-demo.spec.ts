import { validateDemoSeedEnvironment } from './seed-demo.js';

const valid = {
  NODE_ENV: 'development',
  DEMO_MODE: 'true',
  DATABASE_URL: 'mysql://demo:demo@db:3306/nutriline',
  DEMO_PASSWORD: 'synthetic-only-password',
};
describe('seguridad del seed demo', () => {
  it('acepta solo entorno local habilitado con contraseña propia', () => {
    expect(validateDemoSeedEnvironment(valid)).toBe(valid.DEMO_PASSWORD);
  });
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { DEMO_MODE: 'false' },
    { DATABASE_URL: 'mysql://demo:demo@production.example.com/nutriline' },
    { DATABASE_URL: 'mysql://demo:demo@db/legacy' },
    { DEMO_PASSWORD: '' },
    { DEMO_PASSWORD: 'replace-this-password' },
  ])('rechaza entorno inseguro %j', (changes) => {
    expect(() =>
      validateDemoSeedEnvironment({ ...valid, ...changes }),
    ).toThrow();
  });
});
