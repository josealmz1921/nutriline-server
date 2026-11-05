import { Prisma } from '../../generated/prisma/client.js';

// Version 1: numeric BMI only, not a clinical interpretation or diagnosis.
export function calculateBmi(weightKg: string, heightCm: string) {
  const weight = new Prisma.Decimal(weightKg);
  const height = new Prisma.Decimal(heightCm);
  if (
    !weight.isFinite() ||
    !height.isFinite() ||
    weight.lte(0) ||
    height.lte(0)
  )
    throw new RangeError('Peso y talla deben ser positivos y finitos');
  const value = weight.div(height.div(100).pow(2));
  // DECIMAL(12,6) storage limit; never let MySQL truncate a calculation.
  const stored = value.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
  if (stored.gte(1000000) || stored.lte(0))
    throw new RangeError('IMC fuera del rango de almacenamiento');
  return {
    methodCode: 'BMI',
    methodVersion: '1',
    inputs: { weightKg: weight.toFixed(3), heightCm: height.toFixed(3) },
    value: stored.toFixed(6),
    unit: 'kg/m2',
  };
}
