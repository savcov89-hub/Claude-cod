# -*- coding: utf-8 -*-
"""
Сборка базы продуктов: каталог (catalog.py) + состав из USDA FoodData Central (SR Legacy, public domain).

Запуск:  python3 data/etl/build_products.py
Результат: src/data/products.json

Сырые файлы USDA (6 МБ zip) скачиваются в data/raw при первом запуске.
"""
import csv, io, json, os, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "src", "data", "products.json")
USDA_ZIP_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
USDA_DIR = os.path.join(RAW, "FoodData_Central_sr_legacy_food_csv_2018-04")

sys.path.insert(0, HERE)
from catalog import CATALOG  # noqa: E402

# nutrient key -> (USDA nutrient_id, unit)
NUTRIENTS = {
    "kcal": (1008, "kcal"), "protein": (1003, "g"), "fat": (1004, "g"), "carbs": (1005, "g"),
    "fiber": (1079, "g"), "sugars": (2000, "g"),
    "sat_fat": (1258, "g"), "trans_fat": (1257, "g"), "mufa": (1292, "g"), "pufa": (1293, "g"),
    "cholesterol": (1253, "mg"),
    "calcium": (1087, "mg"), "iron": (1089, "mg"), "magnesium": (1090, "mg"), "phosphorus": (1091, "mg"),
    "potassium": (1092, "mg"), "sodium": (1093, "mg"), "zinc": (1095, "mg"), "copper": (1098, "mg"),
    "manganese": (1101, "mg"), "selenium": (1103, "ug"), "iodine": (1100, "ug"),
    "vit_c": (1162, "mg"), "vit_b1": (1165, "mg"), "vit_b2": (1166, "mg"), "niacin": (1167, "mg"),
    "vit_b5": (1170, "mg"), "vit_b6": (1175, "mg"), "folate": (1177, "ug"), "vit_b12": (1178, "ug"),
    "choline": (1180, "mg"), "vit_a": (1106, "ug"), "vit_e": (1109, "mg"), "vit_d": (1114, "ug"),
    "vit_k": (1185, "ug"),
}
ID2KEY = {v[0]: k for k, v in NUTRIENTS.items()}


def ensure_usda():
    if os.path.isdir(USDA_DIR):
        return
    os.makedirs(RAW, exist_ok=True)
    print("downloading USDA SR Legacy ...")
    data = urllib.request.urlopen(USDA_ZIP_URL, timeout=300).read()
    zipfile.ZipFile(io.BytesIO(data)).extractall(RAW)


def load_usda():
    foods = {}
    with open(os.path.join(USDA_DIR, "food.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            foods[int(r["fdc_id"])] = r["description"]
    by_desc = {d: i for i, d in foods.items()}
    wanted = set()
    resolved = {}
    for p in CATALOG:
        fid = p["fdc_id"]
        if fid is None:
            continue
        if isinstance(fid, str):
            if fid not in by_desc:
                # fuzzy: startswith
                cands = [i for i, d in foods.items() if d.lower().startswith(fid.lower()[:40])]
                if not cands:
                    raise SystemExit(f"USDA description not found for {p['id']}: {fid}")
                fid = cands[0]
            else:
                fid = by_desc[fid]
        if fid not in foods:
            raise SystemExit(f"fdc_id {fid} not in SR Legacy ({p['id']})")
        resolved[p["id"]] = fid
        wanted.add(fid)
    nut = {i: {} for i in wanted}
    with open(os.path.join(USDA_DIR, "food_nutrient.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            fid = int(r["fdc_id"])
            if fid in nut:
                nid = int(r["nutrient_id"])
                if nid in ID2KEY:
                    nut[fid][ID2KEY[nid]] = float(r["amount"])
    return foods, resolved, nut


LOOSE = {"vegetable": 100, "fruit": 100}


def default_pack(p):
    """Единица покупки по умолчанию: весовые овощи/фрукты — шаг 100 г, остальное — порция × 4."""
    if p["category"] in LOOSE:
        return (LOOSE[p["category"]], "на развес")
    return (max(100, int(round((p.get("portion") or 100) * 4 / 50.0)) * 50), "упаковка")


def default_min_week(p, pack_g):
    """Минимальный недельный объём, если продукт выбран: иначе солвер кладёт 40 г рыбы «для селена»."""
    cat, grp = p["category"], p.get("group")
    if cat in ("fish", "seafood"): return 350
    if cat in ("meat", "poultry"): return 400
    if cat == "offal": return 100
    if cat == "vegetable": return 20 if p["id"] in ("dill", "parsley", "garlic") else 200
    if cat == "fruit": return 50 if grp in ("dried_fruit", "berry") else 300
    if grp == "cereal": return 150
    if grp == "bread": return 150
    if grp == "legume": return 150
    if cat == "dairy": return 100 if grp in ("cheese", "dairy_fat") else 400
    if cat == "egg": return 200
    if cat == "nut": return 50
    if cat == "fat": return 40
    if cat == "sweet": return 40
    return min(pack_g, 20)


def main():
    ensure_usda()
    foods, resolved, nut = load_usda()
    out = []
    for p in CATALOG:
        rec = {k: p[k] for k in ("id", "name", "category", "tags", "prices", "price_estimated",
                                 "season", "roles", "max_week_g", "portion_g", "quality", "group", "note", "buy_hint")}
        pack = p.get("pack") or default_pack(p)
        rec["pack_g"], rec["pack_label"] = pack
        rec["min_week_g"] = p.get("min_week_g") or default_min_week(p, pack[0])
        n = {k: 0.0 for k in NUTRIENTS}
        if p["id"] in resolved:
            fid = resolved[p["id"]]
            n.update(nut[fid])
            rec["source"] = {"type": "usda_sr_legacy", "fdc_id": fid, "description": foods[fid],
                             "url": f"https://fdc.nal.usda.gov/food-details/{fid}/nutrients"}
        if p.get("manual"):
            m = dict(p["manual"])
            src = m.pop("source")
            n.update(m)
            rec["source"] = {"type": "manual", "description": src}
        if p.get("overrides"):
            n.update(p["overrides"])
        if p.get("iodine_ug_100g") is not None:
            n["iodine"] = float(p["iodine_ug_100g"])
            rec["iodine_source"] = "Скурихин И.М., Тутельян В.А., 2002 / ГОСТ Р 51574 (ручной ввод)"
        rec["per100g"] = {k: round(v, 4) for k, v in n.items()}
        out.append(rec)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated_from": "USDA FoodData Central SR Legacy (April 2018) + ручные дополнения",
                   "nutrient_units": {k: v[1] for k, v in NUTRIENTS.items()},
                   "products": out}, f, ensure_ascii=False, indent=1)
    print(f"ok: {len(out)} products -> {OUT}")
    # sanity report
    miss = [(p["id"], k) for p in out for k, v in p["per100g"].items() if v == 0 and k in ("kcal", "protein")]
    if miss:
        print("zero kcal/protein:", miss)


if __name__ == "__main__":
    main()
