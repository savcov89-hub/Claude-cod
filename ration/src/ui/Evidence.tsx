import { SOURCES } from "../core";
import { Card, Badge } from "./bits";

const KINDS = ["норматив", "клинические рекомендации", "исследование", "данные"] as const;

export default function Evidence() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <span className="eyebrow">Источники</span>
      <h1>На чём основан расчёт</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Каждое правило приложения ссылается на документ из этого списка. Нормы и пределы хранятся как данные с источником, а не «из головы».
        Если документ обновится, достаточно поменять одну таблицу.
      </p>
      <div className="mt-6 grid gap-6">
        {KINDS.map((kind) => (
          <section key={kind}>
            <h2 className="mb-3 capitalize">{kind}</h2>
            <div className="grid gap-3">
              {SOURCES.filter((s) => s.kind === kind).map((s) => (
                <Card key={s.id} className="print-block">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{s.org}</Badge>
                    <Badge tone="muted">{s.year}</Badge>
                    <span className="num text-xs text-muted">{s.id}</span>
                  </div>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 block font-semibold hover:underline">{s.title}</a>
                  ) : (
                    <span className="mt-2 block font-semibold">{s.title}</span>
                  )}
                  <p className="mt-2 text-sm text-muted"><b className="text-ink">Что взято: </b>{s.used}</p>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
      <Card className="mt-8">
        <h2>Как считается рацион</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
          <li>Энергия: базовый обмен по Миффлину – Сан Жеору × коэффициент активности МР; надбавки для беременных и кормящих; дефицит 500–700 ккал при цели «снизить вес» с нижними границами.</li>
          <li>Нормы на день: витамины и минералы из МР 2.3.1.0253‑21 с учётом пола, возраста, беременности и лактации; верхние пределы EFSA/IOM; жиры, сахара, соль, клетчатка и овощи по ВОЗ; белок, калий, фосфор по KDIGO/КР ХБП при болезни почек; клетчатка 14 г/1000 ккал и исключение сахаров при диабете.</li>
          <li>Корзина на неделю: задача смешанно-целочисленного программирования (HiGHS, в браузере) — минимальная стоимость при выполнении норм в среднем за 7 дней, лимитах на продукт и группу (печень ≤150 г, орехи ≤280 г, сладкое ≤200 г, субпродукты ≤250 г) и минимумах разнообразия (рыба ≥300 г, бобовые ≥150 г); продукт либо не покупается, либо берётся в реалистичном объёме (рыба от 350–500 г, мясо от 400 г). Нормы витаминов — «мягкие» со штрафом, поэтому задача всегда решается, а недобор честно показывается.</li>
          <li>Меню: порции раскладываются по дням и приёмам так, чтобы дни были ровными по калориям (и по углеводам при диабете).</li>
        </ol>
      </Card>
    </div>
  );
}
