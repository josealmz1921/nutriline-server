import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { calculateBmi } from '../calculations/bmi.js';
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';
import type {
  CreateConsultation,
  ListConsultations,
} from './consultations.schemas.js';

const consultationSelect = {
  id: true,
  patientId: true,
  occurredAt: true,
  reason: true,
  notes: true,
  createdAt: true,
  anthropometry: {
    select: {
      measuredAt: true,
      weightKg: true,
      heightCm: true,
      waistCm: true,
      hipCm: true,
    },
  },
  calculations: {
    select: {
      methodCode: true,
      methodVersion: true,
      value: true,
      unit: true,
      calculatedAt: true,
    },
    orderBy: [{ methodCode: 'asc' }, { methodVersion: 'asc' }],
  },
} as const satisfies Prisma.ConsultationSelect;
type Row = Prisma.ConsultationGetPayload<{ select: typeof consultationSelect }>;
const present = (row: Row) => ({
  ...row,
  anthropometry: row.anthropometry && {
    ...row.anthropometry,
    weightKg: row.anthropometry.weightKg.toFixed(3),
    heightCm: row.anthropometry.heightCm.toFixed(3),
    waistCm: row.anthropometry.waistCm?.toFixed(3) ?? null,
    hipCm: row.anthropometry.hipCm?.toFixed(3) ?? null,
  },
  calculations: row.calculations.map((calculation) => ({
    ...calculation,
    value: calculation.value.toFixed(2, Prisma.Decimal.ROUND_HALF_UP),
  })),
});

@Injectable()
export class ConsultationsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PatientOwnershipService)
    private readonly ownership: PatientOwnershipService,
  ) {}

  async create(user: PublicUser, patientId: string, input: CreateConsultation) {
    const nutritionistId = this.ownership.nutritionistId(user);
    return this.db.$transaction(async (tx) => {
      await this.ownership.lockOwned(tx, patientId, nutritionistId);
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id_nutritionistId: { id: patientId, nutritionistId } },
        select: { archivedAt: true, birthDate: true },
      });
      this.ownership.requireEditable(patient);
      const occurredAt = new Date(input.occurredAt);
      const measuredAt = new Date(input.anthropometry.measuredAt);
      const now = new Date();
      // Measurements may precede the visit; neither may predate birth or be future.
      if (
        occurredAt < patient.birthDate ||
        measuredAt < patient.birthDate ||
        occurredAt > now ||
        measuredAt > now ||
        measuredAt > occurredAt
      )
        throw new BadRequestException(
          'Fechas de atención o medición incoherentes',
        );
      let calculation: ReturnType<typeof calculateBmi>;
      try {
        calculation = calculateBmi(
          input.anthropometry.weightKg,
          input.anthropometry.heightCm,
        );
      } catch {
        throw new BadRequestException('Medidas fuera del rango de cálculo');
      }
      return present(
        await tx.consultation.create({
          data: {
            patientId,
            nutritionistId,
            occurredAt,
            reason: input.reason,
            notes: input.notes,
            anthropometry: { create: { ...input.anthropometry, measuredAt } },
            calculations: { create: calculation },
          },
          select: consultationSelect,
        }),
      );
    });
  }

  async list(user: PublicUser, patientId: string, query: ListConsultations) {
    const nutritionistId = this.ownership.nutritionistId(user);
    return this.db.$transaction(
      async (tx) => {
        const patient = await tx.patient.findFirst({
          where: { id: patientId, nutritionistId },
          select: { id: true },
        });
        if (!patient) throw new NotFoundException('Paciente no encontrado');
        const where = { patientId, nutritionistId };
        const rows = await tx.consultation.findMany({
          where,
          select: consultationSelect,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const total = await tx.consultation.count({ where });
        return { data: rows.map(present), meta: { ...query, total } };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async detail(user: PublicUser, consultationId: string) {
    const row = await this.db.consultation.findFirst({
      where: {
        id: consultationId,
        nutritionistId: this.ownership.nutritionistId(user),
      },
      select: consultationSelect,
    });
    if (!row) throw new NotFoundException('Consulta no encontrada');
    return present(row);
  }
}
