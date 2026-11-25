import {
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
import type { CreateMenu, EditMenu } from './menus.schemas.js';
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
const publicRevision = {
  revision: true,
  schemaVersion: true,
  capture: true,
  patientSnapshot: true,
  professionalSnapshot: true,
  createdAt: true,
} as const;
@Injectable()
export class MenusService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PatientOwnershipService)
    private readonly ownership: PatientOwnershipService,
  ) {}
  private async read(
    tx: Prisma.TransactionClient,
    nutritionistId: string,
    id: string,
    revision?: number,
  ) {
    const root = await tx.dailyMenu.findFirst({
      where: { id, nutritionistId },
      select: {
        id: true,
        patientId: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!root) throw new NotFoundException('Menú no encontrado');
    const saved = await tx.dailyMenuRevision.findUnique({
      where: {
        menuId_revision: { menuId: id, revision: revision ?? root.revision },
      },
      select: publicRevision,
    });
    if (!saved) throw new NotFoundException('Revisión no encontrada');
    const { capture, ...rest } = saved;
    return {
      ...rest,
      id: root.id,
      patientId: root.patientId,
      currentRevision: root.revision,
      updatedAt: root.updatedAt,
      revisionCreatedAt: rest.createdAt,
      createdAt: root.createdAt,
      menu: capture,
    };
  }
  async detail(user: PublicUser, id: string, revision?: number) {
    const owner = this.ownership.nutritionistId(user);
    return this.db.$transaction((tx) => this.read(tx, owner, id, revision), {
      isolationLevel: 'RepeatableRead',
    });
  }
  async list(
    user: PublicUser,
    patientId: string,
    query: { page: number; pageSize: number },
  ) {
    const owner = this.ownership.nutritionistId(user);
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.patient.findFirst({
            where: { id: patientId, nutritionistId: owner },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Paciente no encontrado');
        const where = { patientId, nutritionistId: owner };
        const [rows, total] = await Promise.all([
          tx.dailyMenu.findMany({
            where,
            select: {
              id: true,
              patientId: true,
              date: true,
              revision: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.dailyMenu.count({ where }),
        ]);
        return {
          data: rows.map((row) => ({
            ...row,
            date: row.date.toISOString().slice(0, 10),
          })),
          meta: { ...query, total },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async save(
    user: PublicUser,
    patientId: string,
    input: CreateMenu | EditMenu,
    menuId?: string,
  ) {
    const owner = this.ownership.nutritionistId(user),
      hash = createHash('sha256')
        .update(stable({ patientId, menuId: menuId ?? null, input }))
        .digest('hex');
    return this.db
      .$transaction(async (tx) => {
        await this.ownership.lockOwned(tx, patientId, owner);
        const replay = await tx.dailyMenuRevision.findUnique({
          where: {
            nutritionistId_clientRequestId: {
              nutritionistId: owner,
              clientRequestId: input.clientRequestId,
            },
          },
          select: { menuId: true, revision: true, requestHash: true },
        });
        if (replay) {
          if (replay.requestHash !== hash)
            throw new ConflictException(
              'La referencia de guardado ya se usó con otros datos',
            );
          return this.read(tx, owner, replay.menuId, replay.revision);
        }
        const patient = await tx.patient.findUniqueOrThrow({
          where: {
            id_nutritionistId: { id: patientId, nutritionistId: owner },
          },
          select: {
            fullName: true,
            birthDate: true,
            updatedAt: true,
            archivedAt: true,
          },
        });
        this.ownership.requireEditable(patient);
        if (
          patient.updatedAt.getTime() !==
          new Date(input.patientUpdatedAt).getTime()
        )
          throw new ConflictException(
            'La ficha del paciente cambió. Conserva tu captura y revisa el expediente.',
          );
        let id = menuId,
          revision = 1;
        if (id) {
          const current = await tx.dailyMenu.findFirst({
            where: { id, patientId, nutritionistId: owner },
          });
          if (!current) throw new NotFoundException('Menú no encontrado');
          if (
            !('expectedRevision' in input) ||
            input.expectedRevision !== current.revision
          )
            throw new ConflictException(
              'El menú cambió en otra pestaña. No se sobrescribió; conserva la captura y revisa la última versión.',
            );
          revision = current.revision + 1;
          if (revision > 1000000)
            throw new ConflictException(
              'Límite técnico de revisiones alcanzado',
            );
          await tx.dailyMenu.update({
            where: { id },
            data: {
              revision,
              date: new Date(`${input.menu.date}T00:00:00Z`),
              updatedAt: new Date(
                Math.max(Date.now(), current.updatedAt.getTime() + 1),
              ),
            },
          });
        } else {
          id = (
            await tx.dailyMenu.create({
              data: {
                patientId,
                nutritionistId: owner,
                date: new Date(`${input.menu.date}T00:00:00Z`),
              },
            })
          ).id;
        }
        await tx.dailyMenuRevision.create({
          data: {
            menuId: id,
            nutritionistId: owner,
            revision,
            schemaVersion: input.schemaVersion,
            capture: input.menu as Prisma.InputJsonValue,
            clientRequestId: input.clientRequestId,
            requestHash: hash,
            patientSnapshot: {
              id: patientId,
              fullName: patient.fullName,
              birthDate: patient.birthDate.toISOString().slice(0, 10),
              updatedAt: patient.updatedAt.toISOString(),
            },
            professionalSnapshot: {
              id: owner,
              displayName: user.nutritionistProfile!.displayName,
              timezone: user.nutritionistProfile!.timezone,
            },
          },
        });
        return this.read(tx, owner, id, revision);
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException(
            'Referencia de guardado ya utilizada. Comprueba el registro antes de continuar.',
          );
        throw error;
      });
  }
  async edit(user: PublicUser, id: string, input: EditMenu) {
    const owner = this.ownership.nutritionistId(user);
    const menu = await this.db.dailyMenu.findFirst({
      where: { id, nutritionistId: owner },
      select: { patientId: true },
    });
    if (!menu) throw new NotFoundException('Menú no encontrado');
    return this.save(user, menu.patientId, input, id);
  }
}
