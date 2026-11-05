import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();
  it('usa Argon2id con salt independiente y verifica contraseñas', async () => {
    const first = await service.hash('synthetic-password-for-tests');
    const second = await service.hash('synthetic-password-for-tests');
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(await service.verify('synthetic-password-for-tests', first)).toBe(
      true,
    );
    expect(await service.verify('wrong-password', first)).toBe(false);
  });
  it('maneja usuario desconocido y hash inválido sin revelar errores', async () => {
    expect(await service.verify('wrong-password')).toBe(false);
    expect(await service.verify('wrong-password', 'not-a-valid-hash')).toBe(
      false,
    );
  });
});
