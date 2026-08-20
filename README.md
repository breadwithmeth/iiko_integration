# iiko Call Center

Рабочее место оператора call-центра для создания заказов через iiko Cloud API. Frontend обращается только к нашему backend; секреты iiko, JWT secret и iiko token не попадают в browser bundle.

## Установка

```bash
npm install
cp .env.example .env
```

Заполните `.env`:

```env
IIKO_BASE_URL=https://api-ru.iiko.services/api
IIKO_API_KEY=
IIKO_APP_ID=
IIKO_CLIENT_SECRET=
IIKO_ORGANIZATION_ID=13ab7ae1-5d43-4be6-b72c-360c20ff2912
DATABASE_URL=postgresql://iiko:iiko@localhost:5432/iiko_call_center?schema=public
JWT_SECRET=change-me-at-least-32-characters
WEB_ORIGIN=http://localhost:5173
```

`IIKO_TERMINAL_GROUP_ID` не нужен для frontend и не зашит в код. Terminal groups синхронизируются через iiko API.

## PostgreSQL

```bash
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
```

## Первый ADMIN

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='strong-password' npm run create-admin -w @iiko-call-center/api
```

## Запуск локально

```bash
npm run dev -w @iiko-call-center/api
npm run dev -w @iiko-call-center/web
```

Откройте `http://localhost:5173`, войдите под ADMIN, затем откройте `/settings/iiko`.

## Docker

```bash
docker compose up --build
```

После старта примените миграции контейнером API автоматически через `prisma migrate deploy`. Для первого администратора можно выполнить команду внутри окружения с тем же `.env`.

## iiko API configuration

Backend использует:

- `POST /api/v2/access_token`
- `POST /api/1/organizations`
- `POST /api/1/terminal_groups`
- `POST /api/1/deliveries/order_types`
- `POST /api/1/payment_types`
- `POST /api/nomenclature/v1/product/list`
- `POST /api/1/order/create`

Token кешируется backend-сервисом `IikoAuthService`. При HTTP `401` token обновляется и запрос повторяется один раз. Для `429` и `5xx` включен ограниченный retry с exponential backoff.

## Синхронизация меню

В UI: `/settings/iiko` или кнопка `Обновить меню` на `/orders/new`.

Через API:

```bash
curl -X POST http://localhost:4000/api/iiko/sync/menu \
  -H "Authorization: Bearer <JWT>"
```

Синхронизация загружает все страницы номенклатуры, обновляет существующие товары, добавляет новые и помечает отсутствующие как `deleted`.

## Создание первого заказа

1. Войти в UI.
2. Синхронизировать справочники iiko.
3. Синхронизировать меню.
4. Открыть `/orders/new`.
5. Выбрать организацию, terminal group, тип заказа и оплату.
6. Ввести телефон клиента.
7. Найти блюдо по названию, артикулу или коду.
8. Добавить позиции, указать количество и комментарии.
9. Нажать `Оформить заказ`.

Backend генерирует новый UUID заказа и уникальный `externalNumber` вида `CALL-YYYYMMDD-000001`, сохраняет заказ как `SUBMITTING`, отправляет его в iiko и затем фиксирует `CREATED`, `FAILED` или `UNKNOWN`.

## Горячие клавиши

- `Ctrl/Cmd + K` — фокус на поиск товара.
- `Enter` в поиске — добавить выбранный товар.
- `Escape` — снять фокус с поиска.
- `Arrow Up/Down` — перемещение по найденным товарам.

## Тесты и сборка

```bash
npm run build
npm run test
```

Автоматические тесты mock-ают iiko API и не создают реальные заказы.

## Troubleshooting

- `Organization is not synchronized`: сначала выполните синхронизацию справочников на `/settings/iiko`.
- `iiko credentials are not configured`: проверьте `IIKO_API_KEY`, `IIKO_APP_ID`, `IIKO_CLIENT_SECRET`.
- `One or more products are unavailable`: товар не найден в локальном кеше или помечен `deleted`; обновите меню.
- `UNKNOWN` у заказа: backend не получил надежный ответ от iiko после отправки. Не создавайте новый заказ вручную с теми же данными, сначала проверьте заказ по `externalNumber`/`correlationId` в iiko.
