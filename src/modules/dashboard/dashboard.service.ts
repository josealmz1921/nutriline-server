import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PatientOwnershipService } from '../patients/patient-ownership.service.js';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PatientOwnershipService)
    private readonly ownership: PatientOwnershipService,
  ) {}
  async summary(user: PublicUser) {
    const nutritionistId = this.ownership.nutritionistId(user);
    return this.db.$transaction(
      async (tx) => {
        const now = new Date();
        const upcomingWhere = {
          nutritionistId,
          startsAt: { gte: now },
          status: { in: ['scheduled', 'confirmed'] },
        };
        const activePatients = await tx.patient.count({
          where: { nutritionistId, archivedAt: null },
        });
        const archivedPatients = await tx.patient.count({
          where: { nutritionistId, archivedAt: { not: null } },
        });
        const consultations = await tx.consultation.count({
          where: { nutritionistId },
        });
        const withoutConsultations = await tx.patient.count({
          where: {
            nutritionistId,
            archivedAt: null,
            consultations: { none: {} },
          },
        });
        const upcomingAppointments = await tx.appointment.count({
          where: upcomingWhere,
        });
        const recentConsultations = await tx.consultation.findMany({
          where: { nutritionistId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
          select: {
            id: true,
            patientId: true,
            reason: true,
            occurredAt: true,
            createdAt: true,
            patient: { select: { fullName: true, archivedAt: true } },
          },
        });
        const upcoming = await tx.appointment.findMany({
          where: upcomingWhere,
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          take: 5,
          select: {
            id: true,
            patientId: true,
            reason: true,
            startsAt: true,
            endsAt: true,
            status: true,
            timeZone: true,
            patient: { select: { fullName: true, archivedAt: true } },
          },
        });
        return {
          asOf: now.toISOString(),
          totals: {
            activePatients,
            archivedPatients,
            consultations,
            withoutConsultations,
            upcomingAppointments,
          },
          recentConsultations,
          upcomingAppointments: upcoming,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
