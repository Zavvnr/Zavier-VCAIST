# VCAIST

VCAIST is a plain-English code-intelligence platform for people who own an app but do not want to become software engineers to understand it.

The current prototype demonstrates the complete product loop with a sample commerce app: connect project files, discover business controls, run the app's pricing logic in a safe simulation, and reveal a real edge-case defect in understandable terms.

## What it does

- Explains an app's workflow as both a plain-English map and a technical map.
- Finds adjustable business values such as prices, discounts, thresholds, and fees.
- Connects those values to responsive controls that re-run the sample app logic immediately.
- Stress-tests awkward inputs and translates failures into business impact.
- Keeps humans in the loop. This prototype never publishes a code change.

## Environment Setup & Hardware Requirements

### Required software

- Node.js 22.13 or newer
- npm 10 or newer
- A current browser such as Chrome, Edge, Firefox, or Safari
- Git, if you plan to contribute changes

### Local setup

This is a Node.js application, so its virtual environment is the pinned Node runtime plus the project-local `node_modules` directory. It does not need a Python `.venv`.

With NVM installed, create and select the pinned runtime:

```bash
nvm install 24.12.0
nvm use 24.12.0
```

Then create the isolated project dependencies and start VCAIST:

```bash
npm run setup:local
npm run dev
```

Open the local address printed by the development server, normally `http://localhost:3000`. Future runs only need `nvm use` and `npm run dev`.

If you do not use NVM, install Node.js 24.12 directly, then run the same two npm commands. To verify a production build and run the automated tests:

```bash
npm test
```

No API key or database is required for this prototype. The active model selector is present, but the current product behavior uses the deterministic ShopSpring demo fixture so the core loop is reliable and testable.

### Hardware

- Minimum: dual-core CPU, 4 GB RAM, and 300 MB free disk space
- Recommended for development: 4-core CPU, 8 GB RAM, and 1 GB free disk space
- Screen support: 320 px-wide phones through large desktop displays
- Internet access is only required to install dependencies or deploy the site

The interface uses a desktop sidebar, fluid content grids, touch-friendly controls, and a compact mobile navigation bar. Reduced-motion preferences and keyboard focus states are supported.

## Components

### User-facing product

- **Workspace overview** — business metrics, connection state, model selector, re-scan action, and a live order simulation.
- **Business controls** — four sliders bound to the sample app's price, discount, discount threshold, and shipping fee.
- **Live sandbox** — re-runs the connected pricing function without touching live customers or production data.
- **App map** — toggles between a plain-English purchase flow and the corresponding technical path.
- **Safety tests** — runs five boundary scenarios and exposes the zero-quantity negative-total defect with relevant code and a proposed remedy.
- **Help center** — quick-start instructions and plain-language answers to common trust and safety questions.
- **Settings** — model selection, scan behavior, test coverage, and explanation preferences saved locally on the device.

### Implementation

- `app/Dashboard.tsx` — interactive workspace and all four workspace views
- `app/components/AppChrome.tsx` — shared responsive navigation shell
- `app/help/page.tsx` — help center route
- `app/settings/` — settings route and persistent preference controls
- `lib/pricing.ts` — deterministic pricing sandbox and stress-test logic
- `app/globals.css` — complete responsive visual system
- `tests/rendered-html.test.mjs` — server-rendering, route, and pricing behavior tests

### Current boundaries

File selection demonstrates the connection and scan experience, while extracted controls currently use the bundled ShopSpring fixture. AI-powered repository analysis, durable project storage, patch generation, and approval-based publishing are the next backend milestones. The UI labels these future actions instead of pretending they are live.

## License

Released under the MIT License. See `LICENSE`.
