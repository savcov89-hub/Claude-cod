/**
 * Книга простых блюд. Рацион собирается из них, а не из отдельных продуктов: 2 завтрака, 2 обеда, 2 ужина и перекус
 * на неделю, каждое блюдо повторяется 3–4 дня. Граммы — на одну стандартную порцию, сырые продукты, крупы сухие.
 * Решатель меняет порцию по частям блюда (белок, гарнир, овощи, остальное) в пределах COMP_RANGE, состав — нет.
 *
 * Ингредиент с вариантами ([id, подпись] — подпись подставляется в название вместо {0}, {1}) даёт несколько блюд:
 * «{0} с гречкой» → «Куриное филе с гречкой», «Филе индейки с гречкой». Блюдо исчезает, если хотя бы один его продукт
 * исключён (непереносимость, бюджет, сезон), — поэтому вариантов несколько.
 */

export type Slot = "breakfast" | "snack" | "lunch" | "dinner";
/** Части блюда: p — белок, s — гарнир (крупа, картофель, хлеб), v — овощи и фрукты, x — масло, соус, соль, связка. */
export type Comp = "p" | "s" | "v" | "x";
/** Шаг готовки: prep — нарезать, смешать (руки заняты); stove — плита; oven — духовка (руки свободны); wait — ждать. */
export interface Step { t: string; min: number; k: "prep" | "stove" | "oven" | "wait" }

type Opt = [id: string, label: string];
type Ing = [comp: Comp, grams: number, id: string | Opt[]];

interface RecipeDef {
  id: string;
  name: string;
  slots: Slot[];
  /** batch — готовится впрок в день готовки; quick — делается в тот же день за 3–15 минут. */
  cook: "batch" | "quick";
  /** сколько дней блюдо хранится в холодильнике после готовки */
  fridge: number;
  /** можно ли замораживать готовые порции */
  freeze: boolean;
  ing: Ing[];
  steps: Step[];
  /** как есть / разогреть */
  serve: string;
  /** что сделать вечером накануне готовки (замочить, разморозить), со строчной буквы */
  ahead?: string;
}

export const COMP_RANGE: Record<Comp, [number, number]> = { p: [0.6, 1.8], s: [0.4, 2.0], v: [0.7, 1.8], x: [0.6, 1.6] };

/** Продукты «кладовой»: соль и масло не считаются в число разных продуктов недели. */
export const PANTRY = new Set(["salt_iodized", "sunflower_oil", "olive_oil"]);

const BERRIES: Opt[] = [["blackcurrant", "смородиной"], ["cranberry", "клюквой"], ["blueberry", "голубикой"], ["lingonberry", "брусникой"]];
/** те же ягоды с предлогом: «со смородиной», «с клюквой» */
const WITH_BERRIES: Opt[] = BERRIES.map(([id, l]) => [id, (l.startsWith("с") ? "со " : "с ") + l]);

const RECIPES: RecipeDef[] = [
  // ——— Завтраки ———
  {
    id: "oats_milk", name: "Овсянка на молоке {0}", slots: ["breakfast"], cook: "quick", fridge: 0, freeze: false,
    ing: [["s", 60, "oats"], ["p", 200, "milk_25"], ["v", 80, WITH_BERRIES]],
    steps: [
      { t: "Молоко довести до кипения, всыпать хлопья и варить 6–8 минут на слабом огне, помешивая.", min: 10, k: "stove" },
      { t: "Ягоды положить прямо из морозилки, накрыть крышкой на 2 минуты.", min: 2, k: "prep" },
    ],
    serve: "Готовится утром за 10 минут.",
  },
  {
    id: "oats_water", name: "Овсянка на воде с яблоком и {0}", slots: ["breakfast"], cook: "quick", fridge: 0, freeze: false,
    ing: [["s", 60, "oats"], ["v", 150, "apple"], ["x", 15, [["walnuts", "грецкими орехами"], ["sunflower_seeds", "семечками"], ["pumpkin_seeds", "тыквенными семечками"]]]],
    steps: [
      { t: "Хлопья залить кипятком 1:2, варить 6–8 минут.", min: 10, k: "stove" },
      { t: "Яблоко нарезать кубиком, добавить в кашу вместе с орехами.", min: 3, k: "prep" },
    ],
    serve: "Готовится утром за 10 минут.",
  },
  {
    id: "buckwheat_milk", name: "Гречневая каша с молоком", slots: ["breakfast"], cook: "quick", fridge: 0, freeze: false,
    ing: [["s", 60, "buckwheat"], ["p", 200, "milk_25"], ["x", 5, "butter"]],
    steps: [{ t: "Гречку промыть, залить водой 1:2, варить под крышкой 15 минут. Подавать с маслом и тёплым молоком.", min: 15, k: "stove" }],
    serve: "Утром 15 минут или сварите гречку вечером — утром только разогреть.",
  },
  {
    id: "buckwheat_egg", name: "Гречка с яйцом и {0}", slots: ["breakfast"], cook: "quick", fridge: 0, freeze: false,
    ing: [["s", 50, "buckwheat"], ["p", 110, "egg"], ["v", 120, [["cucumber", "огурцом"], ["tomato", "помидором"], ["sauerkraut", "квашеной капустой"]]], ["x", 1, "salt_iodized"]],
    steps: [
      { t: "Гречку залить водой 1:2, варить 15 минут (можно сварить вечером).", min: 15, k: "stove" },
      { t: "Яйца сварить вкрутую 9 минут. Овощи нарезать.", min: 10, k: "stove" },
    ],
    serve: "Яйца можно сварить сразу на несколько дней — в холодильнике хранятся до недели.",
  },
  {
    id: "omelet", name: "Омлет {0}", slots: ["breakfast", "dinner"], cook: "quick", fridge: 0, freeze: false,
    ing: [["p", 110, "egg"], ["v", 120, [["spinach", "со шпинатом"], ["broccoli", "с брокколи"], ["tomato", "с помидорами"], ["pepper_red", "со сладким перцем"]]], ["x", 5, "sunflower_oil"], ["x", 1, "salt_iodized"]],
    steps: [
      { t: "Овощи нарезать и прогреть на сковороде с маслом 3 минуты (замороженные — 5 минут).", min: 5, k: "stove" },
      { t: "Яйца взбить с солью и 2 ложками воды, залить овощи, готовить под крышкой 5 минут.", min: 6, k: "stove" },
    ],
    serve: "Готовится за 10 минут.",
  },
  {
    id: "cottage_berries", name: "Творог со сметаной и {0}", slots: ["breakfast", "snack"], cook: "quick", fridge: 0, freeze: false,
    ing: [["p", 180, "cottage_5"], ["x", 20, "sour_cream_15"], ["v", 80, BERRIES]],
    steps: [{ t: "Ягоды достать из морозилки вечером в холодильник. Утром смешать творог со сметаной и ягодами.", min: 3, k: "prep" }],
    serve: "Без готовки, 3 минуты.",
  },
  {
    id: "syrniki", name: "Сырники со сметаной и {0}", slots: ["breakfast"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 160, "cottage_5"], ["p", 30, "egg"], ["s", 30, "oats"], ["x", 20, "sour_cream_15"], ["x", 8, "sunflower_oil"], ["v", 70, BERRIES]],
    steps: [
      { t: "Овсяные хлопья измельчить в блендере. Творог размять вилкой, смешать с яйцами и хлопьями, оставить на 10 минут.", min: 10, k: "prep" },
      { t: "Сформировать сырники и обжарить на масле по 3–4 минуты с каждой стороны на среднем огне.", min: 20, k: "stove" },
    ],
    serve: "Разогреть 1 минуту в микроволновке; подавать со сметаной и ягодами.",
  },
  {
    id: "casserole", name: "Творожная запеканка {0}", slots: ["breakfast"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 170, "cottage_5"], ["p", 35, "egg"], ["s", 20, "oats"], ["v", 100, [["apple", "с яблоком"], ["banana", "с бананом"], ["blackcurrant", "со смородиной"]]], ["x", 15, "sour_cream_15"]],
    steps: [
      { t: "Творог, яйца и хлопья перемешать, добавить нарезанные фрукты или ягоды.", min: 10, k: "prep" },
      { t: "Выложить в форму и запекать 35 минут при 180°.", min: 35, k: "oven" },
    ],
    serve: "Есть холодной или разогреть 1 минуту; со сметаной.",
  },
  {
    id: "millet_pumpkin", name: "Пшённая каша с тыквой", slots: ["breakfast"], cook: "batch", fridge: 3, freeze: true,
    ing: [["s", 55, "millet"], ["v", 150, "pumpkin"], ["p", 180, "milk_25"], ["x", 5, "butter"]],
    steps: [
      { t: "Пшено промыть горячей водой. Тыкву очистить и нарезать кубиком 1 см.", min: 10, k: "prep" },
      { t: "Залить молоком пополам с водой (4 части жидкости на 1 часть пшена), варить на слабом огне 25 минут, помешивая.", min: 25, k: "stove" },
    ],
    serve: "Разогреть 2 минуты, добавив ложку воды или молока.",
  },
  {
    id: "tofu_scramble", name: "Тофу, жаренный {0}", slots: ["breakfast", "dinner"], cook: "quick", fridge: 0, freeze: false,
    ing: [["p", 150, "tofu"], ["v", 130, [["spinach", "со шпинатом"], ["tomato", "с помидорами"], ["pepper_red", "со сладким перцем"]]], ["x", 7, "sunflower_oil"], ["x", 1, "salt_iodized"]],
    steps: [{ t: "Тофу размять вилкой, обжарить с овощами на масле 7 минут, посолить.", min: 10, k: "stove" }],
    serve: "Готовится за 10 минут.",
  },

  {
    id: "rice_milk_apple", name: "Рисовая каша на молоке с яблоком", slots: ["breakfast"], cook: "batch", fridge: 3, freeze: false,
    ing: [["s", 50, "rice_white"], ["p", 150, "milk_25"], ["v", 120, "apple"], ["x", 5, "butter"]],
    steps: [
      { t: "Рис промыть, залить водой 1:2 и варить 10 минут, добавить молоко и варить ещё 10 минут на слабом огне, помешивая.", min: 22, k: "stove" },
      { t: "Яблоко нарезать кубиком, добавить в тарелку при подаче.", min: 3, k: "prep" },
    ],
    serve: "Разогреть 2 минуты, добавив ложку воды или молока; яблоко нарезать свежее.",
  },

  // ——— Обеды и ужины: готовятся впрок ———
  {
    id: "poultry_buckwheat", name: "{0} с гречкой и тушёной капустой", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 150, [["chicken_breast", "Куриное филе"], ["turkey_breast", "Филе индейки"], ["chicken_thigh", "Куриные бёдра"]]], ["s", 65, "buckwheat"],
      ["v", 150, "cabbage"], ["v", 50, "carrot"], ["v", 30, "onion"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Птицу нарезать кусками 3–4 см, посолить. Капусту нашинковать, морковь натереть, лук нарезать.", min: 15, k: "prep" },
      { t: "Птицу выложить в форму, сбрызнуть маслом, запекать 25–30 минут при 200°.", min: 30, k: "oven" },
      { t: "Лук и морковь обжарить 5 минут, добавить капусту и полстакана воды, тушить под крышкой 25 минут.", min: 30, k: "stove" },
      { t: "Гречку промыть, залить водой 1:2, после закипания варить под крышкой 15 минут.", min: 18, k: "stove" },
    ],
    serve: "Разогреть в микроволновке 2–3 минуты до горячего.",
  },
  {
    id: "poultry_rice", name: "{0} с рисом и {1}", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 150, [["chicken_breast", "Курица"], ["turkey_breast", "Индейка"]]], ["s", 65, "rice_white"],
      ["v", 150, [["broccoli", "брокколи"], ["green_beans", "стручковой фасолью"], ["peas_green_frozen", "зелёным горошком"]]], ["v", 40, "carrot"],
      ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Птицу нарезать кусками, посолить. Морковь нарезать соломкой.", min: 10, k: "prep" },
      { t: "Птицу запекать 25 минут при 200°.", min: 25, k: "oven" },
      { t: "Рис промыть, залить водой 1:2, варить под крышкой 18 минут.", min: 20, k: "stove" },
      { t: "Морковь и замороженные овощи обжарить на масле 8–10 минут.", min: 10, k: "stove" },
    ],
    serve: "Разогреть 2–3 минуты до горячего.",
  },
  {
    id: "chicken_soup", name: "Куриный суп с {1}", slots: ["lunch"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 100, [["chicken_thigh", ""], ["chicken_breast", ""]]], ["s", 25, [["rice_white", "рисом"], ["buckwheat", "гречкой"], ["pasta", "вермишелью"]]],
      ["s", 120, "potato"], ["v", 50, "carrot"], ["v", 30, "onion"], ["v", 5, "dill"], ["x", 2, "salt_iodized"]],
    steps: [
      { t: "Курицу залить водой (≈500 мл на порцию), довести до кипения, снять пену, варить 30 минут.", min: 35, k: "stove" },
      { t: "Пока варится бульон: картофель нарезать кубиком, морковь и лук мелко.", min: 10, k: "prep" },
      { t: "Курицу вынуть, разобрать на кусочки. В бульон положить овощи и крупу, варить 15 минут, вернуть курицу, посолить, добавить укроп.", min: 20, k: "stove" },
    ],
    serve: "Разогреть до кипения в кастрюльке или 3 минуты в микроволновке.",
  },
  {
    id: "borsch", name: "Борщ с {0}", slots: ["lunch"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 100, [["beef_bone_in", "говядиной"], ["chicken_thigh", "курицей"], ["pork_shoulder", "свининой"]]],
      ["v", 80, "beet"], ["v", 100, "cabbage"], ["v", 40, "carrot"], ["v", 30, "onion"], ["s", 80, "potato"],
      ["x", 15, "sour_cream_15"], ["x", 5, "sunflower_oil"], ["x", 2, "salt_iodized"]],
    steps: [
      { t: "Мясо залить водой (≈500 мл на порцию), варить: говядину 1,5 часа, свинину 1 час, курицу 30 минут.", min: 90, k: "wait" },
      { t: "Свёклу и морковь натереть, лук нарезать, обжарить на масле 10 минут. Капусту нашинковать, картофель нарезать.", min: 20, k: "prep" },
      { t: "В бульон положить картофель и капусту, через 10 минут — обжарку, варить ещё 10 минут, посолить.", min: 25, k: "stove" },
    ],
    serve: "Разогреть до кипения; сметану добавлять в тарелку.",
  },
  {
    id: "lentil_soup", name: "Суп из чечевицы с тыквой", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 60, "lentils"], ["s", 80, "potato"], ["v", 60, "pumpkin"], ["v", 50, "carrot"], ["v", 40, "onion"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Лук и морковь нарезать и обжарить на масле 5 минут. Картофель и тыкву нарезать кубиком.", min: 15, k: "prep" },
      { t: "Чечевицу промыть, залить водой (≈400 мл на порцию), добавить овощи и варить 25 минут, посолить. По желанию пробить блендером.", min: 30, k: "stove" },
    ],
    serve: "Разогреть до кипения, при необходимости добавить немного воды.",
  },
  {
    id: "pea_soup", name: "Гороховый суп", slots: ["lunch"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 60, "peas_split"], ["s", 80, "potato"], ["v", 40, "carrot"], ["v", 30, "onion"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    ahead: "горох замочить в холодной воде на ночь",
    steps: [
      { t: "Горох залить свежей водой (≈400 мл на порцию) и варить 40 минут.", min: 45, k: "wait" },
      { t: "Картофель нарезать, лук и морковь обжарить. Добавить в суп, варить ещё 20 минут, посолить.", min: 25, k: "stove" },
    ],
    serve: "Разогреть до кипения, суп густеет — добавьте воды.",
  },
  {
    id: "fish_potato", name: "{0} с картофелем и морковью из духовки", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 160, [["pollock", "Минтай"], ["pink_salmon", "Горбуша"], ["mackerel", "Скумбрия"], ["cod", "Треска"], ["trout", "Форель"], ["salmon_atlantic", "Сёмга"]]],
      ["s", 200, "potato"], ["v", 70, "carrot"], ["v", 30, "onion"], ["v", 5, "dill"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    ahead: "рыбу переложить из морозилки в холодильник",
    steps: [
      { t: "Картофель и морковь нарезать дольками, лук кольцами, перемешать с маслом и солью.", min: 15, k: "prep" },
      { t: "Овощи запекать 20 минут при 200°, затем выложить сверху рыбу кусками, посолить и запекать ещё 20 минут.", min: 40, k: "oven" },
    ],
    serve: "Разогреть 2–3 минуты, посыпать укропом.",
  },
  {
    id: "fish_rice", name: "Тушёное филе {0} с морковью и рисом", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 140, [["pollock", "минтая"], ["cod", "трески"], ["pink_salmon", "горбуши"], ["chum_salmon", "кеты"]]], ["s", 70, "rice_white"],
      ["v", 70, "carrot"], ["v", 40, "onion"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    ahead: "рыбу переложить из морозилки в холодильник",
    steps: [
      { t: "Морковь натереть, лук нарезать, обжарить на масле 5 минут. Рыбу нарезать кусками, посолить.", min: 15, k: "prep" },
      { t: "Выложить рыбу на овощи, добавить полстакана воды, тушить под крышкой 15 минут.", min: 15, k: "stove" },
      { t: "Рис промыть, залить водой 1:2, варить под крышкой 18 минут.", min: 20, k: "stove" },
    ],
    serve: "Разогреть 2–3 минуты до горячего.",
  },
  {
    id: "fish_cutlets", name: "Рыбные котлеты с {0} и овощами", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 160, "pollock"], ["p", 15, "egg"], ["x", 10, "oats"], ["v", 25, "onion"], ["s", 60, [["buckwheat", "гречкой"], ["rice_white", "рисом"]]],
      ["v", 60, "carrot"], ["v", 80, "peas_green_frozen"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    ahead: "минтай переложить из морозилки в холодильник",
    steps: [
      { t: "Филе минтая измельчить блендером с луком, добавить яйцо, хлопья и соль, сформировать котлеты.", min: 20, k: "prep" },
      { t: "Котлеты запекать на противне с бумагой 25 минут при 190°.", min: 25, k: "oven" },
      { t: "Крупу сварить (вода 1:2, 15–18 минут). Морковь с горошком потушить на масле 10 минут.", min: 20, k: "stove" },
    ],
    serve: "Разогреть 2 минуты.",
  },
  {
    id: "meatballs", name: "Тефтели из {0} с {1}", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 130, [["turkey_ground", "индейки"], ["beef_ground", "говядины"]]], ["x", 15, "egg"], ["v", 30, "onion"], ["v", 70, "carrot"],
      ["s", 60, [["buckwheat", "гречкой"], ["pasta", "макаронами"], ["rice_white", "рисом"]]], ["x", 20, "sour_cream_15"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Фарш смешать с мелко нарезанным луком, яйцом и солью, скатать шарики размером с грецкий орех.", min: 15, k: "prep" },
      { t: "Морковь натереть, выложить в форму, сверху тефтели, залить сметаной с полстаканом воды, запекать 30 минут при 190°.", min: 30, k: "oven" },
      { t: "Гарнир сварить (вода 1:2, 12–18 минут).", min: 18, k: "stove" },
    ],
    serve: "Разогреть 2–3 минуты вместе с соусом.",
  },
  {
    id: "stew_potato", name: "{0}, тушённая с картофелем и морковью", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 130, [["beef_lean", "Говядина"], ["pork_shoulder", "Свинина"], ["chicken_thigh", "Курица"]]], ["s", 220, "potato"],
      ["v", 70, "carrot"], ["v", 40, "onion"], ["x", 8, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Мясо нарезать кубиком 3 см, лук и морковь — крупно, картофель — дольками.", min: 15, k: "prep" },
      { t: "Мясо обжарить 5–7 минут, добавить лук, морковь и воду до половины, тушить под крышкой: говядину 60 минут, свинину 45, курицу 25.", min: 60, k: "wait" },
      { t: "Добавить картофель, посолить, тушить ещё 25 минут.", min: 25, k: "stove" },
    ],
    serve: "Разогреть 3 минуты до горячего.",
  },
  {
    id: "plov", name: "Плов с {0}", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 120, [["chicken_thigh", "курицей"], ["pork_shoulder", "свининой"], ["beef_lean", "говядиной"]]], ["s", 70, "rice_white"],
      ["v", 90, "carrot"], ["v", 40, "onion"], ["v", 5, "garlic"], ["x", 10, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Мясо нарезать кубиком, морковь соломкой, лук полукольцами. Рис промыть до прозрачной воды.", min: 15, k: "prep" },
      { t: "В казане или толстостенной кастрюле обжарить мясо 7 минут, добавить лук и морковь, жарить ещё 7 минут.", min: 15, k: "stove" },
      { t: "Выложить рис ровным слоем, залить водой на 1,5 см выше, положить чеснок, посолить. Варить под крышкой на слабом огне 30 минут.", min: 30, k: "wait" },
    ],
    serve: "Разогреть 3 минуты, сбрызнув водой.",
  },
  {
    id: "pasta_mince", name: "Макароны с фаршем из {0} и овощами", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 110, [["turkey_ground", "индейки"], ["beef_ground", "говядины"]]], ["s", 70, "pasta"], ["v", 30, "onion"], ["v", 50, "carrot"], ["v", 60, "peas_green_frozen"],
      ["x", 10, "cheese_semihard"], ["x", 5, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Лук и морковь мелко нарезать и обжарить 5 минут, добавить фарш и горошек, жарить 12 минут, посолить.", min: 20, k: "stove" },
      { t: "Макароны отварить по инструкции на пачке, смешать с фаршем.", min: 12, k: "stove" },
    ],
    serve: "Разогреть 2–3 минуты, посыпать тёртым сыром.",
  },
  {
    id: "lazy_golubtsy", name: "Ленивые голубцы из {0}", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 110, [["turkey_ground", "индейки"], ["beef_ground", "говядины"], ["pork_ground", "свинины"]]], ["s", 30, "rice_white"],
      ["v", 150, "cabbage"], ["v", 40, "carrot"], ["v", 30, "onion"], ["x", 20, "sour_cream_15"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Капусту мелко нашинковать, лук и морковь натереть. Рис сварить до полуготовности 8 минут.", min: 20, k: "prep" },
      { t: "Смешать фарш, капусту, овощи, рис и соль, сформировать котлеты, выложить в форму, залить сметаной с водой.", min: 15, k: "prep" },
      { t: "Запекать под фольгой 40 минут при 190°.", min: 40, k: "oven" },
    ],
    serve: "Разогреть 3 минуты вместе с соусом.",
  },
  {
    id: "poultry_potato", name: "{0} с картофелем и морковью из духовки", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 150, [["chicken_thigh", "Куриные бёдра"], ["chicken_breast", "Куриное филе"], ["turkey_breast", "Филе индейки"]]], ["s", 220, "potato"],
      ["v", 80, "carrot"], ["v", 30, "onion"], ["x", 6, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Картофель и морковь нарезать дольками, лук кольцами, птицу кусками; всё перемешать с маслом и солью.", min: 15, k: "prep" },
      { t: "Запекать на противне 40 минут при 200°, один раз перемешать.", min: 40, k: "oven" },
    ],
    serve: "Разогреть 2–3 минуты.",
  },
  {
    id: "bean_stew", name: "Рагу из {0} с овощами", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 70, [["beans_red", "красной фасоли"], ["chickpeas", "нута"], ["beans_white", "белой фасоли"]]], ["s", 100, "potato"],
      ["v", 60, "carrot"], ["v", 40, "onion"], ["v", 80, "cabbage"], ["v", 4, "garlic"], ["x", 10, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    ahead: "фасоль или нут замочить в холодной воде на ночь",
    steps: [
      { t: "Фасоль (нут) залить свежей водой и варить 60 минут до мягкости.", min: 60, k: "wait" },
      { t: "Лук, морковь, капусту и картофель нарезать, обжарить на масле 10 минут.", min: 15, k: "prep" },
      { t: "Соединить с фасолью и половиной стакана отвара, добавить чеснок и соль, тушить 20 минут.", min: 20, k: "stove" },
    ],
    serve: "Разогреть 3 минуты.",
  },
  {
    id: "tofu_rice", name: "Тофу с рисом и {0}", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["p", 150, "tofu"], ["s", 65, "rice_white"], ["v", 150, [["broccoli", "брокколи"], ["green_beans", "стручковой фасолью"]]], ["v", 40, "carrot"],
      ["x", 10, "sunflower_oil"], ["x", 1, "salt_iodized"]],
    steps: [
      { t: "Тофу нарезать кубиком, морковь соломкой.", min: 10, k: "prep" },
      { t: "Рис промыть, залить водой 1:2, варить 18 минут.", min: 20, k: "stove" },
      { t: "Тофу обжарить до корочки 8 минут, добавить морковь и замороженные овощи, жарить ещё 8 минут, посолить.", min: 18, k: "stove" },
    ],
    serve: "Разогреть 2 минуты.",
  },
  {
    id: "buckwheat_mushrooms", name: "Гречка с грибами и луком", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["s", 70, "buckwheat"], ["v", 150, "mushrooms_white"], ["v", 50, "onion"], ["v", 40, "carrot"], ["x", 10, "sunflower_oil"], ["x", 1.5, "salt_iodized"]],
    steps: [
      { t: "Грибы нарезать пластинами, лук и морковь — мелко.", min: 10, k: "prep" },
      { t: "Гречку залить водой 1:2, варить 15 минут.", min: 18, k: "stove" },
      { t: "Лук и морковь обжарить 5 минут, добавить грибы и жарить 12 минут, посолить, смешать с гречкой.", min: 18, k: "stove" },
    ],
    serve: "Разогреть 2 минуты.",
  },

  {
    id: "veg_rice", name: "Рис с тушёными овощами", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["s", 80, "rice_white"], ["v", 120, "cabbage"], ["v", 60, "carrot"], ["v", 40, "onion"], ["v", 60, [["zucchini", ""], ["green_beans", ""], ["cauliflower", ""]]],
      ["x", 12, "sunflower_oil"], ["x", 1, "salt_iodized"]],
    steps: [
      { t: "Лук, морковь и капусту нарезать, обжарить на масле 5 минут, добавить остальные овощи и полстакана воды, тушить под крышкой 20 минут.", min: 25, k: "stove" },
      { t: "Рис промыть, залить водой 1:2, варить под крышкой 18 минут, смешать с овощами, посолить.", min: 20, k: "stove" },
    ],
    serve: "Разогреть 2–3 минуты до горячего.",
  },
  {
    id: "pasta_veg", name: "Макароны с тушёной капустой и морковью", slots: ["lunch", "dinner"], cook: "batch", fridge: 3, freeze: true,
    ing: [["s", 80, "pasta"], ["v", 150, "cabbage"], ["v", 60, "carrot"], ["v", 30, "onion"], ["x", 10, "butter"], ["x", 1, "salt_iodized"]],
    steps: [
      { t: "Капусту нашинковать, морковь натереть, лук нарезать; тушить с маслом и полстаканом воды под крышкой 25 минут.", min: 30, k: "stove" },
      { t: "Макароны отварить по инструкции на пачке и смешать с овощами.", min: 12, k: "stove" },
    ],
    serve: "Разогреть 2–3 минуты, сбрызнув водой.",
  },

  // ——— Перекусы: без готовки ———
  {
    id: "kefir_fruit", name: "Кефир и {0}", slots: ["snack"], cook: "quick", fridge: 0, freeze: false,
    ing: [["p", 250, "kefir"], ["v", 150, [["apple", "яблоко"], ["banana", "банан"], ["orange", "апельсин"], ["pear", "груша"], ["tangerine", "мандарины"]]]],
    steps: [], serve: "Без готовки.",
  },
  {
    id: "yogurt_nuts", name: "Йогурт с {0}", slots: ["snack"], cook: "quick", fridge: 0, freeze: false,
    ing: [["p", 180, "yogurt_plain"], ["x", 15, [["walnuts", "грецкими орехами"], ["almonds", "миндалём"], ["pumpkin_seeds", "тыквенными семечками"]]]],
    steps: [], serve: "Без готовки.",
  },
  {
    id: "cottage_fruit", name: "Творог с {0}", slots: ["snack"], cook: "quick", fridge: 0, freeze: false,
    ing: [["p", 150, "cottage_5"], ["v", 120, [["apple", "яблоком"], ["banana", "бананом"], ["pear", "грушей"]]]],
    steps: [], serve: "Без готовки, 2 минуты.",
  },
  {
    id: "sandwich_cheese", name: "Бутерброд с сыром и {0}", slots: ["snack"], cook: "quick", fridge: 0, freeze: false,
    ing: [["s", 50, "bread_rye"], ["p", 25, "cheese_semihard"], ["v", 70, [["cucumber", "огурцом"], ["tomato", "помидором"]]]],
    steps: [], serve: "Без готовки, 2 минуты.",
  },
  {
    id: "fruit_nuts", name: "{0} и горсть {1}", slots: ["snack"], cook: "quick", fridge: 0, freeze: false,
    ing: [["v", 160, [["apple", "Яблоко"], ["banana", "Банан"], ["orange", "Апельсин"]]], ["x", 20, [["walnuts", "грецких орехов"], ["almonds", "миндаля"], ["sunflower_seeds", "семечек"]]]],
    steps: [], serve: "Без готовки.",
  },
];

export interface Dish {
  /** recipe:вариант — стабильный ключ, по нему рацион хранится */
  id: string;
  recipe: string;
  name: string;
  slots: Slot[];
  cook: "batch" | "quick";
  fridge: number;
  freeze: boolean;
  ing: Array<{ comp: Comp; g: number; id: string }>;
  steps: Step[];
  serve: string;
  ahead?: string;
}

function expand(r: RecipeDef): Dish[] {
  const opts = r.ing.map((x) => (Array.isArray(x[2]) ? x[2] : null));
  let combos: Array<Opt[]> = [[]];
  for (const o of opts) if (o) combos = combos.flatMap((c) => o.map((v) => [...c, v]));
  return combos.map((choice) => {
    let i = 0;
    const ing = r.ing.map(([comp, g, id]) => ({ comp, g, id: Array.isArray(id) ? choice[i++][0] : id }));
    let name = r.name;
    choice.forEach(([, label], k) => { name = name.replace(`{${k}}`, label); });
    // «с свининой» → «со свининой»: «со» перед с, з, ш, ж и согласной
    name = name.replace(/\s+/g, " ").replace(/ с $/, "").trim().replace(/(^|\s)с ([сзшж][бвгджзйклмнпрстфхцчшщ])/gi, "$1со $2");
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      id: choice.length ? `${r.id}:${choice.map((c) => c[0]).join("+")}` : r.id,
      recipe: r.id, name, slots: r.slots, cook: r.cook, fridge: r.fridge, freeze: r.freeze, ing, steps: r.steps, serve: r.serve, ahead: r.ahead,
    };
  });
}

export const DISHES: Dish[] = RECIPES.flatMap(expand);
export const DISH_MAP = new Map(DISHES.map((d) => [d.id, d]));

/**
 * Добавки к блюдам — то, что едят как есть: фрукт, хлеб, кефир, свежие овощи, орехи. Каждый день одно и то же
 * количество в одном приёме пищи (`slot`), от `min` до `max` граммов в день.
 */
export const ADDONS: Record<string, { min: number; max: number; slot: Slot }> = {
  apple: { min: 100, max: 300, slot: "snack" },
  orange: { min: 100, max: 300, slot: "snack" },
  tangerine: { min: 80, max: 240, slot: "snack" },
  banana: { min: 100, max: 250, slot: "snack" },
  pear: { min: 100, max: 300, slot: "snack" },
  kiwi: { min: 70, max: 210, slot: "snack" },
  bread_rye: { min: 30, max: 150, slot: "lunch" },
  bread_wholewheat: { min: 30, max: 150, slot: "lunch" },
  bread_white: { min: 30, max: 150, slot: "lunch" },
  kefir: { min: 150, max: 400, slot: "dinner" },
  yogurt_plain: { min: 120, max: 300, slot: "snack" },
  cucumber: { min: 80, max: 250, slot: "dinner" },
  tomato: { min: 80, max: 250, slot: "dinner" },
  sauerkraut: { min: 50, max: 150, slot: "dinner" },
  kelp: { min: 30, max: 60, slot: "dinner" },
  carrot: { min: 60, max: 150, slot: "dinner" },
  walnuts: { min: 10, max: 30, slot: "breakfast" },
  pumpkin_seeds: { min: 10, max: 30, slot: "breakfast" },
  sunflower_seeds: { min: 10, max: 30, slot: "breakfast" },
};

/** Штучные продукты: в меню рядом с граммами — «≈2 шт.». */
export const UNITS: Record<string, [grams: number, unit: string]> = {
  egg: [55, "шт."], apple: [160, "шт."], orange: [180, "шт."], banana: [130, "шт."], pear: [170, "шт."], tangerine: [80, "шт."], kiwi: [75, "шт."],
  bread_rye: [30, "ломт."], bread_wholewheat: [30, "ломт."], bread_white: [30, "ломт."], zefir: [35, "шт."], cheesecake_curd: [45, "шт."], gingerbread: [35, "шт."], oat_cookies: [15, "шт."],
};
