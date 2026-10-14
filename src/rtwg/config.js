// GPL-3.0-or-later. RTWG's simulation.cpp defaults and parameter ranges.
export const FIELDS = ['rock', 'soil', 'water', 'temp', 'moist', 'wind', 'ice', 'climat'];
export const LABELS = ['Рельеф', 'Почва', 'Вода / течение', 'Температура', 'Влажность', 'Ветер / давление', 'Лёд / таяние', 'Климат'];
export const PARAMETERS = {
  rock: { min_therm_limit: [.3, 0, 10, .1], max_therm_limit: [3, 0, 10, .1], threm_factor: [0, 0, 5, .1] },
  soil: { errodeFactor: [1, 0, 2, .1], soilDiffuseFactor: [1, 0, 2, .1] },
  water: { rain: [1, 0, 2, .01], evaporate: [1, 0, 2, .01], sea_level: [.95, 0, 10, .01] },
  temp: { latFactor: [0, -5, 5, .1], sunAngle: [0, -40, 40, 1], heightCooldown: [2.5, 1, 7, .1], rotationSpeed: [-.02, -1, 1, .001], DayNightFactor: [-.2, -2, 2, .1] },
  moist: { waterAddFactor: [1, 0, 5, .1], landRemoveFactor: [0, 0, 5, .1] },
  wind: { distorsionFaktor: [1, -2, 2, .1], globelWindFaktor: [1, -2, 2, .1], localPressureFaktor: [1, -2, 2, .1], windspeed: [.001, -1, 1, .001], windNoiseRoughness: [1.1, .1, 8, .1], windNoiseTurbulence: [4, 1, 20, 1] },
  ice: { iceTemperature: [-.7, -1, 1, .1] }, climat: {},
  tectonic: { oceanFraction: [.56, 0, 1, .02], plates: [10, 1, 10, 1], folding: [.01, 0, 1, .001], overlapRel: [3, 0, 3, .03], overlapAbs: [8000000, 0, 8000000, 2000], roughness: [.7, .1, 4, .1] },
};
export const PARAM_LABELS = {
  min_therm_limit: 'Порог эрозии: минимум', max_therm_limit: 'Порог эрозии: максимум', threm_factor: 'Термическая эрозия', errodeFactor: 'Водная эрозия', soilDiffuseFactor: 'Диффузия почвы', rain: 'Дождь', evaporate: 'Испарение', sea_level: 'Уровень моря', latFactor: 'Температурное смещение', sunAngle: 'Положение солнца', heightCooldown: 'Высотное охлаждение', rotationSpeed: 'Вращение день/ночь', DayNightFactor: 'Ночное охлаждение', waterAddFactor: 'Влага над водой', landRemoveFactor: 'Потеря влаги над сушей', distorsionFaktor: 'Возмущение ветра', globelWindFaktor: 'Глобальный ветер', localPressureFaktor: 'Локальное давление', windspeed: 'Скорость возмущения', windNoiseRoughness: 'Шероховатость ветра', windNoiseTurbulence: 'Турбулентность ветра', iceTemperature: 'Порог замерзания', oceanFraction: 'Начальная доля океана', plates: 'Число плит', folding: 'Складчатость', overlapRel: 'Относительное слияние', overlapAbs: 'Порог площади слияния', roughness: 'Шероховатость рельефа',
};
export function defaultParameters() { return Object.fromEntries(Object.entries(PARAMETERS).map(([group, values]) => [group, Object.fromEntries(Object.entries(values).map(([key, range]) => [key, range[0]]))])); }
export function validateParameters(input) {
  const result = defaultParameters();
  for (const [group, fields] of Object.entries(PARAMETERS)) for (const [key, [, min, max]] of Object.entries(fields)) {
    const n = input?.[group]?.[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (['plates', 'overlapAbs', 'windNoiseTurbulence'].includes(key) && !Number.isInteger(n))) throw Error(`Неверный параметр ${group}.${key}`);
    result[group][key] = n;
  }
  return result;
}
