import {
  changePasswordSchema,
  forgotPasswordSchema,
  newPasswordSchema,
  resetPasswordSchema,
} from './password-security.schemas.js';
describe('contratos de contraseñas', () => {
  it('acepta frases largas, preserva espacios, no exige reglas de composición arbitrarias', () => {
    expect(newPasswordSchema.parse('  una frase segura y larga  ')).toBe(
      '  una frase segura y larga  ',
    );
    expect(
      forgotPasswordSchema.parse({ email: ' CUENTA@EXAMPLE.INVALID ' }).email,
    ).toBe('cuenta@example.invalid');
  });
  it.each(['short', ' '.repeat(20), 'a'.repeat(129)])(
    'rechaza longitud inválida sin recortar %j',
    (value) => {
      expect(newPasswordSchema.safeParse(value).success).toBe(false);
    },
  );
  it('requiere contraseña actual, rechaza extras y tokens malformados', () => {
    expect(
      changePasswordSchema.safeParse({ newPassword: 'nueva-frase-segura' })
        .success,
    ).toBe(false);
    expect(
      forgotPasswordSchema.safeParse({
        email: 'x@example.invalid',
        redirect: 'https://evil.invalid',
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        token: 'bad',
        newPassword: 'nueva-frase-segura',
      }).success,
    ).toBe(false);
  });
});
