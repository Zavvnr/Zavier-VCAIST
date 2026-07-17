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
} from "../lib/import-sources.ts";

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
  assert.match(html, /Understand the app you built/);
  assert.match(html, /Four steps from/);
  assert.match(html, /Take the financial demo/);
  assert.match(html, /href="\/demo"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("server-renders the interactive financial demo separately", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Financial demo · VCAIST<\/title>/i);
  assert.match(html, /Your app control room/);
  assert.match(html, /Business controls/);
  assert.match(html, /Change project source/);
  assert.match(html, /A zero-item order pays the customer/);
  assert.match(html, /VCAIST Core · GPT-5\.4/);
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

test("removes the temporary starter preview", async () => {
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});
