import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';

@Injectable()
export class PatientOwnershipService {
  nutritionistId(user: PublicUser): string {
    if (
      user.role !== 'NUTRITIONIST' ||
      user.status !== 'ACTIVE' ||
      !user.nutritionistProfile
    ) {
      throw new ForbiddenException('Acceso no permitido');
    }
    return user.nutritionistProfile.id;
  }

  // Future consultation writes must use this same row lock in their transaction.
  async lockOwned(
    tx: Prisma.TransactionClient,
    patientId: string,
    nutritionistId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM patients WHERE id = ${patientId} AND nutritionist_id = ${nutritionistId} FOR UPDATE
    `;
    if (rows.length === 0)
      throw new NotFoundException('Paciente no encontrado');
  }

  requireEditable(patient: { archivedAt: Date | null }): void {
    if (patient.archivedAt) throw new ConflictException('Paciente archivado');
  }
}
