import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateBusinessSnapshot,
  defaultKnobs,
  runSamplePricing,
  stressTest,
} from "../lib/pricing.ts";
import {
  cleanProjectName,
  createGitignorePolicy,
  evaluateProjectPaths,
  isSensitiveProjectPath,
  isSourcePath,
  parseGitHubRepositoryUrl,
  summarizeProjectFiles,
  summarizeProjectFilesSafely,
} from "../lib/import-sources.ts";
import { analyzeProjectSources } from "../lib/project-analysis.ts";
import {
  defaultPreferences,
  modelOptions,
  themeOptions,
} from "../lib/preferences.ts";
import { modelRegistry } from "../lib/ai/model-registry.ts";

const templateRoot = new URL("../", import.meta.url);

test("builds a portfolio manifest instead of reusing the financial demo", () => {
  const analysis = analyzeProjectSources({
    name: "Personal Portfolio Website",
    sourcePaths: ["package.json", "src/App.tsx"],
    documents: [
      { path: "package.json", content: '{"dependencies":{"react":"19","vite":"7"}}' },
      {
        path: "src/App.tsx",
        content: `<nav><a href="#projects">Projects</a><a href="#contact">Contact</a></nav>
          <main><h1>Zavier Portfolio</h1><section id="projects"><h2>Selected Work</h2></section>
          <section id="contact"><h2>Contact Me</h2></section></main>`,
      },
    ],
  });

  assert.equal(analysis.kind, "portfolio");
  assert.equal(analysis.framework, "React + Vite");
  assert.deepEqual(analysis.pages.map((page) => page.route), ["/", "/#projects", "/#contact"]);
  assert.ok(analysis.entities.some((entity) => entity.name === "Project"));
  assert.ok(analysis.workflow.every((step) => step.filePath === "src/App.tsx"));
  assert.match(analysis.overview.purpose, /background, experience, work, and contact paths/i);
  assert.match(analysis.overview.storyTitle, /explores Zavier Portfolio’s work/i);
  assert.ok(["hub", "network"].includes(analysis.navigationGraph.layout));
  assert.doesNotMatch(JSON.stringify(analysis), /ShopSpring|checkout|shopping cart|Stripe/i);
});

test("renders approved static HTML as a real isolated interface", () => {
  const analysis = analyzeProjectSources({
    name: "Zavier Portfolio",
    sourcePaths: ["index.html", "styles.css"],
    documents: [
      { path: "styles.css", content: "body{background:#101615;color:#f7f2ec}.hero{display:grid}" },
      { path: "index.html", content: `<!doctype html><html><head><script>alert('no')</script></head><body onclick="steal()"><nav><a href="#experience">Experience</a><a href="#contact">Contact</a></nav><main class="hero"><h1>Zavier Rahmansyah</h1><section id="experience"><h2>Experience</h2></section><section id="contact"><h2>Contact</h2></section></main></body></html>` },
    ],
  });
  const preview = analysis.pages[0].previewHtml ?? "";
  assert.match(preview, /Zavier Rahmansyah/);
  assert.match(preview, /body\{background:#101615/);
  assert.match(preview, /Content-Security-Policy/);
  assert.doesNotMatch(preview, /<script|onclick=|steal\(\)|alert\('no'\)/i);
  assert.deepEqual(analysis.navigationGraph.edges.map((edge) => edge.label), ["Experience", "Contact"]);
});

test("reads only approved source after privacy exclusions", async () => {
  const reads = new Map();
  const file = (path, content) => ({
    name: path.split("/").at(-1),
    webkitRelativePath: `Portfolio/${path}`,
    size: content.length,
    lastModified: 1,
    async text() {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return content;
    },
  });
  const summary = await summarizeProjectFilesSafely([
    file(".gitignore", ".env.local\nsrc/ignored.ts\n"),
    file(".env.local", "OPENAI_API_KEY=must-not-be-read"),
    file("src/ignored.ts", "const privateDraft = true"),
    file("src/App.tsx", "<main><h1>My Portfolio</h1><section id=\"projects\"><h2>Projects</h2></section></main>"),
    file("package.json", '{"dependencies":{"react":"19","vite":"7"}}'),
  ]);

  assert.equal(reads.get(".gitignore"), 1);
  assert.equal(reads.has(".env.local"), false);
  assert.equal(reads.has("src/ignored.ts"), false);
  assert.equal(reads.get("src/App.tsx"), 1);
  assert.equal(summary.analysis.kind, "portfolio");
  assert.deepEqual(summary.analysis.indexedFilePaths.sort(), ["package.json", "src/App.tsx"]);
});

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function requestWorker(pathname, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}-api`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the VCAIST tutorial as the home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Welcome · VCAIST<\/title>/i);
  assert.match(html, /data-theme="midnight-clay"/);
  assert.match(html, /Understand the app you built/);
  assert.match(html, /Four steps from/);
  assert.match(html, /Take a demo/);
  assert.doesNotMatch(html, /Take the financial demo/);
  assert.match(html, /href="\/demo"/);
  assert.match(html, /Try with your own project/);
  assert.match(html, /href="\/workspace"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("server-renders a direct workspace with the project chooser", async () => {
  const response = await render("/workspace");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Your workspace · VCAIST<\/title>/i);
  assert.match(html, /Start with your own project/);
  assert.match(html, /Try VCAIST with the app you already have/);
  assert.match(html, /Where is your project\?/);
  assert.match(html, /Local folder/);
  assert.match(html, /Google Drive/);
  assert.match(html, /GitHub/);
  assert.doesNotMatch(html, /ShopSpring is connected/);
});

test("server-renders the interactive financial demo separately", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Financial demo · VCAIST<\/title>/i);
  assert.match(html, /Your app control room/);
  assert.match(html, /Understand the platform before exploring the app/);
  assert.match(html, /Current Application/);
  assert.match(html, /Understand the purpose/);
  assert.match(html, /Follow the example story/);
  assert.match(html, /Change project source/);
  assert.match(html, /PROGRAM OVERVIEW/);
  assert.match(html, /Understand an app without becoming its engineer/);
  assert.match(html, /Choose your source/);
  assert.match(html, /Maya needs to understand a checkout/);
  assert.match(html, /Project-specific AI extraction/);
  assert.match(html, /GPT-5\.6 Sol/);
  assert.match(html, /GPT-5\.6 Terra/);
  assert.match(html, /GPT-5\.6 Luna/);
  assert.match(html, /Claude Sonnet 5/);
  assert.match(html, /Gemini 3\.5 Flash/);
  assert.match(html, /Kimi K2\.7 Code/);
  assert.match(html, /Qwen3\.7 Max/);
  assert.match(html, /Qwen3\.7 Plus/);
  assert.match(html, /USD/);
  assert.match(html, /per 1M tokens/);
  assert.doesNotMatch(html, /Four steps from/);
});

test("server-renders the help and settings routes", async () => {
  const [helpResponse, settingsResponse] = await Promise.all([
    render("/help"),
    render("/settings"),
  ]);

  assert.equal(helpResponse.status, 200);
  assert.equal(settingsResponse.status, 200);

  const [helpHtml, settingsHtml] = await Promise.all([
    helpResponse.text(),
    settingsResponse.text(),
  ]);
  assert.match(helpHtml, /Get comfortable with your app/);
  assert.match(helpHtml, /Your first VCAIST check/);
  assert.match(settingsHtml, /Make VCAIST work your way/);
  assert.match(settingsHtml, /Plain language first/);
  assert.match(settingsHtml, /Color &amp; appearance/);
  assert.match(settingsHtml, /Midnight Clay/);
  assert.match(settingsHtml, /Midnight Sky/);
  assert.match(settingsHtml, /Frontier · capable, usually overkill/);
  assert.match(settingsHtml, /Workhorse · recommended for VCAIST/);
  assert.match(settingsHtml, /GPT-5\.5 Pro/);
  assert.match(settingsHtml, /Claude Fable 5/);
  assert.match(settingsHtml, /Claude Sonnet 5/);
  assert.match(settingsHtml, /Gemini 3\.1 Pro/);
  assert.match(settingsHtml, /Gemini 3\.5 Flash/);
  assert.match(settingsHtml, /Kimi K2\.7 Code/);
  assert.match(settingsHtml, /Qwen3\.7 Max/);
  assert.match(settingsHtml, /Qwen3\.7 Plus/);
  assert.match(settingsHtml, /Prices are public list prices/);
});

test("routes About back to the starting tutorial page", async () => {
  const response = await render("/about");
  assert.ok([302, 307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/");

  const chrome = await readFile(new URL("../app/components/AppChrome.tsx", import.meta.url), "utf8");
  const onboarding = await readFile(new URL("../app/Onboarding.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(chrome, /id: "about", href: "\/about", label: "About"/);
  assert.match(onboarding, /<Link href="\/about">About<\/Link>/);
  assert.match(css, /\.mobile-nav \{[\s\S]*?grid-template-columns: repeat\(4, 1fr\);/);
});

test("offers the complete supported model and appearance catalogs", () => {
  assert.deepEqual(modelOptions.map((model) => model.id), [
    "gpt-5.5-pro",
    "claude-fable-5",
    "gpt-5.6-sol",
    "claude-opus-4.8",
    "qwen3.7-max",
    "claude-sonnet-5",
    "gemini-3.1-pro",
    "gpt-5.6-terra",
    "gpt-5.4",
    "gemini-3.5-flash",
    "kimi-k2.7-code",
    "qwen3.7-plus",
    "gpt-5.6-luna",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
  ]);
  assert.equal(defaultPreferences.model, "claude-sonnet-5");
  assert.equal(defaultPreferences.theme, "midnight-clay");
  assert.equal(themeOptions.length, 4);
  assert.ok(modelOptions.every((model) => /^\$[\d.]+ \/ \$[\d.]+$/.test(model.menuPrice)));
  assert.doesNotMatch(modelOptions.map((model) => model.menuPrice).join(" "), /intro|standard|Sep|>/i);
});

test("routes every verified dropdown model through a server-only provider registry", async () => {
  assert.deepEqual(Object.keys(modelRegistry).sort(), modelOptions.map((model) => model.id).sort());
  assert.deepEqual(new Set(Object.values(modelRegistry).map((model) => model.requiredSecret)), new Set([
    "MOONSHOT_API_KEY",
    "DASHSCOPE_API_KEY",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
  ]));
  assert.equal(modelRegistry["kimi-k2.7-code"].enabled, false);

  const [dashboard, router, modelsRoute, chatRoute] = await Promise.all([
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai/router.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/models/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/chat/route.ts", import.meta.url), "utf8"),
  ]);
  const clientSource = `${dashboard}\n${await readFile(new URL("../lib/preferences.ts", import.meta.url), "utf8")}`;
  assert.doesNotMatch(clientSource, /(?:OPENAI|ANTHROPIC|GEMINI|DASHSCOPE|MOONSHOT)_API_KEY/);
  assert.doesNotMatch(`${router}\n${modelsRoute}\n${chatRoute}`, /NEXT_PUBLIC_/);
  assert.match(dashboard, /fetch\("\/api\/ai\/models"/);
  assert.match(dashboard, /fetch\("\/api\/ai\/chat"/);
  assert.match(dashboard, /This model is currently unavailable\. Please select another AI model\./);
  assert.match(chatRoute, /maximumMessageCharacters = 4_000/);
  assert.match(chatRoute, /checkAiRateLimit/);

  const modelsResponse = await requestWorker("/api/ai/models", { headers: { accept: "application/json" } });
  assert.equal(modelsResponse.status, 200);
  const availability = await modelsResponse.json();
  assert.ok(Array.isArray(availability.models));
  assert.ok(availability.models.every((entry) => typeof entry.id === "string" && typeof entry.available === "boolean"));
  assert.doesNotMatch(JSON.stringify(availability), /_API_KEY|Bearer|sk-/i);

  const unavailableResponse = await requestWorker("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({
      model: "not-a-real-model",
      project: "Synthetic project",
      page: "Home (/)",
      messages: [{ role: "user", text: "Make the heading clearer." }],
    }),
  });
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), {
    code: "MODEL_UNAVAILABLE",
    message: "This model is currently unavailable. Please select another AI model.",
  });
});

test("uses semantic, high-contrast surfaces throughout every theme", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.source-preview button \{[\s\S]*?color: var\(--ink\);[\s\S]*?background: var\(--surface\);/);
  assert.match(css, /\.source-preview strong \{[\s\S]*?color: var\(--ink\);/);
  assert.match(css, /\.demo-button \{[\s\S]*?color: var\(--accent-contrast\);[\s\S]*?var\(--green\)/);
  assert.match(css, /\.lesson-control \{[\s\S]*?background: var\(--surface\);/);
  assert.match(css, /\.application-carousel-stage \{[\s\S]*?background: var\(--surface-soft\);/);
  assert.match(css, /\.ai-change-chat \{[\s\S]*?var\(--surface-soft\)[\s\S]*?var\(--surface\)/);
  assert.match(css, /\.program-feature-grid article \{[\s\S]*?background: var\(--surface-soft\);/);
  assert.match(css, /--line-strong: #7c8982;/);
});

test("explains every workspace view immediately below its tab", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /Understand the platform before exploring the app/);
  assert.match(source, /See every page before deciding what to change/);
  assert.match(source, /Compare your current app with another app/);
  assert.match(source, /Follow the workflow, source code, and data relationships/);
  assert.match(source, /Review safety from customer input to system architecture/);
  assert.match(source, /<WorkspaceViewIntroduction view=\{view\} \/>/);
  assert.match(source, /<WorkspaceViewIntroduction view=\{view\} \/> : null\}\s*\{projectReady && view === "overview" \? <ProgramOverview project=\{project\} \/> : null\}\s*\{projectConnected \?/);
  assert.equal(source.match(/<ProgramOverview project=\{project\} \/>/g)?.length, 1);
});

test("keeps workspace page tabs free of confusing numeric badges", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /count\?: number|option\.count|issueCount|tab-count/);
  assert.doesNotMatch(css, /\.tab-count/);
});

test("keeps Current Application focused on its consent-first page carousel", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /id: "application", label: "Current Application"/);
  assert.match(source, /aria-roledescription="carousel"/);
  assert.match(source, /Home[\s\S]*Catalog[\s\S]*Cart[\s\S]*Checkout/);
  assert.match(source, /function CurrentApplication[\s\S]*?<ApplicationCarousel project=\{project\} model=\{model\} onModelUnavailable=\{onModelUnavailable\} \/>/);
  assert.doesNotMatch(source, /function Overview\(/);
  assert.doesNotMatch(source, /APPLICATION INTELLIGENCE|Est\. monthly revenue|What happens when an order changes|A zero-item order pays the customer|function MetricCard|function CompactKnob/);
  assert.match(source, /May I help plan changes to this application\?/);
  assert.match(source, /Allow change planning/);
  assert.match(source, /Approve sandbox draft/);
  assert.match(source, /This prototype does not edit connected source files yet/);
  assert.match(source, /className="imported-interface-frame"[\s\S]*srcDoc=\{page\.previewHtml\}[\s\S]*sandbox=""[\s\S]*referrerPolicy="no-referrer"/);
  assert.match(source, /This is the imported static interface/);
});

test("makes Overview and App Map specific to the selected application", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  const analysis = await readFile(new URL("../lib/project-analysis.ts", import.meta.url), "utf8");
  const graphRoute = await readFile(new URL("../app/api/ai/navigation-graph/route.ts", import.meta.url), "utf8");
  assert.match(source, /APPLICATION OVERVIEW/);
  assert.match(source, /analysis\?\.overview\.purpose/);
  assert.match(source, /analysis\?\.overview\.features/);
  assert.match(source, /analysis\?\.overview\.storyTitle/);
  assert.match(source, /analysis\?\.overview\.storySteps\.map/);
  assert.match(source, /<ApplicationNavigationGraph graph=\{graph\}/);
  assert.match(source, /This map describes available routes and links, not a forced sequence/);
  assert.match(analysis, /buildSourceNavigationGraph/);
  assert.match(graphRoute, /free choice among hub, radial, layers, or network layout/i);
  assert.match(graphRoute, /Never invent a page, route, file, feature, database, or security result/);
  assert.match(graphRoute, /canonicalNodes/);
  assert.doesNotMatch(graphRoute, /source code|document\.content|previewHtml/);
});

test("replaces Controls with a two-application carousel comparison", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  const importer = await readFile(new URL("../app/components/ImportProjectDialog.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /type WorkspaceView = "overview" \| "application" \| "compare" \| "map" \| "tests"/);
  assert.match(source, /id: "compare", label: "Compare"/);
  assert.match(source, /id: "map", label: "App Map"/);
  assert.match(source, /id: "tests", label: "Safety Tests"/);
  assert.match(css, /\.view-introduction\.compare \{[\s\S]*?--view-accent: var\(--verified-green\);[\s\S]*?--view-soft: var\(--verified-green-soft\);[\s\S]*?--view-contrast: var\(--verified-green-contrast\);/);
  assert.doesNotMatch(source, /id: "controls", label: "Controls"/);
  assert.match(source, /<CompareApplications[\s\S]*currentProject=\{project\}[\s\S]*comparisonProject=\{comparisonProject\}/);
  assert.match(source, /<ComparisonAppCarousel project=\{currentProject\}[\s\S]*<ComparisonAppCarousel project=\{comparisonProject\}/);
  assert.match(source, /function ApplicationInterfaceCarousel[\s\S]*aria-roledescription="carousel"/);
  assert.match(source, /Which app would you like to compare\?/);
  assert.match(source, /setComparisonProject\(nextProject\)/);
  assert.match(source, /Local folder[\s\S]*Google Drive[\s\S]*GitHub/);
  assert.doesNotMatch(source, /function Controls\(|function FullKnob\(/);
  const compareComponent = source.match(/function CompareApplications[\s\S]*?(?=function ComparisonAppCarousel)/)?.[0] ?? "";
  assert.doesNotMatch(compareComponent, /AiChangeAssistant|range-input|monthly revenue|Estimated margin/);
  assert.match(importer, /eyebrow = "PROJECT SOURCE"[\s\S]*title = "Where is your project\?"[\s\S]*description =/);
  assert.match(css, /\.compare-carousel-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 1180px\) \{[\s\S]*?\.compare-carousel-grid \{ grid-template-columns: 1fr; \}/);
});

test("opens App Map steps in a read-only source workspace", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /Inspect workflow source, read the entity relationship diagram/);
  assert.match(source, /className=\{`flow-step\$\{selectedStep === index \? " selected" : ""\}\$\{hasRuntimeError \? " error" : ""\}`\}/);
  assert.match(source, /onClick=\{\(\) => setSelectedStep\(index\)\}/);
  assert.match(source, /<SourceCodeWorkspace project=\{project\} steps=\{steps\} selectedStep=\{selectedStep\} onSelect=\{setSelectedStep\} runtimeErrorCount=\{runtimeErrorCount\} \/>/);
  assert.match(source, /CartPage\.tsx[\s\S]*pricing\.ts[\s\S]*route\.ts[\s\S]*stripe\.ts/);
  assert.match(source, /This workspace can inspect files, but it cannot edit or save them/);
  assert.match(css, /\.source-workspace \{[\s\S]*?background: var\(--surface-soft\);/);
  assert.match(css, /\.source-code-line\.highlighted \{[\s\S]*?var\(--blue-soft\)/);
});

test("shows a simple ERD and directs red-highlighted program errors to Safety Tests", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /What is an entity relationship diagram\?/);
  assert.match(source, /Rectangles are entities[\s\S]*diamonds are relationships[\s\S]*ovals are important attributes/);
  assert.match(source, /name: "Customer"[\s\S]*name: "Order"[\s\S]*name: "Order Item"[\s\S]*name: "Product"/);
  assert.match(source, /name: "places"[\s\S]*name: "contains"[\s\S]*name: "references"/);
  assert.match(source, /relationships\.map[\s\S]*<ChenEntity name=\{from\.name\}[\s\S]*<ChenRelationship[\s\S]*<ChenEntity name=\{to\.name\}/);
  assert.doesNotMatch(source, /ENTITY DICTIONARY/);
  assert.doesNotMatch(source, /appEntities\.map/);
  assert.match(source, /PROGRAM ERROR DETECTED/);
  assert.match(source, /className="map-diagnostic-alert error" role="alert"/);
  assert.match(source, /Runtime <strong>[\s\S]*Compile-time <strong>/);
  assert.match(source, /onClick=\{onOpenSafetyTests\}>Open Safety Tests/);
  assert.match(source, /step\.filePath === "lib\/pricing\.ts"/);
  assert.match(source, /flow-step\$\{selectedStep === index[\s\S]*hasRuntimeError \? " error"/);
  assert.match(source, /<\/figure>\s*\{hasErrors \? \(/);
  assert.match(source, /setView\("tests"\)/);
  assert.match(css, /\.map-diagnostic-alert\.error \{[\s\S]*?border: 2px solid var\(--coral\);/);
  assert.match(css, /\.flow-step\.error,[\s\S]*?border: 2px solid var\(--coral\);/);
  assert.match(css, /\.source-file-list button\.has-error[\s\S]*?var\(--coral-soft\)/);
  assert.match(css, /\.chen-entity-node \{[\s\S]*?background: var\(--blue\);/);
  assert.match(css, /\.chen-relationship-node > span \{[\s\S]*?transform: rotate\(45deg\);/);
  assert.match(css, /\.chen-attributes > span \{[\s\S]*?border-radius: 50%;/);
  assert.match(css, /\.erd-section \{[\s\S]*?grid-column: 1 \/ -1;/);
});

test("presents system-wide safety and security findings as an interactive list", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /SYSTEM-WIDE SAFETY REVIEW/);
  assert.match(source, /Oversized text has no enforced limit/);
  assert.match(source, /Checkout has no rate limit or usage quota/);
  assert.match(source, /Payment amount can cross the client trust boundary/);
  assert.match(source, /Payment retries are not idempotent/);
  assert.match(source, /Order lookup does not prove ownership/);
  assert.match(source, /Internal error details can reach clients/);
  assert.match(source, /Payment webhook verifies its signature/);
  assert.match(source, /placeholder="Search risks or systems"/);
  assert.match(source, /onClick=\{\(\) => setSelectedFindingId\(finding\.id\)\}/);
  assert.match(source, /HOW VCAIST CHECKED[\s\S]*EVIDENCE[\s\S]*FAILURE OR ATTACK SCENARIO[\s\S]*BUSINESS AND SYSTEM IMPACT/);
  assert.match(source, /Only privacy-boundary results and high-confidence patterns found in this project/);
  assert.match(source, /Imported code was not executed/);
  assert.match(source, /safetySeverityPriority\[left\.severity\] - safetySeverityPriority\[right\.severity\]/);
  assert.match(source, /Highest priority first/);
  assert.match(source, /Critical risks appear before high and medium findings; verified protections stay at the bottom/);
  assert.match(css, /\.safety-finding-list button\.selected \{[\s\S]*?var\(--coral-soft\)/);
  assert.match(css, /\.safety-detail-panel \{[\s\S]*?position: sticky;/);
  assert.match(css, /--verified-green: #61d6a5;/);
  assert.match(css, /\.finding-severity-icon\.verified \{ color: var\(--verified-green-contrast\); background: var\(--verified-green\); \}/);
  assert.match(css, /\.finding-severity-pill\.verified \{[\s\S]*?color: var\(--verified-green\);[\s\S]*?background: var\(--verified-green-soft\);/);
});

test("preserves the original README roadmap and core-loop brief", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /## What comes After/);
  assert.match(readme, /dynamic user interface that is easy to understand/);
  assert.match(readme, /help page and settings page/);
  assert.match(readme, /## Example of Core Loop/);
  assert.match(readme, /built backwards from the emotional moment/);
  assert.match(readme, /quantity 0 it charges negative money/);
});

test("pricing sandbox exposes the sample app's real zero-quantity defect", () => {
  const emptyOrder = runSamplePricing(0, defaultKnobs);
  assert.equal(emptyOrder.total, -6.99);

  const discountedOrder = runSamplePricing(5, defaultKnobs);
  assert.equal(discountedOrder.total, 189.01);

  const results = stressTest(defaultKnobs);
  assert.equal(results.length, 5);
  assert.equal(results.filter((result) => !result.passed).length, 1);
  assert.equal(results.find((result) => !result.passed)?.quantity, 0);
});

test("business snapshot changes when a discovered control changes", () => {
  const original = calculateBusinessSnapshot(defaultKnobs);
  const changed = calculateBusinessSnapshot({ ...defaultKnobs, basePrice: 60 });
  assert.ok(changed.revenue > original.revenue);
  assert.notEqual(changed.averageOrder, original.averageOrder);
});

test("validates folder and GitHub project sources", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/openai/codex.git"), {
    owner: "openai",
    repo: "codex",
  });
  assert.deepEqual(parseGitHubRepositoryUrl("github.com/example/my-app/tree/main"), {
    owner: "example",
    repo: "my-app",
  });
  assert.equal(parseGitHubRepositoryUrl("https://example.com/owner/repo"), null);
  assert.equal(isSourcePath("src/components/App.tsx"), true);
  assert.equal(isSourcePath("node_modules/package/index.js"), false);
  assert.equal(isSourcePath("public/photo.png"), false);
  assert.equal(cleanProjectName("my-great_app"), "My Great App");
});

test("blocks ignored environment and secret files before project analysis", async () => {
  const rootPolicy = createGitignorePolicy(".gitignore", [
    ".env*",
    "secrets/",
    "config/private.json",
    "generated/",
    "archives/**/secret[0-9].json",
  ].join("\n"));
  const nestedPolicy = createGitignorePolicy("packages/admin/.gitignore", "private/*.ts");
  const evaluation = evaluateProjectPaths([
    "src/app.ts",
    "src/view.tsx",
    ".env.local",
    "secrets/token.json",
    "config/private.json",
    "config/exposed.credentials.json",
    "generated/client.ts",
    "archives/secret1.json",
    "archives/2026/secret2.json",
    "packages/admin/private/session.ts",
    "packages/admin/public/page.ts",
  ], [rootPolicy, nestedPolicy]);

  assert.deepEqual(evaluation.sourcePaths, ["src/app.ts", "src/view.tsx", "packages/admin/public/page.ts"]);
  assert.equal(evaluation.privacy.policyStatus, "enforced");
  assert.equal(evaluation.privacy.gitignoreRuleCount, 6);
  assert.equal(evaluation.privacy.excludedFileCount, 8);
  assert.equal(evaluation.privacy.exposedSecretFileCount, 1);
  assert.equal(isSensitiveProjectPath(".env.production"), true);
  assert.equal(isSensitiveProjectPath("certificates/signing.key"), true);
  assert.equal(isSensitiveProjectPath("src/config.ts"), false);

  const importer = await readFile(new URL("../app/components/ImportProjectDialog.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(importer, /summarizeProjectFilesSafely/);
  assert.match(importer, /path\.split\("\/"\)\.at\(-1\)\?\.toLowerCase\(\) === "\.gitignore"/);
  assert.match(importer, /Ignored environment and secret files are never inspected/);
  assert.match(importer, /repository is too large to verify every \.gitignore policy safely/);
  assert.match(importer, /Drive folder is too large to verify every \.gitignore policy safely/);
  assert.match(dashboard, /severity: "critical"[\s\S]*Sensitive configuration is not protected by \.gitignore/);
  assert.match(dashboard, /File contents were not read, indexed, cached, logged, or sent to an AI provider/);
  assert.match(dashboard, /Review Critical Safety Test/);
});

test("fingerprints local projects so unchanged folders can reuse the scan cache", () => {
  const original = [
    { name: "app.ts", webkitRelativePath: "sample/src/app.ts", size: 120, lastModified: 1000 },
    { name: "photo.png", webkitRelativePath: "sample/public/photo.png", size: 999, lastModified: 1000 },
  ];
  const unchanged = original.map((file) => ({ ...file }));
  const changed = original.map((file, index) => index === 0 ? { ...file, lastModified: 2000 } : { ...file });

  const firstSummary = summarizeProjectFiles(original);
  assert.equal(firstSummary.fileCount, 1);
  assert.equal(summarizeProjectFiles(unchanged).cacheKey, firstSummary.cacheKey);
  assert.notEqual(summarizeProjectFiles(changed).cacheKey, firstSummary.cacheKey);
});

test("removes the temporary starter preview", async () => {
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("targets Vercel's native Next.js runtime without uploading local secrets", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const vercelIgnore = await readFile(new URL("../.vercelignore", import.meta.url), "utf8");

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.equal(packageJson.devDependencies?.vinext, undefined);
  assert.match(vercelIgnore, /^\.env\*$/m);
  assert.match(vercelIgnore, /^\.openai$/m);
  await assert.rejects(access(new URL("../vite.config.ts", templateRoot)));
  await assert.rejects(access(new URL("../worker/index.ts", templateRoot)));
  await assert.rejects(access(new URL("../db/index.ts", templateRoot)));
});
