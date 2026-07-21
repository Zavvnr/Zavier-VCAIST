# VCAIST

VCAIST is a plain-English code-intelligence platform for people who own an app but do not want to become software engineers to understand it or have litle understanding of software engineering. Because of that, the platform is more suited toward small-scale projects where codes are simply organized and explainable.

The current platform demonstrates a safe application-understanding loop with a sample commerce app: connect project files, browse the application interface, compare it with another selected project, inspect its workflow and data model, and reveal a real edge-case defect in understandable terms.

The project is accessible at: https://vcaist-platform.vercel.app/

Demo video: 

## Acknowledgement

This project is built under OpenAI Build Week Challenge July, 13 - July, 21 2026. Per requirements, it uses Codex with GPT 5.6 and licensed under MIT License. This project falls under the **Developer Tools** category.

### Codex & GPT 5.6

The project used OpenAI Codex, specifically the GPT 5.6-sol ultracode. Key decisions that include product, engineering, and design decisions were made by the author. The author then used Codex to accelerate the development of the platform (i.e. code the platform, test it, then deploy the platform to the public). Multiple iterations of requests were made to ensure that the platform works as intended.

Codex session id: 019f6e34-3f19-7a11-b57e-9dd4dfcc0fa4

## What it does

- Explains an app's workflow as both a plain-English and technical map, then summarizes its core data model in a simple entity relationship diagram.
- Finds adjustable business values such as prices, discounts, thresholds, and fees.
- Lets users choose a local project folder or a public GitHub repository as the project source.
- Keeps the current app connected while users choose a second local or GitHub project for side-by-side interface comparison.
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

To test the platform locally, please provide below environment variables in .env.local:
You need to provide at least one of them, but the models that will be working will be the ones associated with the API key:
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GEMINI_API_KEY
- DASHSCOPE_API_KEY
- MOONSHOT_API_KEY

Please provide a default model of your choice:
- DEFAULT_AI_MODEL

For authentication purposes:
- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
- CLERK_SECRET_KEY

You do not need to provide the vercel API key

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

Authentication is required for `/workspace`, `/demo`, `/settings`, and every AI endpoint. Create a Clerk application, copy `.env.example` to `.env.local`, and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` plus `CLERK_SECRET_KEY`; real values must never be committed. The public tutorial, About redirect, Help center, sign-in, and sign-up routes remain public. AI features additionally require at least one configured provider key. The cost-conscious model selector supports OpenAI, Anthropic, Google, Moonshot AI, and Alibaba Cloud, with GPT-5.6 Luna as the default and compact prices in `USD input / output per 1M tokens` format.

### Vercel deployment

The hosted application targets Vercel's native Next.js runtime. Connect the GitHub repository to a Vercel project, review a Preview deployment first, and promote an approved build to Production only when the platform is ready.

Configure these server-side Production values as encrypted Vercel environment variables; never commit or expose their values:

- `CLERK_SECRET_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `MOONSHOT_API_KEY`
- `DASHSCOPE_API_KEY`

Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as the Clerk browser identifier, then set the four Clerk route variables from `.env.example`. In the Clerk dashboard, add the Vercel Preview and Production domains as allowed origins/redirects. Workspace routes and AI APIs fail closed when a valid Clerk session is absent.

### Hardware

- Minimum: dual-core CPU, 4 GB RAM, and 300 MB free disk space
- Recommended for development: 4-core CPU, 8 GB RAM, and 1 GB free disk space
- Screen support: 320 px-wide phones through large desktop displays
- Internet access is only required to install dependencies or deploy the site

The interface uses a desktop sidebar, fluid content grids, touch-friendly controls, and a compact mobile navigation bar. Reduced-motion preferences and keyboard focus states are supported.

## Components

### User-facing product

- **Private accounts and sessions** — Clerk provides sign-in, sign-up, managed secure cookies, account switching, and sign-out. Workspace, demo, settings, model availability, navigation generation, and Change Assistant requests each enforce authentication on the server rather than relying on hidden client controls.
- **Guided welcome page** — explains what VCAIST is for, walks through its four-step safety loop, and offers both a demo and a direct path into the user's own project.
- **Direct workspace** — skips the tutorial and demo, opens the project-source chooser immediately, and accepts a local folder or public GitHub repository.
- **Workspace views** — Overview, Current Application, Compare, App map, and Safety tests each begin with a plain-language explanation of the page and three useful actions. Overview contains the program summary, complete feature index, and end-to-end example story.
- **Current Application** — focuses only on the connected app itself: a responsive carousel of detected routes and a consent-first AI change chat. Static HTML runs in a network-isolated sandbox; framework routes receive source-backed visual reconstructions assembled from page metadata, imported interface components, styles, actions, navigation, and approved images. The assistant stays locked until the user grants permission and asks separately before creating a sandbox draft.
- **Project importer** — one source chooser for local directories and public GitHub repositories, with an explicit indexing state and clear completion message.
- **Device-local scan cache** — fingerprints supported file metadata so an unchanged project can skip repeat indexing on the same browser for 30 days. Source contents are never stored in the cache, and browsers still require the user to select a local folder again for privacy.
- **Compare** — keeps the connected app visible in its own carousel and lets the user select a second app from a local folder or GitHub. The comparison app opens in an independent carousel so matching pages can be reviewed side by side.
- **Live sandbox** — re-runs the connected pricing function without touching live customers or production data.
- **App map** — toggles between a plain-English purchase flow and the corresponding technical path. Every workflow step opens its mapped file in a line-numbered, read-only source workspace. A simplified conceptual entity relationship diagram uses rectangles for the four core entities, diamonds for relationships, ovals for important attributes, and one/many cardinality labels. A failing workflow module and its source file are highlighted in red, followed by a warning beneath the diagram with a direct link to Safety Tests. The longer entity dictionary has been removed.
- **Safety tests** — presents a searchable, clickable system-wide findings list instead of only customer-facing edge cases. It combines the executed zero-quantity pricing check with guided code and architecture review for input-length limits, rate limiting, client/server trust boundaries, payment idempotency, object authorization, error disclosure, and webhook verification. Every finding opens full evidence, failure or attack scenarios, affected systems, and recommended protections.
- **Help center** — quick-start instructions and plain-language answers to common trust and safety questions.
- **Settings** — a tiered model-and-price comparison, scan behavior, test coverage, explanation preferences, and four persistent color themes saved locally on the device. Midnight Clay is the black-background default, with Midnight Sky, Forest Mint, and Warm Light alternatives. Shared semantic surfaces and WCAG-informed contrast tokens keep labels, status colors, boundaries, and controls legible in every theme. Model prices are presented per one million input/output tokens and include a visible date and provider-pricing caveat.

### Implementation

- `proxy.ts` — initializes Clerk request authentication for application and API routes
- `app/sign-in/` and `app/sign-up/` — responsive account entry routes
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

Folder and repository imports remain session-only inside the authenticated browser workspace: local files stay in browser memory and GitHub imports read the public repository tree. VCAIST does not currently maintain a shared project database, so there is no cross-account project collection to enumerate or query. Current Application renders approved static interfaces when available and reconstructs framework pages without executing an arbitrary production build; server-only behavior and build-time transformations therefore remain outside the preview. The Change Assistant creates an Original/Proposed visual sandbox after explicit approval but does not edit connected source files. Durable user-scoped project storage, private GitHub access, patch generation, and approval-based publishing remain future backend milestones; any future persistence must store the Clerk user ID as the owner and enforce that ownership again in the data-access layer.

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
