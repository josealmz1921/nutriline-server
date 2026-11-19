// Version 1, frozen subset of alimentos in nutrilinedb.sql. No clinical validation.
// Do not silently expand/change a historical catalog version.
export const nutrientDefinitions = [
  ['energiaKcal', 'Energía', 'kcal', true],
  ['energiaKJ', 'Energía', 'kJ', true],
  ['proteinag', 'Proteína', 'g', true],
  ['lipidosg', 'Lípidos', 'g', true],
  ['HidratCarbg', 'Hidratos de carbono', 'g', true],
  ['fibrag', 'Fibra', 'g', true],
  ['vitaminAbugRE', 'Vitamina A', '', false],
  ['AcidoAscorbicomg', 'Ácido ascórbico', 'mg', true],
  ['AcidoFolicomg', 'Ácido fólico', '', false],
  ['hierroNOEMmg', 'Hierro no HEM', 'mg', true],
  ['calciomg', 'Calcio', 'mg', true],
  ['hierromg', 'Hierro', 'mg', true],
  ['sodiomg', 'Sodio', 'mg', true],
  ['potasiomg', 'Potasio', 'mg', true],
  ['azucarg', 'Azúcar', 'g', true],
  ['azucar', 'Azúcar · Segunda columna original', '', false],
  ['indiceglicemico', 'Índice glicémico', '', false],
  ['cargaglicemica', 'Carga glicémica', '', false],
  ['colesterol', 'Colesterol', 'mg', true],
  ['selenio', 'Selenio', '', false],
  ['AGSaturadosg', 'Ácidos grasos saturados', 'g', true],
  ['AGMonog', 'Ácidos grasos monoinsaturados', 'g', true],
  ['AGPolig', 'Ácidos grasos poliinsaturados', 'g', true],
  ['Eanol', 'Etanol', '', false],
] as const;
export const foodReferences = [
  {
    id: '1231',
    name: 'Manzana',
    quantity: 1,
    unit: 'pieza',
    values: [
      55, 231, 0.3, 0.2, 14.7, 2.6, 5.4, 6.2, 3.1, 0.2, 0, 0, 0, 122.4, 11, 0,
      38, 5.6, 0, 0, 0, 0, 0, 0,
    ],
  },
  {
    id: '2067',
    name: 'Tortilla de maíz',
    quantity: 1,
    unit: 'pieza',
    values: [
      64, 268, 1.4, 0.5, 13.6, 0.6, 0, 0, 0, 0, 58.8, 0.8, 0, 0, 0, 0, 52, 15.6,
      0, 0, 0, 0, 0, 0,
    ],
  },
  {
    id: '138',
    name: 'Arroz cocido',
    quantity: 0.25,
    unit: 'taza',
    values: [
      60, 252, 1.1, 0.1, 13.3, 0.1, 0, 0, 26, 0, 1.4, 0.7, 0, 0, 0, 0, 64, 29.8,
      0, 0, 0, 0, 0, 0,
    ],
  },
  {
    id: '1094',
    name: 'Leche descremada',
    quantity: 1,
    unit: 'taza',
    values: [
      86, 359, 8.4, 0.4, 11.9, 0, 149, 0, 0, 0, 302, 0, 126, 0, 0, 0, 0, 0, 4,
      0, 0, 0, 0, 0,
    ],
  },
  {
    id: '18',
    name: 'Aceite de oliva',
    quantity: 1,
    unit: 'cucharadita',
    values: [
      44, 185, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 3.7,
      0.4, 0,
    ],
  },
  {
    id: '1748',
    name: 'Plátano',
    quantity: 0.5,
    unit: 'pieza',
    values: [
      48, 202, 0.6, 0.2, 12.4, 1.4, 4.3, 4.8, 10.5, 0.2, 0, 0, 0, 215.2, 6.7, 0,
      52, 6.5, 0, 0, 0, 0, 0, 0,
    ],
  },
] as const;
