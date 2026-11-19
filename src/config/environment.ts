import { z } from 'zod';

const origin = z
  .string()
  .url()
  .refine((value) => {
    const url = URL.parse(value);
    return (
      url !== null &&
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin === value
    );
  });

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
    AUTH_ACCESS_SECRET: z.string().min(48),
    MAIL_MODE: z.enum(['disabled', 'smtp']).default('disabled'),
    SMTP_HOST: z.string().min(1).max(254).default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().max(254).optional(),
    SMTP_PASSWORD: z.string().max(1024).optional(),
    MAIL_FROM: z.email().max(254).default('no-reply@nutriline.example'),
    PASSWORD_RESET_ORIGIN: origin.default('http://localhost:5173'),
    AUTH_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(900)
      .default(300),
    // Compatibilidad con configuraciones antiguas: nunca autorizar más de 24 h.
    AUTH_REFRESH_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(30)
      .default(1)
      .transform(() => 1),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => {
        const url = URL.parse(value);
        return (
          url !== null &&
          url.protocol === 'mysql:' &&
          !!url.hostname &&
          !!url.username &&
          url.pathname.length > 1
        );
      }),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(origin).min(1)),
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // Bloqueada por defecto y explícitamente: no exportar información clínica.
    OBSERVE_ENABLED: z
      .literal('false')
      .default('false')
      .transform(() => false),
  })
  .superRefine((value, context) => {
    if (
      value.MAIL_MODE === 'smtp' &&
      !value.CORS_ORIGINS.includes(value.PASSWORD_RESET_ORIGIN)
    )
      context.addIssue({
        code: 'custom',
        path: ['PASSWORD_RESET_ORIGIN'],
        message: 'Origen de recuperación debe estar autorizado',
      });
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD))
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'Credenciales SMTP incompletas',
      });
    if (
      value.NODE_ENV === 'production' &&
      value.MAIL_MODE === 'smtp' &&
      (!value.PASSWORD_RESET_ORIGIN.startsWith('https://') ||
        !value.SMTP_USER ||
        !value.SMTP_PASSWORD)
    )
      context.addIssue({
        code: 'custom',
        path: ['MAIL_MODE'],
        message: 'HTTPS y autenticación SMTP requeridos',
      });
    if (value.AUTH_ACCESS_SECRET.startsWith('replace-')) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_ACCESS_SECRET'],
        message: 'Configurar secreto propio',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.CORS_ORIGINS.some((url) => !url.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'HTTPS requerido',
      });
    }
    if (value.NODE_ENV === 'production' && value.DEMO_MODE) {
      context.addIssue({
        code: 'custom',
        path: ['DEMO_MODE'],
        message: 'Demo no permitida en producción',
      });
    }
  });

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Nunca incluir valores de entrada ni mensajes que puedan contener credenciales.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Configuración inválida. Revisar: ${fields.join(', ')}`);
  }
  return result.data;
}
