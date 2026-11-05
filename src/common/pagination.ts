import { z } from 'zod';

const positiveInteger = (maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(maximum));

export const paginationShape = {
  page: positiveInteger(1_000_000).default(1),
  pageSize: positiveInteger(100).default(20),
};
