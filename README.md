# NA Distributors

A responsive spice distribution application with a separate React/TypeScript frontend and modular Express API. Business data is written directly through the API to MongoDB Atlas or a persistent SQLite database. There is no browser business-data store, demo catalog, or in-memory database fallback.

## Requirements and startup

- Node.js **24+** (`.node-version` records the tested version).
- npm 11+.
- MongoDB Atlas (or a MongoDB replica set), or a persistent writable disk for local SQLite.

From this repository:

```sh
npm ci --cache /tmp/na-distributors-npm
npm run dev
```

The development frontend runs on port **5173**, with `/api` proxied to the Express backend on **3001**. The frontend and backend can also be started independently with `npm run dev -w frontend` and `npm run dev -w backend`.

For a production-style local run:

```sh
npm run build
npm start
```

Express then serves both the built frontend and `/api` on port **3001**. Use an HTTPS reverse proxy for deployment. Set `COOKIE_SECURE=true` behind HTTPS. Live processes must be restarted when a cloud environment is restored. Use the existing checkout; cloud tasks are already isolated and do not need a Git worktree.

## First visit and accounts

The initial database contains only these users, plus application configuration defaults:

| Person              | Username  | Role                 |
| ------------------- | --------- | -------------------- |
| Naween Samaranayaka | `naween`  | Administrator        |
| Anura Gunasekara    | `anura`   | Inventory manager    |
| Mangala Senarathna  | `mangala` | Sales representative |

There are **no default passwords**. On the first visit, set Naween's administrator password (at least 10 characters). Complete this step on your trusted deployment before opening it to other users. Then use **Team & access** to set temporary passwords for Anura and Mangala. They must choose personal passwords on their first sign-in. Users can change their password or switch accounts from the top-right menu.

All products, stock, customers, orders, payments, notifications, accounting export logs, and reminder drafts start empty. Add records through the website. The automated tests use separate temporary databases; they never seed the working database.

## Workflow

1. **Settings:** add business/invoice details, check pricing tiers, distributor markup and payment terms.
2. **Spice inventory:** create products and opening stock. Set SKU, optional barcode, origin, size, grade, batch, reorder level and unit prices. Future receipts and corrections require a stock adjustment note.
3. **Customers:** add business contacts, default tier, terms, credit limit and optional map coordinates. GPS is requested only when the user clicks the GPS button.
4. **Sales orders:** choose a customer, confirm an active pricing tier, add items manually or by barcode/SKU, choose a volume discount and record any payment. Review the server quote, then create the order.
5. **Invoices/payments:** view and print invoices, record partial or full payments, or export orders. An admin-confirmed deletion reverses stock and removes associated payments.
6. **Reports:** use date presets or a custom range to see product/customer performance, weekly revenue, historical cost and gross profit. Download a CSV or monthly PDF statement.

Each order item displays **unit price × quantity = gross line total**. Printed invoices also show the allocated volume discount and net line amount. The backend validates stock, price sources, payment amount and discount eligibility again at save time. Client-provided prices and totals are ignored.

### Calculations

Money is stored as integer cents; prices and quantities are validated on the server. Stock quantities are whole units (use packs, jars, bags, etc.; use product size for weight).

- Unit price = the chosen tier's price source (`mrp`, `wholesale`, or `distributor`) × its multiplier, rounded to cents.
- Line subtotal = unit price × quantity.
- Order subtotal = sum of line subtotals.
- A single eligible **manual** volume discount is applied to the order subtotal:

| Subtotal from | Discount |
| ------------- | -------- |
| Rs. 5,000     | 2%       |
| Rs. 10,000    | 3%       |
| Rs. 20,000    | 4%       |
| Rs. 40,000    | 5%       |
| Rs. 50,000    | 7%       |
| Rs. 100,000   | 10%      |

- Discount amount = subtotal × selected percentage, rounded once to cents.
- Invoice total = subtotal − discount. **No tax is added.**
- Balance = invoice total − recorded payments.
- For per-product profit, the discounted invoice total is allocated proportionally to gross lines; the last line receives any rounding remainder.
- Cost of goods sold uses the cost captured when the order was created. Editing current product costs never changes historical profit.
- Distributor suggested price = cost × (1 + markup / 100). Markup is distinct from profit margin.

Order creation, stock deductions, initial payments, notifications and audit entries share a single database transaction. Retrying the same browser order request does not create a duplicate invoice. Deleting an order restores its item quantities. Products referenced by invoices cannot be deleted or cleared by catalog reset until those invoices are removed.

Customer credit limits create an explicit warning during order entry; they do not automatically block sales. Reports use order dates for revenue and payment dates for collections. Outstanding balances reflect all recorded payments, including payments after the selected reporting period. Business dates use `Asia/Colombo`.

## Data and backend structure

```text
backend/src/
  server.js              Process startup/shutdown
  app.js                 Express middleware and route registration
  db.js                  SQLite schema and shared defaults
  config/database.js     Provider selection and secret loading
  mongo/                 Native collections, transactions and MongoDB routes
  order-calculations.js  Shared server pricing and discount calculations
  report-calculations.js Shared financial report calculations
  auth.js                Password hashing, sessions, CSRF and permission checks
  lib.js                 Validation, money, CSV and response transforms
  routes/
    products.js          Catalog and stock ledger
    customers.js         Trade accounts and order history
    orders.js            Quotes, invoices, payments and reversal
    analytics.js         Dashboard and financial reports
    admin.js             Settings and team administration
    connections.js       Notifications, reminder drafts and accounting exports
frontend/src/
  api.ts                 API client; no local business records
  context.tsx            Signed-in user, configuration and messages
  components/            Shared UI, print templates, navigation and charts
  pages/                 Feature-specific screens
```

The default database is **`backend/data/na-distributors.sqlite`** when using the root npm scripts. SQLite WAL and foreign keys are enabled. Failure to open the database stops startup; the app never silently switches to memory. Browser requests from all users reach this shared backend database.

Set `DATABASE_PATH` to an absolute path on a persistent volume for deployment. Back up the database with SQLite's backup API (or stop the backend cleanly and copy the database). Do not copy only the main SQLite file while WAL writes are active. Test restoring your backups. Do not commit database files, sessions, password hashes or real customer records.

Configuration options are documented in `backend/.env.example`. Values must be exported by the shell or deployment platform; the application does not automatically load `.env` files.

### Separate frontend/backend hosting

Same-origin deployment is the recommended default. **Mobile workspace → Configure connection** can save a trusted backend URL in the browser. This is the only localStorage preference; business data always comes from the API. For separate hosting:

- Configure `CORS_ORIGINS` on the API to the exact trusted frontend origin(s).
- Configure `CSP_CONNECT_ORIGINS` on the server serving the production frontend to allow the API's HTTPS origin.
- Use HTTPS and same-site domains so session cookies work. Arbitrary cross-site hosting is not supported by the default `SameSite=Lax` cookies.
- The phone must be able to reach both the site and backend. A desktop's localhost URL is not reachable from a phone.

### MongoDB and secrets

MongoDB is a native backend with collections for users, sessions, products, customers, invoices, items, payments, stock movements, settings, notifications and audit history. Writes go to MongoDB before the API reports success. Stock, invoices and payments use MongoDB transactions, with concurrency protection against overselling, overpayment and duplicate order retries. An Atlas cluster or replica set is required; a standalone MongoDB server is rejected.

Configure **exactly one** connection-secret source:

- **Google Cloud (recommended):** set `MONGODB_URI_SECRET` to `projects/radiant-destiny-366613/secrets/na-distributors-mongodb-uri/versions/latest`. The backend fetches the URI at startup using Application Default Credentials from its runtime service account and verifies the Secret Manager response checksum. Grant `roles/secretmanager.secretAccessor` on this secret only.
- **Mounted secret:** set `MONGODB_URI_FILE` to a readable secret-file path. The file must contain the exact URI, without a trailing newline.
- **Platform secret binding:** inject `MONGODB_URI` through your deployment platform's native secrets feature. Do not paste it into shell command arguments or commit it in `.env` files.

Set `DATABASE_PROVIDER=mongodb` and `MONGODB_DB_NAME=na_distributors`. A connection secret also selects MongoDB automatically when the provider is omitted. Production (`NODE_ENV=production`) requires verified TLS. Insecure certificate/hostname settings are rejected. Missing credentials, denied access or a failed connection stop startup; there is no SQLite or memory fallback. The health endpoint reports `database: "mongodb"` only after a successful database ping.

Create an Atlas database user with `readWrite` access to `na_distributors`. Allow the Google Cloud VM's reserved external IP as a single `/32` entry in Atlas **Network Access**. Store the full Atlas connection URI only in Secret Manager. Keep the database name and secret resource reference as ordinary configuration. Rotate any password shared in chat, then restart the application to load the new secret version.

Choosing MongoDB opens that database; it does not migrate or synchronize an existing SQLite file. Preserve any existing file and arrange a reviewed migration if it contains records you need. A fresh MongoDB database contains only the three named users and configuration defaults. Configure and test Atlas backups separately; VM snapshots do not back up Atlas.

## Access controls

Passwords are scrypt-hashed with per-password random salts. Sessions use random, hashed server-side tokens and HTTP-only cookies with a 12-hour expiry. Mutations require session CSRF tokens. Login/setup and API requests are rate limited. Role permissions are enforced by the API as well as the navigation. Cost and markup fields are omitted for users without cost access. Protected deletions and settings reset require an active administrator's password. At least one usable administrator must remain.

## Integrations and mobile limitations

- **Accounting:** QuickBooks-style JSON and Xero CSV exports are real files with saved activity logs. There is **no live OAuth connection or accounting sync**. QuickBooks identifiers and Xero account codes/tax mappings require review before import. Exports do not record a successful remote synchronization.
- **Payment reminders:** editable templates and prepared drafts are persisted. **No email or SMS provider sends messages.** Copy and send a draft through your own app; saved drafts are not delivery receipts.
- **Scanning:** manual entry and keyboard-style USB/Bluetooth scanners work. Camera scanning uses the device camera through ZXing and requires HTTPS/localhost plus permission. Actual camera hardware and print alignment need testing on the target devices.
- **PWA:** manifest, icons, service worker and installation instructions are included. Only the static app shell can be cached; API responses and business records are never cached. Reading or changing records requires a reachable backend.
- **Android:** the Mobile workspace includes Capacitor/Android Studio packaging instructions. There is **no prebuilt APK**, native camera plugin or signing key in the repository.

## Validation

```sh
npm run check       # TypeScript
npm test            # SQLite API and secret/configuration tests with isolated databases
npm run test:mongo  # Native MongoDB tests; requires MONGODB_TEST_URI for a test replica set
npm run build       # Production frontend
npm run test:e2e    # Browser workflow against an isolated production-style server
```

Browser tests use system Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installation. If using Playwright's bundled Chromium, install it and set the executable path accordingly. The browser test requires a current frontend build and uses port 3011. Its temporary database is created under the OS temporary directory, separate from the application database.

MongoDB tests create randomly named databases prefixed `na_test_` and drop only those databases on completion. `MONGODB_TEST_URI` must reference a disposable test cluster/replica set, never production. The MongoDB suite fails if this variable is absent. To exercise the same browser workflow on MongoDB, provide `MONGODB_TEST_URI` when running `npm run test:e2e`; its temporary `na_browser_test_` database is removed when the test server stops.

Tests cover empty initialization, authentication, all six discount thresholds, atomic stock changes, idempotent order creation, payments, historical margins, role restrictions, exports, reminder drafts, persistence and a browser workflow at desktop and mobile widths. Physical camera capture, print hardware, provider delivery and signed Android packaging are not exercised by those tests.

## Google Cloud deployment

A Google Cloud Shell installer for project `radiant-destiny-366613` is in [deploy/google-cloud/README.md](deploy/google-cloud/README.md). It uses a dedicated Compute Engine VM, MongoDB Atlas via Secret Manager (or optional SQLite storage), HTTPS, a private first-visit setup code and daily disk snapshots. Cloud resources incur charges. The deployment must be run by an authenticated Google Cloud user; no service-account key should be shared in chat.
