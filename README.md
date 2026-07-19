# VCAIST

VCAIST is a plain-English code-intelligence platform for people who own an app but do not want to become software engineers to understand it.

The current prototype demonstrates the complete product loop with a sample commerce app: connect project files, discover business controls, run the app's pricing logic in a safe simulation, and reveal a real edge-case defect in understandable terms.

## What it does

- Explains an app's workflow as both a plain-English and technical map, then summarizes its core data model in a simple entity relationship diagram.
- Finds adjustable business values such as prices, discounts, thresholds, and fees.
- Lets users choose a local project folder, a Google Drive folder, or a public GitHub repository as the project source.
- Connects those values to responsive controls that re-run the sample app logic immediately.
- Combines executed business-logic checks with guided system-design and security review, then translates every risk into understandable impact and protection guidance.
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

No API key or database is required for this prototype. The active model selector groups OpenAI, Anthropic, Google, Moonshot AI, and Alibaba Cloud options into Frontier, Workhorse, and Efficient tiers. Claude Sonnet 5 is the fresh-install default, while GPT-5.6 Terra, Gemini 3.1 Pro, Kimi K2.7 Code, Qwen3.7 Plus, Gemini 3.5 Flash, and GPT-5.4 provide workhorse alternatives. Compact dropdown prices use one consistent `USD input / output per 1M tokens` format. The current product behavior still uses the deterministic ShopSpring demo fixture so the core loop is reliable and testable.

### Optional Google Drive connection

Local folders and public GitHub repositories work without credentials. Google Drive uses Google's read-only Picker flow and needs three public identifiers from a Google Cloud project. Copy `.env.example` to `.env.local`, fill in the values, enable the Google Picker and Drive APIs, and add your local and deployed origins to the OAuth client. No OAuth client secret belongs in the browser environment.

### Hardware

- Minimum: dual-core CPU, 4 GB RAM, and 300 MB free disk space
- Recommended for development: 4-core CPU, 8 GB RAM, and 1 GB free disk space
- Screen support: 320 px-wide phones through large desktop displays
- Internet access is only required to install dependencies or deploy the site

The interface uses a desktop sidebar, fluid content grids, touch-friendly controls, and a compact mobile navigation bar. Reduced-motion preferences and keyboard focus states are supported.

## Components

### User-facing product

- **Guided welcome page** — explains what VCAIST is for, walks through its four-step safety loop, and offers both a demo and a direct path into the user's own project.
- **Direct workspace** — skips the tutorial and demo, opens the project-source chooser immediately, and accepts a local folder, Google Drive folder, or public GitHub repository.
- **Workspace views** — Overview, Current Application, Controls, App map, and Safety tests each begin with a plain-language explanation of the page and three useful actions. Overview contains the program summary, complete feature index, and end-to-end example story.
- **Current Application** — focuses only on the connected app itself: a responsive four-page application carousel and a consent-first AI change chat. Users can browse every guided application page with buttons or arrow keys. The assistant stays locked until the user grants permission, and it asks for separate approval before recording a sandbox draft request. Financial metrics, sandbox results, safety findings, and business controls are intentionally excluded from this page.
- **Project importer** — one source chooser for local directories, Google Drive folders, and public GitHub repositories, with an explicit indexing state and clear completion message.
- **Device-local scan cache** — fingerprints supported file metadata so an unchanged project can skip repeat indexing on the same browser for 30 days. Source contents are never stored in the cache, and browsers still require the user to select a local folder again for privacy.
- **Business controls** — four sliders bound to the sample app's price, discount, discount threshold, and shipping fee.
- **Live sandbox** — re-runs the connected pricing function without touching live customers or production data.
- **App map** — toggles between a plain-English purchase flow and the corresponding technical path. Every workflow step opens its mapped file in a line-numbered, read-only source workspace. A simplified conceptual entity relationship diagram uses rectangles for the four core entities, diamonds for relationships, ovals for important attributes, and one/many cardinality labels. A failing workflow module and its source file are highlighted in red, followed by a warning beneath the diagram with a direct link to Safety Tests. The longer entity dictionary has been removed.
- **Safety tests** — presents a searchable, clickable system-wide findings list instead of only customer-facing edge cases. It combines the executed zero-quantity pricing check with guided code and architecture review for input-length limits, rate limiting, client/server trust boundaries, payment idempotency, object authorization, error disclosure, and webhook verification. Every finding opens full evidence, failure or attack scenarios, affected systems, and recommended protections.
- **Help center** — quick-start instructions and plain-language answers to common trust and safety questions.
- **Settings** — a tiered model-and-price comparison, scan behavior, test coverage, explanation preferences, and four persistent color themes saved locally on the device. Midnight Clay is the black-background default, with Midnight Sky, Forest Mint, and Warm Light alternatives. Shared semantic surfaces and WCAG-informed contrast tokens keep labels, status colors, boundaries, and controls legible in every theme. Model prices are presented per one million input/output tokens and include a visible date and provider-pricing caveat.

### Implementation

- `app/Onboarding.tsx` — interactive tutorial and first-run explanation at `/`
- `app/Dashboard.tsx` — interactive workspace and all five workspace views, including the application carousel and permission-gated change assistant
- `app/demo/page.tsx` — financial demo route at `/demo`
- `app/workspace/page.tsx` — direct project workspace route at `/workspace`
- `app/components/AppChrome.tsx` — shared responsive navigation shell
- `app/help/page.tsx` — help center route
- `app/settings/` — settings route and persistent preference controls
- `lib/pricing.ts` — deterministic pricing sandbox and stress-test logic
- `lib/preferences.ts` — shared model catalog, appearance themes, defaults, and device-local preference storage
- `app/globals.css` — complete responsive visual system
- `tests/rendered-html.test.mjs` — server-rendering, route, and pricing behavior tests

### Current boundaries

Folder and repository imports are session-only: local files stay in the browser, GitHub imports read the public repository tree, and Google Drive uses an in-memory read-only access token. The interface clearly distinguishes completed source-file indexing from project-specific AI analysis. Extracted business controls, the four-page carousel, and security architecture findings still use the bundled ShopSpring fixture; only the pricing boundary test executes real fixture code. No background AI job continues after indexing finishes. The change assistant demonstrates the complete consent flow and records sandbox approval locally, but it does not edit connected source files. AI-powered repository analysis, project-specific rendering and security testing, durable project storage, private GitHub access, patch generation, and approval-based publishing are the next backend milestones.

## What comes After

The original product direction remains part of the project brief:

> Implement the application and testing, with a dynamic user interface that is easy to understand. The interface should be adjustable relative to the hardware (e.g. phone, laptop, etc.). Take a look at the example demo below in the **Example of Core Loop** section. That is one of the examples of using the application. The application should also include a help page and settings page. As for now, it is okay for the application to work under **one** AI model, but the dropdown for choosing the AI model should be there.

The current prototype has completed the responsive interface, Help center, Settings, model dropdown, deterministic sandbox, and automated test foundation described above. The next milestones are:

- Replace the bundled ShopSpring extraction fixture with project-specific AI analysis.
- Add durable project storage and private-repository support while preserving explicit user consent.
- Generate reviewable patch proposals and require approval before publishing any code change.
- Expand the sandbox beyond the sample pricing function to safely execute more project-specific business logic.
- Add broader integration, accessibility, security, and device testing as the backend capabilities grow.

## Example of Core Loop

The demoable core loop is built backwards from the emotional moment: a non-technical user points the tool at their app → the model scans it and extracts the "knobs" (constants, thresholds, and configuration such as discount rate, late fee, or shipping cost) into a manifest → VCAIST generates a dashboard with sliders bound to those knobs → dragging a slider re-runs the real code in a sandbox and the numbers move → then the kicker: "The AI stress-tested your pricing function and found that at quantity 0 it charges negative money—here is the actual crash." A slider moves, revenue changes, a real bug surfaces, and VCAIST provides a plain-English explanation.

## License

Released under the MIT License. See `LICENSE`.
