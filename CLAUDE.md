# Training Log

Журнал тренера и клиента: React + Vite, сервер и данные на Supabase, сайт на GitHub Pages
(https://savcov89-hub.github.io/Claude-cod/). Подробности и настройка — в README.md.

## Договорённости с владельцем
- Общение и тексты интерфейса — на русском.
- Готовые проверенные изменения отправлять сразу в `main`, без pull request:
  коммит в рабочую ветку сессии, затем `git push origin HEAD:main`. После отправки проверить запуски в GitHub Actions.
- Пуш в `main` публикует сайт (Deploy site) и, при изменениях серверной части, Supabase (Deploy Supabase).

## Проверка перед отправкой
- `npm run check` — типы; `npm run build` — сайт; `npm run build:api` — серверная функция.
- Интерфейс смотреть в браузере: `npm run dev`, без Supabase — с `?demo=1` (пример данных, переключатель Тренер/Клиент).
- Изменения в `backend/`: локальный Supabase (`npx supabase start`, нужен Docker) и `scripts/supabase-parity.ts`.
  После `npm run build:api` перезапускать контейнер `supabase_edge_runtime_training-log`.

## Устройство
- `backend/app.ts` — вся логика и права доступа; работает и на сервере (`backend/server.ts`), и в демо (`src/local/`).
- Данные — таблица `kv_rows` (колонка `json`, не `jsonb`: порядок ключей важен для интерфейса).
  Доступ к ней только у серверной функции; браузер ходит в `/functions/v1/api`.
