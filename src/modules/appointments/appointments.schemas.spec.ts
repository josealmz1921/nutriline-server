import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  statusAppointmentSchema,
  listAppointmentsSchema,
  scheduleError,
} from './appointments.schemas.js';
import { appointmentFixture } from '../../../test/appointment-fixture.js';
const fixture = () =>
  appointmentFixture(
    '30000000-0000-4000-8000-000000000001',
    '2026-11-19T12:00:00.000Z',
  );
describe('validación de citas sin inferir consulta', () => {
  it('acepta campos independientes y rechaza identidades extra/consulta y duraciones inválidas', () => {
    const input = fixture();
    expect(createAppointmentSchema.parse(input)).toEqual(input);
    for (const durationMinutes of [0, 4, 481, 60.5])
      expect(
        createAppointmentSchema.safeParse({ ...input, durationMinutes })
          .success,
      ).toBe(false);
    for (const extra of [
      { consultationId: input.patientId },
      { status: 'attended' },
      { nutritionistId: input.patientId },
      { timeZone: 'Not/AZone' },
      { startsAt: '2026-11-19T12:00:30Z' },
    ])
      expect(
        createAppointmentSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
  });
  it('requiere versión y solo permite estados explícitos soportados', () => {
    expect(rescheduleAppointmentSchema.safeParse(fixture()).success).toBe(
      false,
    );
    expect(
      statusAppointmentSchema.safeParse({
        clientRequestId: fixture().clientRequestId,
        expectedVersion: 1,
        status: 'scheduled',
      }).success,
    ).toBe(false);
    expect(
      statusAppointmentSchema.safeParse({
        clientRequestId: fixture().clientRequestId,
        expectedVersion: 1,
        status: 'attended',
      }).success,
    ).toBe(true);
  });
  it('limita intervalos y queries ambiguas sin truncar el calendario', () => {
    const base = { from: '2027-01-01T00:00:00Z', to: '2027-02-01T00:00:00Z' };
    expect(listAppointmentsSchema.parse(base).pageSize).toBe(20);
    for (const change of [
      { to: base.from },
      { to: '2027-04-01T00:00:00Z' },
      { page: ['1', '2'] },
      { pageSize: '101' },
      { anything: 'x' },
    ])
      expect(
        listAppointmentsSchema.safeParse({ ...base, ...change }).success,
      ).toBe(false);
  });
  it('rechaza pasado, discrepancias de zona, cruce de día y ambas horas repetidas DST', () => {
    const input = fixture(),
      now = new Date('2026-01-01T00:00:00Z');
    expect(scheduleError(input, now)).toBeNull();
    expect(scheduleError(input, new Date('2099-01-01Z'))).toContain('futuro');
    expect(
      scheduleError({ ...input, localStartsAt: '2030-01-01T10:00' }, now),
    ).toContain('no corresponde');
    expect(
      scheduleError(
        {
          ...input,
          startsAt: '2027-01-01T23:30:00Z',
          localStartsAt: '2027-01-01T23:30',
        },
        now,
      ),
    ).toContain('mismo día');
    for (const startsAt of ['2027-11-07T05:30:00Z', '2027-11-07T06:30:00Z'])
      expect(
        scheduleError(
          {
            ...input,
            startsAt,
            localStartsAt: '2027-11-07T01:30',
            timeZone: 'America/New_York',
          },
          now,
        ),
      ).toContain('ambiguo');
    expect(
      scheduleError(
        {
          ...input,
          startsAt: '2027-03-14T07:30:00Z',
          localStartsAt: '2027-03-14T02:30',
          timeZone: 'America/New_York',
        },
        now,
      ),
    ).toContain('no corresponde');
  });
});
