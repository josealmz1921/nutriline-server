import { validateEnvironment } from './environment.js';

const valid = {
  AUTH_ACCESS_SECRET:
    'unit-test-only-secret-not-for-production-0123456789abcdef',
  DATABASE_URL: 'mysql://user:password@localhost:3306/nutriline',
};

describe('validateEnvironment', () => {
  it('deshabilita correo por defecto y protege configuración SMTP de producción', () => {
    expect(validateEnvironment(valid).MAIL_MODE).toBe('disabled');
    expect(() => validateEnvironment({ ...valid, MAIL_MODE: 'smtp' })).toThrow(
      'PASSWORD_RESET_ORIGIN',
    );
    expect(() =>
      validateEnvironment({ ...valid, SMTP_USER: 'incomplete' }),
    ).toThrow('SMTP_USER');
    expect(() =>
      validateEnvironment({
        ...valid,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.invalid',
        PASSWORD_RESET_ORIGIN: 'https://app.example.invalid',
        MAIL_MODE: 'smtp',
      }),
    ).toThrow('MAIL_MODE');
    expect(
      validateEnvironment({
        ...valid,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.invalid',
        PASSWORD_RESET_ORIGIN: 'https://app.example.invalid',
        MAIL_MODE: 'smtp',
        SMTP_USER: 'sender',
        SMTP_PASSWORD: 'synthetic-smtp-password',
      }).MAIL_MODE,
    ).toBe('smtp');
  });
  it('limita a un día incluso configuraciones antiguas de siete o treinta días', () => {
    for (const days of ['1', '7', '30'])
      expect(
        validateEnvironment({ ...valid, AUTH_REFRESH_TTL_DAYS: days })
          .AUTH_REFRESH_TTL_DAYS,
      ).toBe(1);
    expect(validateEnvironment(valid).AUTH_REFRESH_TTL_DAYS).toBe(1);
  });
  it('normaliza configuración y valores por defecto', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      PORT: 3001,
      HOST: '127.0.0.1',
      DEMO_MODE: false,
      OBSERVE_ENABLED: false,
      CORS_ORIGINS: ['http://localhost:3000'],
    });
  });

  it.each([
    { AUTH_ACCESS_SECRET: undefined },
    { AUTH_ACCESS_SECRET: 'short' },
    {
      AUTH_ACCESS_SECRET:
        'replace-this-with-your-own-random-secret-at-least-48-characters',
    },
    { AUTH_ACCESS_TTL_SECONDS: '901' },
    { AUTH_REFRESH_TTL_DAYS: '0' },
    { NODE_ENV: 'production', CORS_ORIGINS: 'http://localhost:3000' },
  ])('rechaza autenticación insegura %j', (changes) => {
    expect(() => validateEnvironment({ ...valid, ...changes })).toThrow(
      'Configuración inválida',
    );
  });

  it('acepta una lista explícita de orígenes', () => {
    expect(
      validateEnvironment({
        ...valid,
        CORS_ORIGINS: 'http://localhost:3000, https://demo.example.com',
      }).CORS_ORIGINS,
    ).toEqual(['http://localhost:3000', 'https://demo.example.com']);
  });

  it.each([
    { DATABASE_URL: undefined },
    { DATABASE_URL: 'postgresql://user:password@localhost/db' },
    { PORT: '0' },
    { PORT: '65536' },
    { PORT: 'abc' },
    { DEMO_MODE: 'yes' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'https://demo.example.com/path' },
    { OBSERVE_ENABLED: 'true' },
    { NODE_ENV: 'production', DEMO_MODE: 'true' },
  ])('rechaza configuración inválida %j', (changes) => {
    expect(() => validateEnvironment({ ...valid, ...changes })).toThrow(
      'Configuración inválida',
    );
  });

  it('no filtra secretos en errores', () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'secreto-no-mostrar' }),
    ).toThrow('DATABASE_URL');
    try {
      validateEnvironment({ DATABASE_URL: 'secreto-no-mostrar' });
    } catch (error) {
      expect(String(error)).not.toContain('secreto-no-mostrar');
    }
  });
});
