import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { calculateBmi } from '../calculations/bmi.js';
import { calculateAssessment } from '../calculations/assessment-engine.v1.js';
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';
import type {
  CreateConsultation,
  ListConsultations,
  ConsultationDirectoryQuery,
} from './consultations.schemas.js';
import { directoryWhere } from './consultation-directory.js';

const consultationSelect = {
  id: true,
  patientId: true,
  occurredAt: true,
  reason: true,
  notes: true,
  createdAt: true,
  clientRequestId: true,
  assessmentVersion: true,
  assessment: true,
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
const present = (
  row: Omit<Row, 'assessment'> & { assessment?: Prisma.JsonValue },
) => ({
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

// Stable hashing compares retries without logging clinical payloads.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function localMinute(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')?.padStart(4, '0')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

@Injectable()
export class ConsultationsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PatientOwnershipService)
    private readonly ownership: PatientOwnershipService,
  ) {}

  async create(user: PublicUser, patientId: string, input: CreateConsultation) {
    const nutritionistId = this.ownership.nutritionistId(user);
    // La instantánea del cliente nunca se incorpora a CalculationResult como si fuera verificada.
    const full = 'assessment' in input ? input : null;
    const requestHash = full
      ? createHash('sha256').update(stable(full)).digest('hex')
      : null;
    return this.db
      .$transaction(async (tx) => {
        await this.ownership.lockOwned(tx, patientId, nutritionistId);
        const patient = await tx.patient.findUniqueOrThrow({
          where: { id_nutritionistId: { id: patientId, nutritionistId } },
          select: {
            archivedAt: true,
            birthDate: true,
            fullName: true,
            updatedAt: true,
          },
        });
        if (full) {
          const existing = await tx.consultation.findUnique({
            where: {
              nutritionistId_clientRequestId: {
                nutritionistId,
                clientRequestId: full.clientRequestId,
              },
            },
            select: { ...consultationSelect, requestHash: true },
          });
          if (existing) {
            if (
              existing.patientId !== patientId ||
              existing.requestHash !== requestHash
            )
              throw new ConflictException(
                'La referencia de guardado ya se utilizó con otros datos.',
              );
            const { requestHash: _privateHash, ...publicRow } = existing;
            void _privateHash;
            return present(publicRow);
          }
          if (
            patient.updatedAt.getTime() !==
            new Date(full.patientUpdatedAt).getTime()
          )
            throw new ConflictException(
              'La ficha del paciente cambió. Conserva tu captura y revisa la identidad antes de iniciar otra evaluación.',
            );
        }
        this.ownership.requireEditable(patient);
        const occurredAt = new Date(input.occurredAt);
        const measurementInstant = full
          ? full.assessment.measuredAt
          : 'anthropometry' in input
            ? input.anthropometry.measuredAt
            : null;
        const measuredAt = measurementInstant
          ? new Date(measurementInstant)
          : null;
        const now = new Date();
        // Measurements may precede the visit; neither may predate birth or be future.
        if (
          occurredAt < patient.birthDate ||
          occurredAt > now ||
          (measuredAt &&
            (measuredAt < patient.birthDate ||
              measuredAt > now ||
              measuredAt > occurredAt))
        )
          throw new BadRequestException(
            'Fechas de atención o medición incoherentes',
          );
        if (full) {
          const assessment = full.assessment;
          if (
            localMinute(full.occurredAt, assessment.timeZone) !==
              assessment.localTimes.occurredAt ||
            (assessment.measuredAt
              ? localMinute(assessment.measuredAt, assessment.timeZone)
              : null) !== assessment.localTimes.measuredAt
          )
            throw new BadRequestException(
              'Los horarios locales no corresponden a la zona horaria y los instantes enviados.',
            );
          if (
            assessment.captures.formulas.availability === 'captured' &&
            String(assessment.captures.formulas.referenceDate) >
              localMinute(now.toISOString(), assessment.timeZone).slice(0, 10)
          )
            throw new BadRequestException(
              'La fecha de referencia de fórmulas no puede ser futura.',
            );
        }
        let calculation: ReturnType<typeof calculateBmi> | null = null;
        try {
          if (full) {
            const m = full.assessment.captures.anthropometry;
            if (m.measurementAvailability === 'captured') {
              const weightKg = String(m.weight).trim().replace(',', '.');
              const heightCm = String(m.height).trim().replace(',', '.');
              calculation = {
                ...calculateBmi(weightKg, heightCm),
                inputs: { weightKg, heightCm },
              };
            }
          } else if ('anthropometry' in input)
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
              ...(full
                ? {
                    clientRequestId: full.clientRequestId,
                    requestHash,
                    assessmentVersion: 1,
                    assessment: {
                      ...full.assessment,
                      serverCalculations: calculateAssessment(
                        full.assessment,
                        patient.birthDate.toISOString().slice(0, 10),
                        now,
                      ),
                      patientSnapshot: {
                        id: patientId,
                        fullName: patient.fullName,
                        birthDate: patient.birthDate.toISOString().slice(0, 10),
                        updatedAt: patient.updatedAt.toISOString(),
                      },
                    } as Prisma.InputJsonValue,
                  }
                : 'anthropometry' in input
                  ? {
                      anthropometry: {
                        create: {
                          ...input.anthropometry,
                          measuredAt: measuredAt!,
                        },
                      },
                    }
                  : {}),
              ...(calculation ? { calculations: { create: calculation } } : {}),
            },
            select: consultationSelect,
          }),
        );
      })
      .catch((error: unknown) => {
        if (
          full &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException(
            'La referencia de guardado ya se utilizó. Comprueba el historial antes de continuar.',
          );
        throw error;
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
          select: { ...consultationSelect, assessment: false },
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

  async directory(user: PublicUser, query: ConsultationDirectoryQuery) {
    const nutritionistId = this.ownership.nutritionistId(user);
    const where = directoryWhere(nutritionistId, query);
    const orderBy: Prisma.ConsultationOrderByWithRelationInput[] =
      query.order === 'patient'
        ? [
            { patient: { fullName: 'asc' } },
            { occurredAt: 'desc' },
            { id: 'asc' },
          ]
        : [
            { occurredAt: query.order === 'oldest' ? 'asc' : 'desc' },
            { id: 'asc' },
          ];
    return this.db.$transaction(
      async (tx) => {
        const data = await tx.consultation.findMany({
          where,
          select: {
            id: true,
            patientId: true,
            occurredAt: true,
            reason: true,
            patient: { select: { fullName: true, archivedAt: true } },
          },
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const total = await tx.consultation.count({ where });
        const patients = await tx.patient.count({
          where: { nutritionistId, consultations: { some: where } },
        });
        const archivedConsultations = await tx.consultation.count({
          where: { AND: [where, { patient: { archivedAt: { not: null } } }] },
        });
        return {
          data,
          meta: { page: query.page, pageSize: query.pageSize, total },
          summary: { patients, archivedConsultations },
        };
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
