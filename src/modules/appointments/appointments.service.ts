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
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import {
  scheduleError,
  type CreateAppointment,
  type RescheduleAppointment,
  type StatusAppointment,
  type ListAppointments,
} from './appointments.schemas.js';
const select = {
  id: true,
  patientId: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  localStartsAt: true,
  reason: true,
  notes: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { fullName: true, archivedAt: true } },
} as const;
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PatientOwnershipService)
    private readonly ownership: PatientOwnershipService,
  ) {}
  async detail(user: PublicUser, id: string) {
    const row = await this.db.appointment.findFirst({
      where: { id, nutritionistId: this.ownership.nutritionistId(user) },
      select,
    });
    if (!row) throw new NotFoundException('Cita no encontrada');
    return row;
  }
  async list(user: PublicUser, q: ListAppointments) {
    const nutritionistId = this.ownership.nutritionistId(user);
    const search = q.search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.AppointmentWhereInput = {
      nutritionistId,
      startsAt: { lt: new Date(q.to) },
      endsAt: { gt: new Date(q.from) },
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { reason: { contains: search } },
              { patient: { fullName: { contains: search } } },
              ...(/^[0-9a-f-]{36}$/i.test(q.search)
                ? [{ patientId: q.search }]
                : []),
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => {
        const [data, total] = await Promise.all([
          tx.appointment.findMany({
            where,
            select,
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.appointment.count({ where }),
        ]);
        return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async write(
    user: PublicUser,
    input: CreateAppointment | RescheduleAppointment | StatusAppointment,
    id?: string,
  ) {
    const owner = this.ownership.nutritionistId(user),
      operation = !id ? 'create' : 'status' in input ? 'status' : 'reschedule';
    const hash = createHash('sha256')
      .update(stable({ operation, id: id ?? null, input }))
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      // Serialize ALL appointment writes for this professional, including different
      // patients and invisible time ranges. Row lock, not an in-process mutex.
      await tx.$queryRaw`SELECT id FROM nutritionist_profiles WHERE id = ${owner} FOR UPDATE`;
      const replay = await tx.appointmentMutation.findUnique({
        where: {
          nutritionistId_clientRequestId: {
            nutritionistId: owner,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== hash)
          throw new ConflictException(
            'La referencia de guardado ya se usó con otros datos',
          );
        return replay.response;
      }
      const current = id
        ? await tx.appointment.findFirst({
            where: { id, nutritionistId: owner },
          })
        : null;
      if (id && !current) throw new NotFoundException('Cita no encontrada');
      if (
        current &&
        (!('expectedVersion' in input) ||
          input.expectedVersion !== current.version)
      )
        throw new ConflictException(
          'La cita cambió en otra pestaña. No se sobrescribieron los cambios.',
        );
      if (current && !['scheduled', 'confirmed'].includes(current.status))
        throw new ConflictException(
          'La cita está cerrada; no se puede editar ni cambiar su estado',
        );
      const patientId =
        current?.patientId ?? ('patientId' in input ? input.patientId : '');
      await this.ownership.lockOwned(tx, patientId, owner);
      const patient = await tx.patient.findUniqueOrThrow({
        where: { id: patientId },
        select: { archivedAt: true, updatedAt: true },
      });
      if (!('status' in input && input.status === 'cancelled'))
        this.ownership.requireEditable(patient);
      if (
        'patientUpdatedAt' in input &&
        new Date(input.patientUpdatedAt).getTime() !==
          patient.updatedAt.getTime()
      )
        throw new ConflictException(
          'La ficha del paciente cambió. Revisa su versión antes de guardar.',
        );
      const now = new Date();
      let data: Prisma.AppointmentUncheckedUpdateInput;
      if ('status' in input) {
        if (!current) throw new NotFoundException('Cita no encontrada');
        if (
          input.status === 'confirmed' &&
          (current.status !== 'scheduled' || current.startsAt <= now)
        )
          throw new ConflictException(
            'Solo se confirma una cita programada que aún no ha iniciado',
          );
        if (
          ['attended', 'noShow'].includes(input.status) &&
          current.startsAt > now
        )
          throw new ConflictException(
            'La asistencia se registra a partir del inicio de la cita',
          );
        data = { status: input.status };
      } else {
        const error = scheduleError(input, now);
        if (error) throw new BadRequestException(error);
        const startsAt = new Date(input.startsAt),
          endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60000);
        const conflict = await tx.appointment.findFirst({
          where: {
            nutritionistId: owner,
            status: { in: ['scheduled', 'confirmed'] },
            ...(id ? { id: { not: id } } : {}),
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { id: true },
        });
        if (conflict)
          throw new ConflictException(
            'El horario se cruza con otra cita programada o confirmada, aunque esté fuera del filtro',
          );
        data = {
          startsAt,
          endsAt,
          timeZone: input.timeZone,
          localStartsAt: input.localStartsAt,
          reason: input.reason,
          notes: input.notes,
        };
      }
      const version = (current?.version ?? 0) + 1;
      if (version > 1000000)
        throw new ConflictException('Límite técnico de versiones alcanzado');
      const row = current
        ? await tx.appointment.update({
            where: { id: current.id },
            data: {
              ...data,
              version,
              updatedAt: new Date(
                Math.max(now.getTime(), current.updatedAt.getTime() + 1),
              ),
            },
            select,
          })
        : await tx.appointment.create({
            data: {
              ...(data as Prisma.AppointmentUncheckedCreateInput),
              patientId,
              nutritionistId: owner,
            },
            select,
          });
      const response = JSON.parse(
        JSON.stringify(row),
      ) as Prisma.InputJsonObject;
      await tx.appointmentMutation.create({
        data: {
          appointmentId: row.id,
          nutritionistId: owner,
          clientRequestId: input.clientRequestId,
          requestHash: hash,
          version,
          operation,
          response,
        },
      });
      return response;
    });
  }
}
