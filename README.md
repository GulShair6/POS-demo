# Atlas POS — self-hosted edition

Atlas POS is a web-based retail point-of-sale application for a single business with one or more browser terminals connected to one configured register. It includes checkout, cash/card recording, inventory, shifts, refunds, customers, reporting, employees, roles, audit history, PWA installation, and an offline cash-sale queue.

This directory is a complete standalone application. It does not depend on ChatGPT Sites or Cloudflare D1.

## Production architecture

- Next.js 16 application and API
- PostgreSQL 17 database
- Drizzle schema and versioned migrations
- Signed, HTTP-only employee sessions
- Docker Compose deployment
- Optional Caddy HTTPS reverse proxy

Financial operations use PostgreSQL transactions. A completed sale writes the sale, line snapshots, payment, stock ledger, stock balance, drawer movement, customer totals, and audit event atomically. Refunds and stock adjustments follow the same principle.

## Included capabilities

- Secure employee email/password login using scrypt password hashes
- Server-enforced Owner, Manager, Supervisor, Cashier, Inventory, Accountant, and Auditor permissions
- Configurable business name, store, register, ISO currency, locale, and tax rate
- Products, SKUs, barcodes, costs, prices, archive/restore, low-stock thresholds
- Transactional inventory movements and negative-stock prevention
- Cash, manual card, and split-tender sales
- Idempotency protection against duplicate checkout submissions
- Immutable line-level name, SKU, price, and cost snapshots
- Cash shifts, paid-in/out, safe drops, petty cash, no-sale openings, blind close, and variance
- Partial/full refunds with quantity controls and optional restocking
- Customers, visit totals, spend totals, and loyalty points
- Date-filtered sales, payment, product, shift, inventory, tax, refund, COGS, and gross-profit reporting
- CSV sales export with spreadsheet-formula injection protection
- Audit history for sensitive actions
- Health endpoint at `/api/health`
- Static-asset-only service-worker caching so shared terminals do not cache authenticated pages
- PostgreSQL backup and restore scripts

External card processing remains manual until a payment provider and terminal model are selected. Printing uses the browser; silent thermal printing and physical drawer control require a local hardware bridge.

## Server requirements

- A Linux server with Docker Engine and the Docker Compose plugin
- At least 2 CPU cores, 2 GB RAM, and 20 GB SSD for a small shop
- A domain name and HTTPS reverse proxy for production use
- Outbound access to retrieve Docker images during installation

## First deployment

1. Copy this directory to the server and enter it.

2. Create the environment file:

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

3. Edit `.env`. Replace every placeholder. Generate the session secret with:

   ```bash
   openssl rand -base64 48
   ```

   `ADMIN_PASSWORD` must be at least 12 characters. The initial owner is created once. Changing this value later does not silently replace the account password.

4. Build and start:

   ```bash
   docker compose up -d --build
   docker compose ps
   curl http://127.0.0.1:3050/api/health
   ```

5. Put an HTTPS reverse proxy in front of `127.0.0.1:3050`. `Caddyfile.example` is a minimal Caddy configuration. After DNS points to the server:

   ```bash
   sudo cp Caddyfile.example /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

6. Open the HTTPS URL and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Do not expose PostgreSQL publicly. The Compose file intentionally gives the database no host port and binds the application only to loopback.

## Demo deploy (Vercel + Supabase)

For a public demo URL (not the preferred production till setup):

1. Create a free [Supabase](https://supabase.com) project. In **Project Settings → Database**, copy:
   - **Direct** connection (port `5432`) for migrations
   - **Transaction pooler** connection (port `6543`) for the app on Vercel

2. From this repo, provision schema + owner + demo catalogue:

   ```bash
   DIRECT_DATABASE_URL='postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
   ADMIN_EMAIL='owner@example.com' \
   ADMIN_PASSWORD='your-demo-password-12' \
   SEED_DEMO_DATA=true \
   ./scripts/provision-remote-db.sh
   ```

3. Import the GitHub repo into [Vercel](https://vercel.com). Set Node.js to **22.x**. Add environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase **transaction pooler** URL (`:6543`) |
   | `DB_POOL_SIZE` | `1` |
   | `DATABASE_PREPARE` | `false` |
   | `DATABASE_SSL` | `true` |
   | `SESSION_SECRET` | `openssl rand -base64 48` |
   | `POS_BUSINESS_NAME` / `POS_STORE_NAME` / `POS_REGISTER_CODE` / `POS_CURRENCY` / `POS_LOCALE` / `POS_TAX_RATE` | same as `.env.example` |
   | `SEED_DEMO_DATA` | `false` |

4. Deploy. Check `https://<project>.vercel.app/api/health`, then sign in with the seeded owner.

The app auto-detects Supabase pooler URLs and disables prepared statements / query pipelining. Login rate limits are stored in Postgres so they work across serverless instances.

## Configuration

| Variable            | Meaning                                     | Example          |
| ------------------- | ------------------------------------------- | ---------------- |
| `POS_BUSINESS_NAME` | Legal/trading name printed on receipts      | `Atlas Coffee`   |
| `POS_STORE_NAME`    | Current store label                         | `Downtown store` |
| `POS_REGISTER_CODE` | Register whose open shift accepts sales     | `REG-01`         |
| `POS_CURRENCY`      | Three-letter ISO 4217 currency              | `USD`            |
| `POS_LOCALE`        | Browser formatting locale                   | `en-US`          |
| `POS_TAX_RATE`      | Decimal tax rate                            | `0.0825`         |
| `SEED_DEMO_DATA`    | Add sample products/customers on first boot | `false`          |

Restart the application after changing runtime configuration:

```bash
docker compose up -d
```

Tax and currency must be finalized before live trading. Historical sales preserve their charged totals, but changing currency after real sales would mix currencies in reports because this release is single-currency.

## Backups

Create a compressed logical backup:

```bash
set -a; . ./.env; set +a
./scripts/backup.sh
```

Schedule it daily and copy backups off the POS server. Example cron entry:

```cron
15 2 * * * cd /opt/atlas-pos && set -a && . ./.env && set +a && ./scripts/backup.sh >/var/log/atlas-pos-backup.log 2>&1
```

Test restoration on a non-production server:

```bash
set -a; . ./.env; set +a
./scripts/restore.sh backups/atlas-pos-YYYYMMDDTHHMMSSZ.sql.gz
```

Back up `.env` separately in a secure password manager. Database backups do not contain the session secret.

## Updates

Before updating:

```bash
set -a; . ./.env; set +a
./scripts/backup.sh
docker compose pull
docker compose up -d --build
docker compose ps
```

The application runs pending database migrations before it starts accepting requests.

## Local development

Start PostgreSQL using the Compose database service, then run the app locally:

```bash
cp .env.example .env
docker compose up -d db
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Run validation:

```bash
npm run lint
npm test
npm run build
```

## Operational safeguards

- Use a unique account for each employee; do not share the owner account.
- Give cashiers only the Cashier role.
- Review no-sale drawer openings, refunds, stock adjustments, and cash variance daily.
- Keep server time synchronized with NTP.
- Run behind HTTPS only; secure session cookies are enabled in production.
- Test backups and refund/card procedures before opening the register.
- Never store card numbers or security codes in Atlas POS.

## Scope boundaries

This release records card payments but does not capture them. Country-specific fiscal certification, electronic invoicing, certified fiscal printers, and privacy/tax retention rules must be reviewed for the deployment country. Multi-currency, restaurant tables/kitchen routing, accounting integrations, gift-card liability, and synchronized multi-store stock are intentionally not represented as complete features.
