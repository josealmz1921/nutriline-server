import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(input: unknown): T {
    const parsed = this.schema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Entrada inválida',
        fields: [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
        ],
      });
    return parsed.data;
  }
}
