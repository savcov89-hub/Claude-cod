# -*- coding: utf-8 -*-
"""
Каталог продуктов.

Каждая запись: русское название, источник состава (USDA SR Legacy fdc_id либо ручной ввод),
категория, теги непереносимостей/ограничений, цены по трём уровням корзины (руб/кг),
сезонность, роли в приёмах пищи и лимиты на неделю для «съедобности» рациона.

Цены: примерные розничные, октябрь 2026; в приложении так и подписаны («в вашем городе и магазине
могут отличаться»). Позиции с оценкой помечены est=True.
None в цене = продукт в этом уровне корзины не используется.
"""

# tags:
#  dairy, lactose, gluten, egg, fish, seafood, nuts, peanut, soy, pork, red_meat, poultry, meat (любое мясо),
#  added_sugar, high_gi, ultra_processed, pregnancy_avoid, raw_fish, offal, regional, fasting_ok (постный)
# roles: breakfast, lunch, dinner, snack
# season: all | summer (июнь–сентябрь дешевле/доступнее) | winter

P = []  # products

def add(id, name, fdc=None, cat=None, tags=(), econ=None, bus=None, prem=None, est=True,
        season="all", roles=("lunch", "dinner"), max_week=None, portion=None, quality=0.5,
        manual=None, iodine=None, note=None, grp=None, pack=None, min_week=None, buy_hint=None, overrides=None):
    """pack=(граммы, подпись) — единица покупки; min_week — минимальный недельный объём, если продукт выбран;
    buy_hint — совет, как покупать. Если не задано, подставляются значения по умолчанию из build_products.py."""
    P.append(dict(id=id, name=name, fdc_id=fdc, category=cat, tags=list(tags),
                  prices=dict(econom=econ, business=bus, premium=prem), price_estimated=est,
                  season=season, roles=list(roles), max_week_g=max_week, portion_g=portion,
                  quality=quality, manual=manual, iodine_ug_100g=iodine, note=note, group=grp,
                  pack=pack, min_week_g=min_week, buy_hint=buy_hint, overrides=overrides))

# ---------------- Крупы, хлеб, макароны ----------------
add("buckwheat", "Гречка (ядрица)", 170685, "grain", ("fasting_ok","regional"), 95, 120, 180, roles=("breakfast","lunch","dinner"), max_week=700, portion=70, quality=0.8, iodine=3.3, grp="cereal", pack=(800, "пачка 800 г"))
add("oats", "Овсяные хлопья (долгой варки)", 173904, "grain", ("gluten","fasting_ok"), 80, 110, 200, roles=("breakfast",), max_week=560, portion=60, quality=0.8, iodine=4.5, grp="cereal", pack=(500, "пачка 500 г"))
add("barley_pearl", "Перловка", 170284, "grain", ("gluten","fasting_ok"), 55, 75, 120, max_week=420, portion=70, quality=0.6, grp="cereal", pack=(800, "пачка 800 г"))
add("rice_white", "Рис белый", 169756, "grain", ("fasting_ok","high_gi"), 110, 140, 220, max_week=420, portion=70, quality=0.4, grp="cereal", pack=(800, "пачка 800 г"))
add("rice_brown", "Рис бурый", 169703, "grain", ("fasting_ok",), None, 190, 320, max_week=420, portion=70, quality=0.7, grp="cereal", pack=(500, "пачка 500 г"))
add("millet", "Пшено", 169702, "grain", ("fasting_ok",), 65, 85, 130, roles=("breakfast","lunch","dinner"), max_week=420, portion=70, quality=0.6, grp="cereal", pack=(800, "пачка 800 г"))
add("pasta", "Макароны из твёрдых сортов", 169736, "grain", ("gluten","fasting_ok"), 90, 140, 260, max_week=420, portion=80, quality=0.5, grp="cereal", pack=(450, "пачка 450 г"))
add("bulgur", "Булгур", 170688, "grain", ("gluten","fasting_ok"), None, 160, 260, max_week=350, portion=70, quality=0.7, grp="cereal", pack=(500, "пачка 500 г"))
add("quinoa", "Киноа", 168874, "grain", ("fasting_ok",), None, None, 650, max_week=350, portion=60, quality=0.8, grp="cereal", pack=(350, "пачка 350 г"))
add("oat_bran", "Отруби овсяные", 168872, "grain", ("gluten","fasting_ok"), 160, 200, 300, roles=("breakfast",), max_week=140, portion=20, quality=0.7, pack=(200, "пачка 200 г"))
add("wheat_bran", "Отруби пшеничные", 169722, "grain", ("gluten","fasting_ok"), 100, 140, 220, roles=("breakfast",), max_week=140, portion=15, quality=0.6, pack=(200, "пачка 200 г"))
add("bread_rye", "Хлеб ржано‑пшеничный («Бородинский»)", 172684, "bread", ("gluten","fasting_ok"), 90, 140, 320, roles=("breakfast","lunch","dinner","snack"), max_week=1050, portion=60, quality=0.6, grp="bread", pack=(350, "буханка 350 г"))
add("bread_wholewheat", "Хлеб цельнозерновой", 172688, "bread", ("gluten","fasting_ok"), 150, 220, 420, roles=("breakfast","lunch","dinner","snack"), max_week=1050, portion=60, quality=0.7, grp="bread", pack=(400, "буханка 400 г"))
add("bread_white", "Хлеб пшеничный (батон)", 174924, "bread", ("gluten","fasting_ok","high_gi"), 77, 110, 180, roles=("breakfast","lunch","dinner","snack"), max_week=500, portion=50, quality=0.3, grp="bread", pack=(350, "батон 350 г"))
add("crispbread_rye", "Хлебцы ржаные", 172744, "bread", ("gluten","fasting_ok"), 300, 400, 600, roles=("breakfast","snack"), max_week=210, portion=20, quality=0.6, grp="bread", pack=(100, "пачка 100 г"))

# ---------------- Бобовые, соя ----------------
add("lentils", "Чечевица", 172420, "legume", ("fasting_ok",), 180, 220, 330, max_week=420, portion=70, quality=0.8, grp="legume", pack=(450, "пачка 450 г"))
add("peas_split", "Горох колотый", 172428, "legume", ("fasting_ok",), 75, 95, 150, max_week=420, portion=70, quality=0.7, grp="legume", pack=(800, "пачка 800 г"))
add("beans_white", "Фасоль белая (сухая)", 175202, "legume", ("fasting_ok",), 200, 260, 380, max_week=350, portion=70, quality=0.7, grp="legume", pack=(450, "пачка 450 г"))
add("beans_red", "Фасоль красная (сухая)", 175193, "legume", ("fasting_ok",), 200, 260, 380, max_week=350, portion=70, quality=0.7, grp="legume", pack=(450, "пачка 450 г"))
add("chickpeas", "Нут", 173756, "legume", ("fasting_ok",), 190, 240, 350, max_week=350, portion=70, quality=0.7, grp="legume", pack=(450, "пачка 450 г"))
add("peas_green_frozen", "Горошек зелёный замороженный", 170016, "vegetable", ("fasting_ok",), 190, 240, 350, max_week=500, portion=100, quality=0.6, grp="veg", pack=(400, "пакет 400 г"))
add("tofu", "Тофу", 172475, "legume", ("soy","fasting_ok"), None, 520, 700, max_week=600, portion=120, quality=0.7, grp="protein_plant", pack=(300, "брикет 300 г"))

# ---------------- Овощи ----------------
add("potato", "Картофель", 170026, "vegetable", ("fasting_ok","high_gi"), 45, 60, 110, est=False, roles=("lunch","dinner"), max_week=1750, portion=200, quality=0.5, iodine=5, grp="veg_starch")
add("cabbage", "Капуста белокочанная", 169975, "vegetable", ("fasting_ok",), 30, 45, 90, est=False, max_week=1000, portion=150, quality=0.7, grp="veg")
add("sauerkraut", "Капуста квашеная", 169279, "vegetable", ("fasting_ok","regional"), 180, 240, 350, max_week=700, portion=100, quality=0.7, grp="veg", pack=(500, "банка/вес 500 г"))
add("carrot", "Морковь", 170393, "vegetable", ("fasting_ok",), 30, 50, 90, est=False, roles=("lunch","dinner","snack"), max_week=1050, portion=100, quality=0.7, grp="veg")
add("beet", "Свёкла", 169145, "vegetable", ("fasting_ok",), 38, 55, 95, est=False, max_week=1050, portion=120, quality=0.7, grp="veg")
add("onion", "Лук репчатый", 170000, "vegetable", ("fasting_ok",), 35, 50, 90, est=False, max_week=450, portion=50, quality=0.5, grp="veg")
add("garlic", "Чеснок", 169230, "vegetable", ("fasting_ok",), 300, 400, 600, max_week=70, portion=8, quality=0.6, grp="veg", pack=(50, "головка ≈50 г"))
add("tomato", "Томаты", 170457, "vegetable", ("fasting_ok",), 210, 300, 450, est=False, season="summer", roles=("breakfast","lunch","dinner"), max_week=1050, portion=120, quality=0.7, grp="veg")
add("cucumber", "Огурцы", 168409, "vegetable", ("fasting_ok",), 190, 260, 400, season="summer", roles=("breakfast","lunch","dinner"), max_week=1050, portion=120, quality=0.6, grp="veg")
add("pepper_red", "Перец сладкий", 170108, "vegetable", ("fasting_ok",), 260, 330, 480, season="summer", max_week=700, portion=100, quality=0.8, grp="veg")
add("pumpkin", "Тыква", 168448, "vegetable", ("fasting_ok","regional"), 60, 90, 160, roles=("breakfast","lunch","dinner"), max_week=1050, portion=150, quality=0.7, grp="veg")
add("zucchini", "Кабачок", 169291, "vegetable", ("fasting_ok",), 130, 180, 300, season="summer", max_week=1050, portion=150, quality=0.6, grp="veg")
add("broccoli", "Брокколи (замороженная)", 169968, "vegetable", ("fasting_ok",), 320, 400, 600, max_week=700, portion=150, quality=0.9, grp="veg", pack=(400, "пакет 400 г"))
add("cauliflower", "Цветная капуста", 169986, "vegetable", ("fasting_ok",), 250, 320, 500, max_week=700, portion=150, quality=0.8, grp="veg", pack=(400, "кочан/пакет 400 г"))
add("spinach", "Шпинат (замороженный)", 168462, "vegetable", ("fasting_ok",), None, 350, 550, max_week=500, portion=100, quality=0.9, grp="veg", pack=(400, "пакет 400 г"))
add("lettuce", "Салат листовой", 169249, "vegetable", ("fasting_ok",), None, 500, 800, roles=("lunch","dinner"), max_week=350, portion=50, quality=0.7, grp="veg", pack=(100, "пучок/горшок 100 г"))
add("dill", "Укроп", 172233, "vegetable", ("fasting_ok","regional"), 500, 700, 1000, max_week=140, portion=10, quality=0.6, grp="veg", pack=(30, "пучок 30 г"))
add("parsley", "Петрушка", 170416, "vegetable", ("fasting_ok",), 500, 700, 1000, max_week=140, portion=10, quality=0.6, grp="veg", pack=(30, "пучок 30 г"))
add("mushrooms_white", "Шампиньоны", 169251, "vegetable", ("fasting_ok",), 280, 350, 500, max_week=500, portion=120, quality=0.6, grp="veg", pack=(250, "упаковка 250 г"))
add("chanterelle", "Лисички (свежие/замороженные)", 168422, "vegetable", ("fasting_ok","regional"), None, 600, 900, season="summer", max_week=400, portion=120, quality=0.7, grp="veg", pack=(300, "пакет 300 г"))
add("fern", "Папоротник (орляк, солёный/свежий)", 169405, "vegetable", ("fasting_ok","regional"), None, 450, 700, max_week=300, portion=100, quality=0.6, grp="veg", pack=(300, "упаковка 300 г"))
add("radish", "Редис", 169276, "vegetable", ("fasting_ok",), 160, 220, 350, season="summer", max_week=350, portion=60, quality=0.5, grp="veg")
add("celery", "Сельдерей (стебель)", 169988, "vegetable", ("fasting_ok",), None, 300, 450, max_week=350, portion=60, quality=0.6, grp="veg")
add("leek", "Лук‑порей", 169246, "vegetable", ("fasting_ok",), None, 350, 500, max_week=300, portion=60, quality=0.6, grp="veg")
add("turnip", "Репа", 170465, "vegetable", ("fasting_ok","regional"), 90, 130, 220, max_week=500, portion=120, quality=0.5, grp="veg")
add("eggplant", "Баклажан", 169228, "vegetable", ("fasting_ok",), 200, 280, 420, season="summer", max_week=500, portion=150, quality=0.6, grp="veg")
add("green_beans", "Стручковая фасоль (замороженная)", 169961, "vegetable", ("fasting_ok",), 250, 320, 480, max_week=600, portion=150, quality=0.7, grp="veg", pack=(400, "пакет 400 г"))
add("kelp", "Морская капуста (ламинария)", 168457, "vegetable", ("fasting_ok","seafood"), 250, 350, 600, max_week=300, portion=50, quality=0.7, iodine=300, grp="veg", pack=(250, "банка 250 г"))
add("corn_sweet", "Кукуруза сладкая", 169998, "vegetable", ("fasting_ok",), 180, 240, 350, season="summer", max_week=400, portion=100, quality=0.5, grp="veg")
add("jerusalem_artichoke", "Топинамбур", 169236, "vegetable", ("fasting_ok","regional"), None, None, 350, max_week=400, portion=100, quality=0.6, grp="veg")

# ---------------- Фрукты, ягоды, сухофрукты ----------------
add("apple", "Яблоки", 171688, "fruit", ("fasting_ok",), 110, 170, 260, est=False, roles=("breakfast","snack"), max_week=1750, portion=180, quality=0.7, grp="fruit")
add("pear", "Груши", 169118, "fruit", ("fasting_ok",), 180, 240, 380, roles=("breakfast","snack"), max_week=1050, portion=170, quality=0.6, grp="fruit")
add("banana", "Бананы", 173944, "fruit", ("fasting_ok","high_gi"), 140, 170, 260, roles=("breakfast","snack"), max_week=1050, portion=120, quality=0.5, grp="fruit")
add("orange", "Апельсины", 169097, "fruit", ("fasting_ok",), 170, 220, 350, roles=("breakfast","snack"), max_week=1050, portion=180, quality=0.7, grp="fruit")
add("tangerine", "Мандарины", 169105, "fruit", ("fasting_ok",), 190, 250, 380, season="winter", roles=("breakfast","snack"), max_week=1050, portion=150, quality=0.6, grp="fruit")
add("lemon", "Лимон", 167746, "fruit", ("fasting_ok",), 200, 260, 380, roles=("lunch","dinner"), max_week=200, portion=20, quality=0.5, pack=(100, "1 шт ≈100 г"))
add("grapes", "Виноград", 174683, "fruit", ("fasting_ok","high_gi"), None, 350, 550, season="summer", roles=("snack",), max_week=700, portion=120, quality=0.5, grp="fruit")
add("kiwi", "Киви", 168153, "fruit", ("fasting_ok",), None, 300, 450, roles=("breakfast","snack"), max_week=700, portion=120, quality=0.7, grp="fruit")
add("strawberry", "Клубника", 167762, "fruit", ("fasting_ok","summer_only"), None, 450, 900, season="summer", roles=("breakfast","snack"), max_week=700, portion=120, quality=0.7, grp="berry")
add("blueberry", "Черника/голубика (замороженная)", 173949, "fruit", ("fasting_ok","regional"), None, 650, 1100, roles=("breakfast","snack"), max_week=700, portion=80, quality=0.9, grp="berry", pack=(300, "пакет 300 г"))
add("cranberry", "Клюква (замороженная)", 171722, "fruit", ("fasting_ok","regional"), 450, 550, 800, roles=("breakfast","snack"), max_week=500, portion=60, quality=0.8, grp="berry", pack=(300, "пакет 300 г"))
add("lingonberry", "Брусника (замороженная)", 171722, "fruit", ("fasting_ok","regional"), 450, 550, 850, roles=("breakfast","snack"), max_week=500, portion=60, quality=0.8, grp="berry", note="Состав: USDA «Cranberries, raw» как ближайший аналог", pack=(300, "пакет 300 г"))
add("raspberry", "Малина (замороженная)", 167755, "fruit", ("fasting_ok","regional"), None, 600, 1000, roles=("breakfast","snack"), max_week=500, portion=80, quality=0.8, grp="berry", pack=(300, "пакет 300 г"))
add("blackcurrant", "Смородина чёрная (замороженная)", 173963, "fruit", ("fasting_ok","regional"), 350, 450, 700, roles=("breakfast","snack"), max_week=500, portion=80, quality=0.9, grp="berry", pack=(300, "пакет 300 г"))
add("cherry", "Вишня/черешня", 171719, "fruit", ("fasting_ok","summer_only"), None, 450, 800, season="summer", roles=("snack",), max_week=500, portion=120, quality=0.6, grp="fruit")
add("apricot", "Абрикосы", 171697, "fruit", ("fasting_ok","summer_only"), None, 300, 500, season="summer", roles=("snack",), max_week=700, portion=150, quality=0.7, grp="fruit")
add("plum", "Слива", 169949, "fruit", ("fasting_ok","summer_only"), 160, 220, 350, season="summer", roles=("snack",), max_week=700, portion=150, quality=0.6, grp="fruit")
add("watermelon", "Арбуз", 167765, "fruit", ("fasting_ok","high_gi","summer_only"), 45, 60, 100, season="summer", roles=("snack",), max_week=1400, portion=300, quality=0.4, grp="fruit")
add("prunes", "Чернослив", 168162, "fruit", ("fasting_ok",), 500, 650, 950, roles=("breakfast","snack"), max_week=210, portion=30, quality=0.6, grp="dried_fruit", pack=(200, "пачка 200 г"))
add("raisins", "Изюм", 168165, "fruit", ("fasting_ok","high_gi"), 350, 450, 700, roles=("breakfast","snack"), max_week=140, portion=25, quality=0.4, grp="dried_fruit", pack=(200, "пачка 200 г"))
add("dried_apricots", "Курага", 173941, "fruit", ("fasting_ok",), 600, 750, 1100, roles=("breakfast","snack"), max_week=210, portion=30, quality=0.6, grp="dried_fruit", pack=(200, "пачка 200 г"))
add("dates", "Финики", 171726, "fruit", ("fasting_ok","high_gi"), None, 500, 800, roles=("snack",), max_week=140, portion=30, quality=0.4, grp="dried_fruit", pack=(200, "пачка 200 г"))
add("seabuckthorn", "Облепиха (замороженная)", None, "fruit", ("fasting_ok","regional"), 350, 450, 700, roles=("breakfast","snack"), max_week=350, portion=50, quality=0.9, grp="berry",
    manual=dict(source="Скурихин И.М., Тутельян В.А. Химический состав российских пищевых продуктов, 2002 (ручной ввод, частичный набор нутриентов)",
                kcal=82, protein=1.2, fat=5.4, carbs=5.7, fiber=2.0, vit_c=200, vit_e=5.0, vit_a=250, vit_k=0, potassium=193, calcium=22, magnesium=30, iron=1.4, phosphorus=9, sugars=5.7, folate=9, vit_b1=0.03, vit_b2=0.05, vit_b6=0.11, niacin=0.4), pack=(300, "пакет 300 г"))

# ---------------- Орехи, семена ----------------
add("pine_nuts", "Кедровые орехи (очищенные)", 170591, "nut", ("nuts","fasting_ok","regional"), None, 2800, 3500, roles=("breakfast","snack"), max_week=140, portion=20, quality=0.9, grp="nuts", pack=(100, "пачка 100 г"))
add("walnuts", "Грецкие орехи", 170187, "nut", ("nuts","fasting_ok"), 900, 1100, 1500, roles=("breakfast","snack"), max_week=210, portion=30, quality=0.9, grp="nuts", pack=(200, "пачка 200 г"))
add("almonds", "Миндаль", 170567, "nut", ("nuts","fasting_ok"), None, 1300, 1700, roles=("breakfast","snack"), max_week=210, portion=30, quality=0.9, grp="nuts", pack=(150, "пачка 150 г"))
add("hazelnuts", "Фундук", 170581, "nut", ("nuts","fasting_ok"), None, 1200, 1600, roles=("snack",), max_week=140, portion=30, quality=0.8, grp="nuts", pack=(150, "пачка 150 г"))
add("cashew", "Кешью", 170162, "nut", ("nuts","fasting_ok"), None, None, 1600, roles=("snack",), max_week=140, portion=30, quality=0.7, grp="nuts", pack=(150, "пачка 150 г"))
add("peanuts", "Арахис (сырой/жареный без соли)", 172430, "nut", ("peanut","fasting_ok"), 350, 450, 650, roles=("snack",), max_week=140, portion=30, quality=0.5, grp="nuts", pack=(200, "пачка 200 г"))
add("sunflower_seeds", "Семечки подсолнечника (очищенные)", 170562, "nut", ("fasting_ok","regional"), 220, 300, 450, roles=("breakfast","snack"), max_week=140, portion=20, quality=0.6, grp="nuts", pack=(150, "пачка 150 г"))
add("flaxseed", "Семена льна", 169414, "nut", ("fasting_ok","regional"), 180, 250, 400, roles=("breakfast",), max_week=140, portion=15, quality=0.8, grp="nuts", pack=(200, "пачка 200 г"))
add("pumpkin_seeds", "Семена тыквы", 170556, "nut", ("fasting_ok",), None, 750, 1100, roles=("breakfast","snack"), max_week=140, portion=20, quality=0.8, grp="nuts", pack=(150, "пачка 150 г"))
add("chia", "Семена чиа", 170554, "nut", ("fasting_ok",), None, None, 1200, roles=("breakfast",), max_week=105, portion=15, quality=0.7, grp="nuts", pack=(150, "пачка 150 г"))
add("sesame", "Кунжут", 170150, "nut", ("fasting_ok",), 400, 500, 750, roles=("breakfast","lunch","dinner"), max_week=70, portion=10, quality=0.7, grp="nuts", pack=(100, "пачка 100 г"))

# ---------------- Молочные продукты, яйца ----------------
add("milk_25", "Молоко 2,5%", 172205, "dairy", ("dairy","lactose"), 70, 110, 160, est=False, roles=("breakfast","snack"), max_week=2100, portion=200, quality=0.6, iodine=9, grp="dairy", pack=(900, "пакет 0,9 л"))
add("milk_32", "Молоко 3,2%", 172217, "dairy", ("dairy","lactose"), 80, 120, 180, roles=("breakfast","snack"), max_week=2100, portion=200, quality=0.5, iodine=9, grp="dairy", pack=(900, "пакет 0,9 л"))
add("kefir", "Кефир 1–2,5%", 170904, "dairy", ("dairy","lactose"), 95, 130, 190, roles=("breakfast","snack","dinner"), max_week=2100, portion=250, quality=0.7, iodine=9, grp="dairy", pack=(900, "бутылка 0,9 л"))
add("yogurt_plain", "Йогурт натуральный без сахара", 170886, "dairy", ("dairy","lactose"), 250, 350, 550, roles=("breakfast","snack"), max_week=1400, portion=150, quality=0.7, grp="dairy", pack=(300, "стакан 300 г"))
add("yogurt_greek", "Йогурт греческий 2–4%", 170903, "dairy", ("dairy","lactose"), None, 500, 800, roles=("breakfast","snack"), max_week=1050, portion=150, quality=0.8, grp="dairy", pack=(250, "стакан 250 г"))
add("cottage_5", "Творог 5%", 172182, "dairy", ("dairy","lactose"), 500, 650, 950, est=False, roles=("breakfast","snack","dinner"), max_week=1400, portion=150, quality=0.8, grp="dairy", pack=(200, "пачка 200 г"))
add("cottage_9", "Творог 9%", 172179, "dairy", ("dairy","lactose"), 520, 680, 1000, roles=("breakfast","snack","dinner"), max_week=1050, portion=150, quality=0.6, grp="dairy", pack=(200, "пачка 200 г"))
add("sour_cream_15", "Сметана 15%", 171256, "dairy", ("dairy","lactose"), 300, 380, 550, est=False, roles=("lunch","dinner"), max_week=350, portion=25, quality=0.5, grp="dairy_fat", pack=(300, "стакан 300 г"))
add("sour_cream_20", "Сметана 20%", 171257, "dairy", ("dairy","lactose"), 320, 400, 600, roles=("lunch","dinner"), max_week=280, portion=25, quality=0.4, grp="dairy_fat", pack=(300, "стакан 300 г"))
add("cheese_semihard", "Сыр полутвёрдый (Российский/Гауда)", 171241, "dairy", ("dairy",), 650, 900, 1400, est=False, roles=("breakfast","snack"), max_week=350, portion=30, quality=0.6, iodine=11, grp="cheese", pack=(200, "кусок ≈200 г"))
add("cheese_brynza", "Брынза", 173420, "dairy", ("dairy","pregnancy_avoid"), None, 700, 1100, roles=("breakfast","lunch","dinner"), max_week=280, portion=40, quality=0.5, grp="cheese", pack=(200, "упаковка 200 г"))
add("mozzarella", "Моцарелла", 170845, "dairy", ("dairy",), None, 900, 1400, roles=("lunch","dinner"), max_week=280, portion=50, quality=0.6, grp="cheese", pack=(125, "шарик 125 г"))
add("ricotta", "Рикотта", 171248, "dairy", ("dairy","lactose"), None, None, 900, roles=("breakfast","snack"), max_week=350, portion=80, quality=0.7, grp="cheese", pack=(250, "упаковка 250 г"))
add("brie", "Бри/камамбер", 172177, "dairy", ("dairy","pregnancy_avoid"), None, None, 1800, roles=("snack",), max_week=140, portion=30, quality=0.5, grp="cheese", pack=(125, "головка 125 г"))
add("butter", "Масло сливочное 82,5%", 173430, "fat", ("dairy",), 780, 1000, 1400, est=False, roles=("breakfast","lunch","dinner"), max_week=140, portion=10, quality=0.4, grp="fat", pack=(180, "пачка 180 г"))
add("egg", "Яйца куриные", 171287, "egg", ("egg",), 160, 200, 300, est=False, roles=("breakfast","lunch","dinner","snack"), max_week=600, portion=110, quality=0.8, iodine=20, grp="egg", note="Цена пересчитана: десяток ≈ 600 г", pack=(600, "десяток"))
add("egg_quail", "Яйца перепелиные", 172191, "egg", ("egg",), None, None, 900, roles=("breakfast","snack"), max_week=200, portion=50, quality=0.6, grp="egg", pack=(200, "упаковка 20 шт"))

# ---------------- Мясо, птица, субпродукты ----------------
add("chicken_whole", "Курица (тушка)", 171447, "poultry", ("poultry","meat"), 235, 290, 420, est=False, max_week=1050, portion=180, quality=0.5, iodine=6, grp="protein_animal", pack=(1500, "тушка ≈1,5 кг"), min_week=600, buy_hint="Разделить на 3–4 части и заморозить")
add("chicken_breast", "Куриное филе (грудка)", "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw", "poultry", ("poultry","meat"), 380, 450, 650, max_week=1050, portion=150, quality=0.8, iodine=6, grp="protein_animal", pack=(600, "упаковка ≈600 г"), min_week=400)
add("chicken_thigh", "Куриные бёдра", 172385, "poultry", ("poultry","meat"), 220, 280, 400, est=False, max_week=700, portion=170, quality=0.5, grp="protein_animal", pack=(800, "упаковка ≈800 г"), min_week=400)
add("chicken_liver", "Печень куриная", 171060, "offal", ("poultry","meat","offal"), 250, 320, 450, max_week=150, portion=120, quality=0.6, grp="protein_animal", pack=(500, "упаковка 500 г"), buy_hint="Порционно заморозить")
add("chicken_heart", "Сердечки куриные", 171458, "offal", ("poultry","meat","offal"), 300, 380, 500, max_week=200, portion=120, quality=0.5, grp="protein_animal", pack=(500, "упаковка 500 г"))
add("turkey_breast", "Филе индейки", 174515, "poultry", ("poultry","meat"), None, 650, 850, max_week=1050, portion=150, quality=0.9, grp="protein_animal", pack=(600, "упаковка ≈600 г"), min_week=400)
add("turkey_ground", "Фарш из индейки", 172850, "poultry", ("poultry","meat"), None, 520, 700, max_week=700, portion=150, quality=0.7, grp="protein_animal", pack=(500, "упаковка 500 г"), min_week=400)
add("beef_bone_in", "Говядина на кости (лопатка/грудинка)", 168668, "meat", ("red_meat","meat"), 650, 800, 1100, est=False, max_week=700, portion=150, quality=0.5, iodine=7, grp="protein_animal", pack=(1000, "на развес, ≈1 кг"), min_week=500, buy_hint="Кусок 1–1,5 кг, заморозить порциями")
add("beef_lean", "Говядина бескостная (тазобедренная часть)", 171762, "meat", ("red_meat","meat"), None, 1000, 1400, max_week=700, portion=150, quality=0.8, iodine=7, grp="protein_animal", pack=(500, "на развес, по 500 г"), min_week=400)
add("beef_ground", "Фарш говяжий", 171796, "meat", ("red_meat","meat"), 550, 700, 950, max_week=700, portion=150, quality=0.5, grp="protein_animal", pack=(500, "упаковка 500 г"), min_week=400)
add("beef_liver", "Печень говяжья", 169451, "offal", ("red_meat","meat","offal"), 350, 450, 600, max_week=150, portion=120, quality=0.6, grp="protein_animal", pack=(500, "кусок ≈500 г"), buy_hint="Порционно заморозить")
add("beef_heart", "Сердце говяжье", 168625, "offal", ("red_meat","meat","offal"), 300, 380, 500, max_week=250, portion=150, quality=0.6, grp="protein_animal", pack=(500, "на развес ≈500 г"))
add("beef_tongue", "Язык говяжий", 170196, "offal", ("red_meat","meat","offal"), None, None, 1400, max_week=250, portion=100, quality=0.5, grp="protein_animal", pack=(1000, "1 шт ≈1 кг"))
add("pork_shoulder", "Свинина (лопатка/шея)", 167849, "meat", ("pork","red_meat","meat"), 420, 520, 750, max_week=700, portion=150, quality=0.4, iodine=7, grp="protein_animal", pack=(1000, "кусок ≈1 кг"), min_week=500)
add("pork_loin", "Свинина корейка", 167818, "meat", ("pork","red_meat","meat"), 480, 580, 800, max_week=700, portion=150, quality=0.5, grp="protein_animal", pack=(800, "кусок ≈800 г"), min_week=400)
add("pork_tenderloin", "Свиная вырезка", 168249, "meat", ("pork","red_meat","meat"), None, 750, 1000, max_week=700, portion=150, quality=0.7, grp="protein_animal", pack=(500, "1 шт ≈500 г"), min_week=400)
add("pork_ground", "Фарш свиной", 167902, "meat", ("pork","red_meat","meat"), 400, 500, 700, max_week=500, portion=150, quality=0.3, grp="protein_animal", pack=(500, "упаковка 500 г"), min_week=400)
add("lamb", "Баранина", 172479, "meat", ("red_meat","meat"), None, 850, 1200, max_week=500, portion=150, quality=0.5, grp="protein_animal", pack=(1000, "кусок ≈1 кг"), min_week=500)

# ---------------- Рыба и морепродукты ----------------
add("pollock", "Минтай (замороженный)", 173725, "fish", ("fish",), 260, 320, 450, max_week=1050, portion=180, quality=0.7, iodine=150, grp="fish", pack=(900, "2 тушки ≈900 г"), min_week=450, buy_hint="Тушки без головы, остаток в морозилку")
add("cod", "Треска", 171955, "fish", ("fish",), None, 650, 900, max_week=1050, portion=170, quality=0.8, iodine=135, grp="fish", pack=(800, "филе/стейки ≈800 г"), min_week=400)
add("herring", "Сельдь свежемороженая", 175116, "fish", ("fish",), 280, 350, 500, max_week=700, portion=150, quality=0.8, iodine=40, grp="fish", pack=(350, "1 рыба ≈350 г"), min_week=350)
add("herring_pickled", "Сельдь солёная", 175118, "fish", ("fish","pregnancy_avoid"), 350, 450, 650, roles=("lunch","dinner","snack"), max_week=350, portion=60, quality=0.5, iodine=40, grp="fish", pack=(300, "филе 300 г"))
add("pink_salmon", "Горбуша", 175138, "fish", ("fish","regional"), 420, 520, 750, max_week=1050, portion=170, quality=0.8, iodine=50, grp="fish", pack=(1200, "тушка ≈1,2 кг или стейки"), min_week=400, buy_hint="Стейками по 150–200 г, остаток заморозить")
add("chum_salmon", "Кета", 173689, "fish", ("fish","regional"), None, 750, 1000, max_week=1050, portion=170, quality=0.8, iodine=50, grp="fish", pack=(1000, "стейки ≈1 кг"), min_week=400)
add("salmon_atlantic", "Сёмга (аквакультура)", 175167, "fish", ("fish",), None, None, 2400, max_week=700, portion=160, quality=0.9, iodine=50, grp="fish", pack=(400, "стейки 2×200 г"), min_week=300)
add("trout", "Форель (аквакультура)", 173717, "fish", ("fish",), None, 1500, 2000, max_week=700, portion=160, quality=0.9, iodine=40, grp="fish", pack=(500, "1 рыба ≈500 г"), min_week=300)
add("mackerel", "Скумбрия", 175119, "fish", ("fish",), 340, 420, 600, max_week=700, portion=150, quality=0.8, iodine=45, grp="fish", pack=(400, "1 рыба ≈400 г"), min_week=350)
add("sardines_canned", "Сардины консервированные в масле", 175139, "fish", ("fish","ultra_processed"), 550, 700, 950, roles=("lunch","dinner","snack"), max_week=350, portion=90, quality=0.6, iodine=35, grp="fish", pack=(240, "банка 240 г"))
add("tuna_canned", "Тунец консервированный в собственном соку", 173709, "fish", ("fish",), None, 900, 1300, roles=("lunch","dinner","snack"), max_week=350, portion=90, quality=0.6, iodine=50, grp="fish", pack=(170, "банка 170 г"))
add("pike", "Щука", 173680, "fish", ("fish","regional"), 320, 400, 600, season="summer", max_week=700, portion=170, quality=0.7, iodine=50, grp="fish", pack=(1000, "1 рыба ≈1 кг"), min_week=500, buy_hint="Целиком, разделать и заморозить")
add("whitefish", "Пелядь / муксун", 173711, "fish", ("fish","regional"), None, 650, 1100, max_week=700, portion=170, quality=0.8, iodine=50, grp="fish", pack=(500, "1 рыба ≈500 г"), min_week=400)
add("carp", "Карп / сазан", 171952, "fish", ("fish","regional"), 260, 330, 480, season="summer", max_week=700, portion=180, quality=0.6, iodine=5, grp="fish", pack=(1200, "1 рыба ≈1,2 кг"), min_week=500, buy_hint="Целиком или стейками, остаток заморозить")
add("perch", "Окунь речной", 173678, "fish", ("fish","regional"), 280, 350, 500, max_week=700, portion=170, quality=0.6, iodine=60, grp="fish", pack=(500, "2–3 рыбы ≈500 г"), min_week=350)
add("walleye", "Судак", 175128, "fish", ("fish","regional"), None, 650, 950, max_week=700, portion=170, quality=0.8, iodine=50, grp="fish", pack=(800, "1 рыба ≈800 г"), min_week=400)
add("squid", "Кальмар (замороженный)", 174223, "seafood", ("seafood","fish"), 550, 700, 950, max_week=500, portion=150, quality=0.7, iodine=300, grp="fish", pack=(500, "упаковка 500 г"))
add("shrimp", "Креветки", 174210, "seafood", ("seafood","fish"), None, 1200, 1700, max_week=500, portion=120, quality=0.7, iodine=110, grp="fish", pack=(500, "пакет 500 г"))
add("red_caviar", "Икра лососёвая", 174188, "seafood", ("fish","pregnancy_avoid"), None, None, 6500, roles=("breakfast","snack"), max_week=70, portion=15, quality=0.6, grp="fish", pack=(100, "банка 100 г"))

# ---------------- Масла, сладкое, прочее ----------------
add("sunflower_oil", "Масло подсолнечное", 171025, "fat", ("fasting_ok","regional"), 160, 220, 350, roles=("lunch","dinner"), max_week=210, portion=10, quality=0.4, grp="fat", pack=(920, "бутылка 1 л"))
add("olive_oil", "Масло оливковое Extra Virgin", 171413, "fat", ("fasting_ok",), None, 1200, 1800, roles=("lunch","dinner"), max_week=210, portion=10, quality=0.9, grp="fat", pack=(500, "бутылка 0,5 л"))
add("flax_oil", "Масло льняное", 167702, "fat", ("fasting_ok","regional"), 500, 650, 900, roles=("breakfast","lunch","dinner"), max_week=105, portion=7, quality=0.7, grp="fat", pack=(250, "бутылка 250 мл"))
add("avocado", "Авокадо", 171705, "fruit", ("fasting_ok",), None, 550, 800, roles=("breakfast","lunch","dinner"), max_week=700, portion=80, quality=0.8, grp="fat", pack=(160, "1 шт ≈160 г"))
add("honey", "Мёд", 169640, "sweet", ("added_sugar","fasting_ok","high_gi","regional","treat"), 600, 800, 1200, roles=("breakfast","snack"), max_week=105, portion=15, quality=0.5, grp="sweet", pack=(250, "банка 250 г"))
add("sugar", "Сахар", 169655, "sweet", ("added_sugar","fasting_ok","high_gi"), 78, 90, 120, est=False, roles=("breakfast","snack"), max_week=140, portion=10, quality=0.1, grp="sweet", pack=(1000, "пачка 1 кг"))
add("dark_chocolate", "Шоколад горький 70–85%", 170273, "sweet", ("added_sugar","treat","diabetes_ok_treat"), None, 1600, 2500, roles=("snack",), max_week=140, portion=20, quality=0.5, grp="sweet", pack=(90, "плитка 90 г"))
add("cocoa", "Какао‑порошок", 169593, "other", ("fasting_ok",), 900, 1100, 1600, roles=("breakfast","snack"), max_week=70, portion=8, quality=0.6, pack=(100, "пачка 100 г"))
add("jam", "Варенье / джем", 169641, "sweet", ("added_sugar","fasting_ok","high_gi","treat"), 350, 450, 700, roles=("breakfast","snack"), max_week=140, portion=20, quality=0.2, grp="sweet", pack=(300, "банка 300 г"))
add("salt_iodized", "Соль йодированная", 173468, "other", ("fasting_ok",), 35, 45, 90, roles=("lunch","dinner"), max_week=35, portion=3, quality=0.5, iodine=4000, note="ГОСТ: 40±15 мг йода на кг соли", pack=(1000, "пачка 1 кг"))

# ---------------- Вкусняшки (десерты): бюджет ≈100–200 ккал/сут по выбору ----------------
add("zefir", "Зефир", 167995, "sweet", ("added_sugar","high_gi","treat","fasting_ok"), 350, 450, 700, roles=("snack","lunch"), max_week=300, portion=35, quality=0.3, grp="sweet", pack=(250, "упаковка 250 г"), min_week=70,
    note="Состав: USDA «marshmallows» как ближайший аналог")
add("pastila", "Пастила / фруктовые пластинки", 167540, "sweet", ("added_sugar","high_gi","treat","fasting_ok"), 500, 650, 1000, roles=("snack","lunch"), max_week=250, portion=30, quality=0.4, grp="sweet", pack=(200, "упаковка 200 г"), min_week=60)
add("marmalade", "Мармелад желейный", 167989, "sweet", ("added_sugar","high_gi","treat","fasting_ok"), 350, 450, 700, roles=("snack","lunch"), max_week=250, portion=30, quality=0.2, grp="sweet", pack=(250, "упаковка 250 г"), min_week=60)
add("halva", "Халва подсолнечная", 167996, "sweet", ("added_sugar","treat","fasting_ok","regional"), 300, 400, 600, roles=("snack","lunch"), max_week=250, portion=30, quality=0.4, grp="sweet", pack=(250, "упаковка 250 г"), min_week=60, overrides=dict(sugars=35.0), note="Сахар: по Скурихину (в USDA нет данных)")
add("oat_cookies", "Печенье овсяное", 172725, "sweet", ("added_sugar","gluten","high_gi","treat"), 250, 350, 550, roles=("snack","breakfast"), max_week=300, portion=40, quality=0.3, grp="sweet", pack=(300, "упаковка 300 г"), min_week=80)
add("gingerbread", "Пряники", 174956, "sweet", ("added_sugar","gluten","high_gi","treat"), 220, 300, 450, roles=("snack","breakfast"), max_week=300, portion=40, quality=0.2, grp="sweet", pack=(350, "упаковка 350 г"), min_week=80)
add("ice_cream", "Пломбир", 167575, "sweet", ("added_sugar","dairy","lactose","high_gi","treat"), 450, 600, 900, roles=("snack",), max_week=350, portion=70, quality=0.3, grp="sweet", pack=(250, "брикет/стаканчик 250 г"), min_week=70)
add("milk_chocolate", "Шоколад молочный", 167587, "sweet", ("added_sugar","dairy","high_gi","treat"), 900, 1200, 1800, roles=("snack",), max_week=200, portion=25, quality=0.2, grp="sweet", pack=(90, "плитка 90 г"), min_week=45)
add("cheesecake_curd", "Сырок творожный глазированный", 167575, "sweet", ("added_sugar","dairy","lactose","treat"), 650, 850, 1200, roles=("snack","breakfast"), max_week=250, portion=45, quality=0.3, grp="sweet", pack=(45, "1 шт 45 г"), min_week=45,
    note="Состав: USDA «ice cream, vanilla» как ближайший аналог по калорийности и сахару")

CATALOG = P
