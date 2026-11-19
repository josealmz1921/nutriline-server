import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PatientOwnershipService } from './patient-ownership.service.js';
import type {
  CreatePatient,
  ListPatients,
  UpdatePatient,
  ReactivatePatient,
} from './patients.schemas.js';

export const patientSelect = {
  id: true,
  fullName: true,
  birthDate: true,
  email: true,
  phone: true,
  occupation: true,
  gender: true,
  nationality: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PatientSelect;
type PatientRow = Prisma.PatientGetPayload<{ select: typeof patientSelect }>;
const present = (row: PatientRow) => ({
  ...row,
  birthDate: row.birthDate.toISOString().slice(0, 10),
});
// Treat search as literal text rather than exposing SQL LIKE wildcards.
const literalSearch = (value: string) => value.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class PatientsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PatientOwnershipService)
    private readonly ownership: PatientOwnershipService,
  ) {}

  async create(user: PublicUser, input: CreatePatient) {
    const nutritionistId = this.ownership.nutritionistId(user);
    return present(
      await this.db.patient.create({
        data: {
          ...input,
          nutritionistId,
          birthDate: new Date(`${input.birthDate}T00:00:00.000Z`),
        },
        select: patientSelect,
      }),
    );
  }

  async list(user: PublicUser, query: ListPatients) {
    const nutritionistId = this.ownership.nutritionistId(user);
    const where: Prisma.PatientWhereInput = {
      nutritionistId,
      archivedAt: query.archived ? { not: null } : null,
      ...(query.search
        ? {
            OR: ['fullName', 'email', 'phone'].map((field) => ({
              [field]: { contains: literalSearch(query.search!) },
            })),
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction(
      [
        this.db.patient.findMany({
          where,
          select: patientSelect,
          orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.patient.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map(present),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async detail(user: PublicUser, patientId: string) {
    const row = await this.db.patient.findFirst({
      where: {
        id: patientId,
        nutritionistId: this.ownership.nutritionistId(user),
      },
      select: patientSelect,
    });
    if (!row) throw new NotFoundException('Paciente no encontrado');
    return present(row);
  }

  async update(user: PublicUser, patientId: string, input: UpdatePatient) {
    const nutritionistId = this.ownership.nutritionistId(user);
    const { expectedUpdatedAt, ...changes } = input;
    return this.db.$transaction(async (tx) => {
      await this.ownership.lockOwned(tx, patientId, nutritionistId);
      const where = { id_nutritionistId: { id: patientId, nutritionistId } };
      const row = await tx.patient.findUniqueOrThrow({
        where,
        select: patientSelect,
      });
      this.ownership.requireEditable(row);
      if (
        expectedUpdatedAt &&
        row.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
      ) {
        throw new ConflictException(
          'El paciente cambió desde que abriste el formulario. Revisa el expediente actual antes de volver a editar.',
        );
      }
      return present(
        await tx.patient.update({
          where,
          data: {
            ...changes,
            // Garantiza una versión nueva incluso en dos escrituras en el mismo ms.
            updatedAt: new Date(
              Math.max(Date.now(), row.updatedAt.getTime() + 1),
            ),
            ...(changes.birthDate
              ? { birthDate: new Date(`${changes.birthDate}T00:00:00.000Z`) }
              : {}),
          },
          select: patientSelect,
        }),
      );
    });
  }

  async archive(user: PublicUser, patientId: string) {
    const nutritionistId = this.ownership.nutritionistId(user);
    return this.db.$transaction(async (tx) => {
      await this.ownership.lockOwned(tx, patientId, nutritionistId);
      const where = { id_nutritionistId: { id: patientId, nutritionistId } };
      const row = await tx.patient.findUniqueOrThrow({
        where,
        select: patientSelect,
      });
      if (row.archivedAt) return present(row);
      const now = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
      return present(
        await tx.patient.update({
          where,
          data: { archivedAt: now, updatedAt: now },
          select: patientSelect,
        }),
      );
    });
  }

  async reactivate(
    user: PublicUser,
    patientId: string,
    input: ReactivatePatient,
  ) {
    const nutritionistId = this.ownership.nutritionistId(user);
    return this.db.$transaction(async (tx) => {
      await this.ownership.lockOwned(tx, patientId, nutritionistId);
      const where = { id_nutritionistId: { id: patientId, nutritionistId } };
      const row = await tx.patient.findUniqueOrThrow({
        where,
        select: patientSelect,
      });
      // A retry on an already active record is read-only, even after an edit.
      if (!row.archivedAt) return present(row);
      if (
        row.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()
      )
        throw new ConflictException(
          'La ficha cambió desde la revisión. Actualiza el expediente antes de confirmar otra reactivación.',
        );
      return present(
        await tx.patient.update({
          where,
          data: {
            archivedAt: null,
            updatedAt: new Date(
              Math.max(Date.now(), row.updatedAt.getTime() + 1),
            ),
          },
          select: patientSelect,
        }),
      );
    });
  }
}
