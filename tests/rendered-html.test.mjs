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
  isSourcePath,
  parseGitHubRepositoryUrl,
  summarizeProjectFiles,
} from "../lib/import-sources.ts";
import {
  defaultPreferences,
  modelOptions,
  themeOptions,
} from "../lib/preferences.ts";

const templateRoot = new URL("../", import.meta.url);

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
  assert.match(html, /Start with the big picture/);
  assert.match(html, /Check app health/);
  assert.match(html, /Try a sample order/);
  assert.match(html, /Business controls/);
  assert.match(html, /Change project source/);
  assert.match(html, /A zero-item order pays the customer/);
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

test("uses semantic, high-contrast surfaces throughout every theme", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.source-preview button \{[\s\S]*?color: var\(--ink\);[\s\S]*?background: var\(--surface\);/);
  assert.match(css, /\.source-preview strong \{[\s\S]*?color: var\(--ink\);/);
  assert.match(css, /\.demo-button \{[\s\S]*?color: var\(--accent-contrast\);[\s\S]*?var\(--green\)/);
  assert.match(css, /\.lesson-control \{[\s\S]*?background: var\(--surface\);/);
  assert.match(css, /\.order-result \{[\s\S]*?background: var\(--green-soft\);/);
  assert.match(css, /\.issue-panel \{[\s\S]*?var\(--coral-soft\)[\s\S]*?var\(--surface\)/);
  assert.match(css, /\.program-feature-grid article \{[\s\S]*?background: var\(--surface-soft\);/);
  assert.match(css, /--line-strong: #7c8982;/);
});

test("explains every workspace view immediately below its tab", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /Start with the big picture/);
  assert.match(source, /See which business rules move the numbers/);
  assert.match(source, /Follow one customer action through the app/);
  assert.match(source, /Understand edge cases before customers find them/);
  assert.match(source, /<WorkspaceViewIntroduction view=\{view\} \/>/);
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
