export const muscleNames: Record<string, string> = {
  chest: 'Грудь',
  lats: 'Широчайшие',
  upperBack: 'Верх спины',
  delts: 'Дельты',
  biceps: 'Сгибатели локтя',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hamstrings: 'Задняя поверхность бедра',
  glutes: 'Большая ягодичная',
  abductors: 'Отводящие бедра',
  adductors: 'Приводящие бедра',
  calves: 'Икроножные / камбаловидная',
  abs: 'Пресс',
  erectors: 'Разгибатели спины',
};
export interface ExerciseRule {
  primary: string[];
  secondary: string[];
  position: string;
  note: string;
}
const rule = (
  primary: string[],
  secondary: string[],
  position: string,
  note: string,
): ExerciseRule => ({ primary, secondary, position, note });
export const exerciseRules: Record<string, ExerciseRule> = {
  'bench-press': rule(
    ['chest'],
    ['triceps', 'delts'],
    'Горизонтальный жим',
    'Контролируемая нижняя позиция; амплитуда по переносимости.',
  ),
  'incline-dumbbell-press': rule(
    ['chest'],
    ['triceps', 'delts'],
    'Наклонный жим',
    'Другой угол плеча. Небольшой наклон скамьи, без превращения в жим над головой.',
  ),
  'machine-chest-press': rule(
    ['chest'],
    ['triceps', 'delts'],
    'Жим с опорой',
    'Профиль сопротивления зависит от тренажёра. Настройте сиденье и глубину.',
  ),
  'cable-fly': rule(
    ['chest'],
    [],
    'Приведение плеча',
    'Сведение дополняет жим; направление троса меняет профиль нагрузки.',
  ),
  'pull-up': rule(
    ['lats'],
    ['biceps'],
    'Вертикальная тяга',
    'Полная комфортная амплитуда. Для недостаточной силы замените вертикальной тягой.',
  ),
  'lat-pulldown': rule(
    ['lats'],
    ['biceps'],
    'Вертикальная тяга',
    'Плечо над головой в начале движения; не превращайте тягу в отклонение всего корпуса.',
  ),
  'seated-row': rule(
    ['lats', 'upperBack'],
    ['biceps', 'delts'],
    'Горизонтальная тяга',
    'Отведение плеча назад и движение лопатки; положение локтя меняет акценты.',
  ),
  'barbell-row': rule(
    ['lats', 'upperBack'],
    ['biceps', 'delts', 'erectors'],
    'Тяга в наклоне',
    'Требует удержания корпуса; при усталости поясницы используйте тягу с опорой.',
  ),
  'one-arm-row': rule(
    ['lats', 'upperBack'],
    ['biceps', 'delts'],
    'Тяга одной рукой',
    'Опирайтесь свободной рукой. Не добавляйте вращение корпуса ради веса.',
  ),
  'chest-supported-row': rule(
    ['lats', 'upperBack'],
    ['biceps', 'delts'],
    'Тяга с опорой груди',
    'Опора уменьшает требования к удержанию корпуса.',
  ),
  'cable-pullover': rule(
    ['lats'],
    [],
    'Разгибание плеча',
    'Дополняет тяги движением плеча с небольшим участием сгибателей локтя.',
  ),
  'back-extension': rule(
    ['erectors', 'glutes', 'hamstrings'],
    [],
    'Разгибание туловища / бедра',
    'Акцент зависит от техники. Вес 0 кг можно заменить дополнительным отягощением.',
  ),
  'back-squat': rule(
    ['quads', 'glutes'],
    ['erectors'],
    'Приседание',
    'Глубина и наклон корпуса меняют нагрузку. Используйте контролируемую доступную амплитуду.',
  ),
  'front-squat': rule(
    ['quads', 'glutes'],
    ['erectors'],
    'Фронтальный присед',
    'Подбирайте глубину под сохранение устойчивого положения.',
  ),
  'hack-squat': rule(
    ['quads', 'glutes'],
    [],
    'Присед с опорой',
    'Дополняет сгибание голени; глубина по переносимости и геометрии тренажёра.',
  ),
  'leg-press': rule(
    ['quads', 'glutes'],
    [],
    'Жим ногами',
    'Не теряйте опору таза в нижней позиции. Глубина индивидуальна.',
  ),
  'leg-extension': rule(
    ['quads'],
    [],
    'Разгибание колена',
    'Дополняет присед или жим ногами. Профиль сопротивления зависит от тренажёра.',
  ),
  'leg-curl': rule(
    ['hamstrings'],
    [],
    'Сгибание колена',
    'Уточните положение бедра: сгибание сидя и лёжа не равноценны по длине двусуставных мышц.',
  ),
  'seated-leg-curl': rule(
    ['hamstrings'],
    [],
    'Бедро согнуто · большая длина',
    'Сидячее положение удлиняет двусуставные мышцы задней поверхности бедра по сравнению с положением лёжа.',
  ),
  'lying-leg-curl': rule(
    ['hamstrings'],
    [],
    'Бедро разогнуто',
    'Другая длина двусуставных мышц по сравнению со сгибанием сидя.',
  ),
  rdl: rule(
    ['hamstrings', 'glutes'],
    ['erectors'],
    'Наклон · большая длина',
    'Сгибание бедра под нагрузкой. Остановитесь до потери контроля таза и позвоночника.',
  ),
  deadlift: rule(
    ['glutes', 'quads'],
    ['hamstrings', 'erectors', 'upperBack'],
    'Тяга с пола',
    'Высокие требования к технике и общему восстановлению; не добавляется автоматически поверх румынской тяги.',
  ),
  'hip-thrust': rule(
    ['glutes'],
    [],
    'Разгибание бедра · укорочение',
    'Дополняет присед или наклон нагрузкой ближе к разогнутому бедру; без переразгибания поясницы.',
  ),
  'bulgarian-split-squat': rule(
    ['glutes', 'quads'],
    [],
    'Сгибание бедра · большая длина',
    'Гантели вдоль тела, доступная глубина; при необходимости опора свободной рукой.',
  ),
  'reverse-lunge': rule(
    ['glutes', 'quads'],
    [],
    'Одностороннее приседание',
    'Гантели вдоль тела. Наклон и длина шага подбираются под задачу и устойчивость.',
  ),
  'hip-abduction': rule(
    ['abductors'],
    [],
    'Отведение бедра',
    'Добавляет другую функцию ягодичных; не заменяет разгибание бедра.',
  ),
  'calf-raise': rule(
    ['calves'],
    [],
    'Подъём на носки',
    'Контролируйте нижнюю позицию и укажите положение колена.',
  ),
  'standing-calf-raise': rule(
    ['calves'],
    [],
    'Колено разогнуто',
    'При прямом колене икроножная длиннее, чем при согнутом. Без пружинящих отскоков.',
  ),
  'overhead-press': rule(
    ['delts'],
    ['triceps'],
    'Жим над головой',
    'Комфортная траектория; избегайте компенсации поясницей.',
  ),
  'dumbbell-shoulder-press': rule(
    ['delts'],
    ['triceps'],
    'Жим гантелей сидя',
    'Дополняет отведение плеча. Выберите удобный хват и высоту спинки.',
  ),
  'lateral-raise': rule(
    ['delts'],
    [],
    'Отведение плеча',
    'Для гантелей плечо силы мало внизу; не считайте нижнюю позицию автоматически нагруженной.',
  ),
  'rear-delt-fly': rule(
    ['delts', 'upperBack'],
    [],
    'Горизонтальное отведение',
    'Дополняет тяги; сохраняйте контролируемую траекторию плеча.',
  ),
  'barbell-curl': rule(
    ['biceps'],
    [],
    'Плечо вдоль корпуса',
    'Сгибание локтя. Пиковая внешняя нагрузка зависит от положения предплечья.',
  ),
  'dumbbell-curl': rule(
    ['biceps'],
    [],
    'Супинированный хват',
    'Контролируемое разгибание локтя, без раскачивания корпуса.',
  ),
  'incline-curl': rule(
    ['biceps'],
    [],
    'Плечо позади корпуса',
    'Двуглавая мышца удлинена в плечевом суставе. Длина мышцы сама по себе не описывает профиль нагрузки.',
  ),
  'preacher-curl': rule(
    ['biceps'],
    [],
    'Плечо впереди корпуса',
    'Другой угол плеча и профиль нагрузки по сравнению со сгибанием на наклонной скамье.',
  ),
  'hammer-curl': rule(
    ['biceps'],
    [],
    'Нейтральный хват',
    'В счётчике сгибателей локтя учтены двуглавая, плечевая и плечелучевая без попытки точного разделения подходов.',
  ),
  'triceps-pushdown': rule(
    ['triceps'],
    [],
    'Плечо вдоль корпуса',
    'Дополняет разгибание из-за головы другим положением плеча.',
  ),
  'overhead-triceps': rule(
    ['triceps'],
    [],
    'Плечо над головой · большая длина',
    'Длинная головка трицепса удлинена в плечевом суставе. Подберите комфортное положение локтей.',
  ),
  'lying-triceps-extension': rule(
    ['triceps'],
    [],
    'Плечо поднято · разгибание локтя',
    'Положение плеча и направление отягощения меняют длину и нагрузку длинной головки.',
  ),
  crunch: rule(
    ['abs'],
    [],
    'Сгибание туловища',
    'Пресс включён в тренировку отдельно. Не требуется приписывать верхним и нижним участкам независимые подходы.',
  ),
  'reverse-crunch': rule(
    ['abs'],
    [],
    'Подкручивание таза',
    'Контролируемое движение таза, без маха ногами.',
  ),
  'pec-deck': rule(
    ['chest'],
    [],
    'Приведение плеча с опорой',
    'Стабильная траектория; удобно доводить до отказа без страховки.',
  ),
  'smith-incline-press': rule(
    ['chest'],
    ['triceps', 'delts'],
    'Наклонный жим с фиксированной траекторией',
    'Небольшой наклон скамьи. Направляющие снижают требования к стабилизации.',
  ),
  dips: rule(
    ['chest', 'triceps'],
    ['delts'],
    'Жим вниз · большая длина груди',
    'Глубина по переносимости плеча. При недостатке силы — гравитрон или тренажёр.',
  ),
  'assisted-pull-up': rule(
    ['lats'],
    ['biceps'],
    'Вертикальная тяга с поддержкой',
    'Противовес позволяет работать в нужном диапазоне повторов.',
  ),
  't-bar-row': rule(
    ['lats', 'upperBack'],
    ['biceps', 'delts'],
    'Тяга с опорой груди',
    'Хват и положение локтей меняют акцент между широчайшими и верхом спины.',
  ),
  'smith-squat': rule(
    ['quads', 'glutes'],
    [],
    'Приседание с фиксированной траекторией',
    'Постановка стоп меняет акцент. Глубина по переносимости.',
  ),
  'pendulum-squat': rule(
    ['quads', 'glutes'],
    [],
    'Присед в тренажёре · большая глубина',
    'Позволяет глубокое сгибание колена с опорой спины.',
  ),
  'hip-adduction': rule(
    ['adductors'],
    [],
    'Приведение бедра',
    'Приводящие участвуют и в разгибании бедра; упражнение добавляет прямую нагрузку.',
  ),
  'cable-kickback': rule(
    ['glutes'],
    [],
    'Разгибание бедра на блоке',
    'Небольшой наклон корпуса вперёд; без переразгибания поясницы.',
  ),
  'seated-calf-raise': rule(
    ['calves'],
    [],
    'Колено согнуто',
    'При согнутом колене основная нагрузка на камбаловидную мышцу.',
  ),
  'leg-press-calf': rule(
    ['calves'],
    [],
    'Колено разогнуто',
    'Полная амплитуда с паузой внизу, без пружинящих отскоков.',
  ),
  'machine-shoulder-press': rule(
    ['delts'],
    ['triceps'],
    'Жим над головой с опорой',
    'Настройте высоту сиденья так, чтобы рукояти начинались на уровне плеч.',
  ),
  'cable-lateral-raise': rule(
    ['delts'],
    [],
    'Отведение плеча · нагрузка внизу',
    'Блок даёт сопротивление в нижней части амплитуды, где гантель почти не нагружает.',
  ),
  'machine-lateral-raise': rule(
    ['delts'],
    [],
    'Отведение плеча с опорой',
    'Профиль сопротивления зависит от тренажёра.',
  ),
  'reverse-pec-deck': rule(
    ['delts', 'upperBack'],
    [],
    'Горизонтальное отведение',
    'Задние дельты и верх спины; сохраняйте плечи опущенными.',
  ),
  'face-pull': rule(
    ['delts', 'upperBack'],
    [],
    'Тяга к лицу с наружной ротацией',
    'Задние дельты, верх спины и вращатели плеча. Лёгкий вес, контроль.',
  ),
  'cable-curl': rule(
    ['biceps'],
    [],
    'Плечо вдоль корпуса · блок',
    'Постоянное натяжение троса по амплитуде.',
  ),
  'bayesian-curl': rule(
    ['biceps'],
    [],
    'Плечо позади корпуса · блок',
    'Двуглавая удлинена в плечевом суставе, трос нагружает начало амплитуды.',
  ),
  'cable-crunch': rule(
    ['abs'],
    [],
    'Сгибание туловища с отягощением',
    'Позволяет прогрессировать весом в диапазоне 10–15 повторов.',
  ),
  'hanging-leg-raise': rule(
    ['abs'],
    [],
    'Подкручивание таза в висе',
    'Подкручивайте таз, а не только поднимайте ноги. Облегчённый вариант — с согнутыми коленями.',
  ),
};
export interface VolumeExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  muscles?: string[];
}
export const groupMuscles = (group = ''): string[] => {
  const g = group.toLowerCase();
  return Object.entries({
    chest: /груд/,
    lats: /спин/,
    upperBack: /спин/,
    delts: /плечи|дельт/,
    biceps: /бицепс(?! бедра)|плечелуч|плечевая|сгибатели локтя/,
    triceps: /трицепс/,
    quads: /квадрицепс/,
    hamstrings: /бедра|бедро|задняя цепь/,
    glutes: /ягодиц|задняя цепь/,
    abductors: /отводящ/,
    calves: /икр|голень|камбал/,
    abs: /пресс/,
    erectors: /разгибатели спины/,
    adductors: /приводящ/,
  })
    .filter(([, re]) => re.test(g))
    .map(([id]) => id);
};
/** Per-session soft limit. Secondary participation counts as half a set. */
export const SESSION_SOFT_LIMIT = 9;
export const INDIRECT_FACTOR = 0.5;
export const musclesOf = (exerciseId: string, fallback?: string[]) => {
  const info = exerciseRules[exerciseId];
  return {
    primary: info?.primary || (fallback || []).filter((m) => muscleNames[m]),
    secondary: info?.secondary || [],
  };
};
export function muscleLoad(exercises: VolumeExercise[]) {
  const load: Record<
    string,
    { direct: number; indirect: number; total: number }
  > = {};
  const unknown: string[] = [];
  for (const e of exercises) {
    const { primary, secondary } = musclesOf(e.exerciseId, e.muscles);
    if (!primary.length) unknown.push(e.exerciseName);
    for (const m of new Set([...primary, ...secondary])) {
      const entry = (load[m] ||= { direct: 0, indirect: 0, total: 0 });
      if (primary.includes(m)) entry.direct += e.sets;
      else entry.indirect += e.sets * INDIRECT_FACTOR;
      entry.total = entry.direct + entry.indirect;
    }
  }
  return {
    load,
    unknown,
    over: Object.entries(load)
      .filter(([, v]) => v.total > SESSION_SOFT_LIMIT)
      .map(([m]) => muscleNames[m]),
  };
}
/** Blocking structural problems only. Volume is advisory (see programWarnings). */
export function programIssue(
  days: Array<{ id: string; name: string; exercises: VolumeExercise[] }>,
) {
  if (!days.length || days.length > 14)
    return 'Допустимо от 1 до 14 тренировок.';
  if (new Set(days.map((d) => d.id)).size !== days.length)
    return 'Идентификаторы дней должны быть уникальны.';
  for (const d of days) {
    if (!d.name?.trim() || !d.exercises?.length)
      return 'Добавьте название и упражнения в каждый день.';
    if (
      d.exercises.length > 30 ||
      new Set(d.exercises.map((e) => e.exerciseId)).size !== d.exercises.length
    )
      return d.name + ': упражнения не должны повторяться в одном дне.';
    if (
      d.exercises.some(
        (e) => !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 10,
      )
    )
      return d.name + ': укажите целое число подходов от 1 до 10.';
  }
  return '';
}
export function programWarnings(
  days: Array<{ id: string; name: string; exercises: VolumeExercise[] }>,
) {
  const out: string[] = [];
  for (const d of days) {
    const v = muscleLoad(d.exercises);
    if (v.unknown.length)
      out.push(d.name + ': не указаны мышцы — ' + v.unknown.join(', '));
    if (v.over.length)
      out.push(
        d.name + ': больше ' + SESSION_SOFT_LIMIT + ' подходов за тренировку — ' + v.over.join(', '),
      );
  }
  return out;
}
/** Sets per muscle over the whole program cycle (each day once). */
export function cycleLoad(days: Array<{ exercises: VolumeExercise[] }>) {
  return muscleLoad(days.flatMap((d) => d.exercises)).load;
}
