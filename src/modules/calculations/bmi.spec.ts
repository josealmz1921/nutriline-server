import { calculateBmi } from './bmi.js';

describe('BMI v1 sin interpretación clínica', () => {
  it('calcula con entradas explícitas y precisión interna', () => {
    expect(calculateBmi('70', '175')).toEqual({
      methodCode: 'BMI',
      methodVersion: '1',
      inputs: { weightKg: '70.000', heightCm: '175.000' },
      value: '22.857143',
      unit: 'kg/m2',
    });
    expect(calculateBmi('70.001', '175.001').value).toBe('22.857208');
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '-Infinity'])(
    'rechaza peso/talla %s',
    (value) => {
      expect(() => calculateBmi(value, '175')).toThrow(RangeError);
      expect(() => calculateBmi('70', value)).toThrow(RangeError);
    },
  );
  it('rechaza overflow y underflow del resultado sin truncar en MySQL', () => {
    expect(() => calculateBmi('99999.999', '0.001')).toThrow(RangeError);
    expect(() => calculateBmi('0.001', '99999.999')).toThrow(RangeError);
  });
});
