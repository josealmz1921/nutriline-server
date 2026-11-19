import { z } from 'zod';
export const newPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((v) => v.trim().length >= 12, 'Usa al menos 12 caracteres no vacíos');
export const forgotPasswordSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254) })
  .strict();
export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    newPassword: newPasswordSchema,
  })
  .strict();
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordSchema,
  })
  .strict();
export const recoveryMessage = {
  message:
    'Si la cuenta existe y está activa, recibirás un enlace para restablecer tu contraseña. Revisa también el correo no deseado.',
};
