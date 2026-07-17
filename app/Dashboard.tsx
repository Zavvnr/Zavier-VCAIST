"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AppChrome } from "./components/AppChrome";
import { ImportProjectDialog } from "./components/ImportProjectDialog";
import type { ImportedProject } from "@/lib/import-sources";
import {
  calculateBusinessSnapshot,
  defaultKnobs,
  runSamplePricing,
  stressTest,
  type PricingKnobs,
} from "@/lib/pricing";

type WorkspaceView = "overview" | "controls" | "map" | "tests";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const preciseMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const viewOptions: Array<{ id: WorkspaceView; label: string; count?: number }> = [
  { id: "overview", label: "Overview" },
  { id: "controls", label: "Controls", count: 4 },
  { id: "map", label: "App map" },
  { id: "tests", label: "Safety tests", count: 1 },
];

export function Dashboard({ startWithImporter = false }: { startWithImporter?: boolean }) {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [knobs, setKnobs] = useState<PricingKnobs>(defaultKnobs);
  const [quantity, setQuantity] = useState(3);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState(
    startWithImporter ? "Choose a project source to begin" : "Demo app · Last checked 2 minutes ago",
  );
  const [mapMode, setMapMode] = useState<"plain" | "technical">("plain");
  const [importOpen, setImportOpen] = useState(startWithImporter);
  const [project, setProject] = useState<ImportedProject>(startWithImporter
    ? {
        name: "Your project",
        fileCount: 0,
        source: "demo",
        sourceLabel: "Not connected",
      }
    : {
        name: "ShopSpring",
        fileCount: 27,
        source: "demo",
        sourceLabel: "Demo app",
      });
  const projectConnected = project.fileCount > 0;

  const snapshot = useMemo(() => calculateBusinessSnapshot(knobs), [knobs]);
  const currentOrder = useMemo(
    () => runSamplePricing(quantity, knobs),
    [quantity, knobs],
  );
  const testResults = useMemo(() => stressTest(knobs), [knobs]);
  const issueCount = testResults.filter((result) => !result.passed).length;
  const chartValues = [1, 2, 3, 4, 5, 6].map((itemQuantity) => ({
    quantity: itemQuantity,
    total: Math.max(0, runSamplePricing(itemQuantity, knobs).total),
  }));
  const chartMax = Math.max(...chartValues.map((item) => item.total), 1);

  function updateKnob<K extends keyof PricingKnobs>(key: K, value: number) {
    setKnobs((current) => ({ ...current, [key]: value }));
  }

  function scan(nextProject: ImportedProject = project) {
    setProject(nextProject);
    setScanning(true);
    setScanMessage(`Reading ${nextProject.fileCount} supported source file${nextProject.fileCount === 1 ? "" : "s"}…`);
    window.setTimeout(() => {
      setScanning(false);
      setScanMessage(`${nextProject.sourceLabel} · ${nextProject.fileCount} source files · checked just now`);
    }, 1100);
  }

  return (
    <AppChrome
      active="workspace"
      project={project}
      projectConnected={projectConnected}
      workspaceHref={startWithImporter ? "/workspace" : "/demo"}
    >
      <div className="workspace-header">
        <div>
          <div className="eyebrow-row">
            <span>{project.name}</span><span aria-hidden="true">/</span><span>Project scan</span>
          </div>
          <h1>{projectConnected ? "Your app control room" : "Start with your own project"}</h1>
          <p>{projectConnected
            ? "See what matters, try changes safely, and catch surprises early."
            : "Connect a project directly, without starting the tutorial or financial demo."}</p>
        </div>
        <div className="header-actions">
          <label className="model-picker">
            <span className="model-dot" aria-hidden="true" />
            <span className="sr-only">AI model</span>
            <select defaultValue="vcaist-core" aria-label="AI model">
              <option value="vcaist-core">VCAIST Core · GPT-5.4</option>
            </select>
          </label>
          <button
            className="button secondary"
            onClick={() => projectConnected ? scan(project) : setImportOpen(true)}
            disabled={scanning}
          >
            <span className={scanning ? "scan-icon spinning" : "scan-icon"} aria-hidden="true">
              {projectConnected ? "↻" : "+"}
            </span>
            {scanning ? "Checking…" : projectConnected ? "Check again" : "Choose project"}
          </button>
        </div>
      </div>

      {projectConnected ? <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
        {viewOptions.map((option) => (
          <button
            key={option.id}
            className={view === option.id ? "workspace-tab active" : "workspace-tab"}
            onClick={() => setView(option.id)}
            role="tab"
            aria-selected={view === option.id}
          >
            {option.label}
            {option.count ? (
              <span className={option.id === "tests" ? "tab-count issue" : "tab-count"}>
                {option.id === "tests" ? issueCount : option.count}
              </span>
            ) : null}
          </button>
        ))}
      </div> : null}

      <div className="workspace-content">
        {projectConnected ? <div className="scan-status" role="status" aria-live="polite">
          <span className={scanning ? "status-orb scanning" : "status-orb"} aria-hidden="true">
            {scanning ? "↻" : "✓"}
          </span>
          <div>
            <strong>{scanning ? "VCAIST is checking your app" : `${project.name} is connected`}</strong>
            <p>{scanMessage}</p>
          </div>
          <div className="scan-spacer" />
          <button className="text-button" onClick={() => setImportOpen(true)}>
            Change project source
          </button>
        </div> : (
          <section className="direct-workspace-start">
            <span className="section-kicker">YOUR PROJECT, YOUR CHOICE</span>
            <h2>Try VCAIST with the app you already have</h2>
            <p>Choose a local folder, a Google Drive folder, or a public GitHub repository. VCAIST reads supported source files without changing your project.</p>
            <button className="button dark" onClick={() => setImportOpen(true)}>Choose project source <span aria-hidden="true">→</span></button>
            <div className="direct-source-list" aria-label="Available project sources">
              <span>Local folder</span><span>Google Drive</span><span>GitHub</span>
            </div>
          </section>
        )}

        {projectConnected && project.source !== "demo" ? (
          <div className="prototype-notice" role="note">
            <strong>{project.name} is connected.</strong>
            <span>This prototype uses the guided financial controls below while project-specific AI extraction is being completed.</span>
          </div>
        ) : null}

        {projectConnected && view === "overview" ? (
          <Overview
            snapshot={snapshot}
            knobs={knobs}
            updateKnob={updateKnob}
            quantity={quantity}
            setQuantity={setQuantity}
            currentOrder={currentOrder}
            chartValues={chartValues}
            chartMax={chartMax}
            openControls={() => setView("controls")}
            openTests={() => setView("tests")}
          />
        ) : null}

        {projectConnected && view === "controls" ? (
          <Controls knobs={knobs} updateKnob={updateKnob} snapshot={snapshot} reset={() => setKnobs(defaultKnobs)} />
        ) : null}

        {projectConnected && view === "map" ? <AppMap mode={mapMode} setMode={setMapMode} /> : null}
        {projectConnected && view === "tests" ? <SafetyTests results={testResults} shippingFee={knobs.shippingFee} /> : null}
      </div>
      {importOpen ? (
        <ImportProjectDialog
          onClose={() => setImportOpen(false)}
          onImport={(nextProject) => {
            setImportOpen(false);
            scan(nextProject);
          }}
        />
      ) : null}
    </AppChrome>
  );
}

function Overview({
  snapshot, knobs, updateKnob, quantity, setQuantity, currentOrder,
  chartValues, chartMax, openControls, openTests,
}: {
  snapshot: ReturnType<typeof calculateBusinessSnapshot>;
  knobs: PricingKnobs;
  updateKnob: <K extends keyof PricingKnobs>(key: K, value: number) => void;
  quantity: number;
  setQuantity: (value: number) => void;
  currentOrder: ReturnType<typeof runSamplePricing>;
  chartValues: Array<{ quantity: number; total: number }>;
  chartMax: number;
  openControls: () => void;
  openTests: () => void;
}) {
  return (
    <div className="view-stack">
      <section className="metric-grid" aria-label="Business snapshot">
        <MetricCard label="Est. monthly revenue" value={money.format(snapshot.revenue)} note="based on 184 recent orders" trend="+8.4%" tone="green" />
        <MetricCard label="Typical order" value={preciseMoney.format(snapshot.averageOrder)} note="when someone buys 3 items" trend="Live" tone="blue" />
        <MetricCard label="Estimated margin" value={`${snapshot.margin.toFixed(1)}%`} note="after product costs" trend="Healthy" tone="amber" />
        <MetricCard label="Safety check" value="1 surprise" note="needs your attention" trend="Review" tone="coral" />
      </section>

      <div className="overview-grid">
        <section className="panel simulator-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">LIVE SANDBOX</span>
              <h2>What happens when an order changes?</h2>
              <p>This runs the pricing code from ShopSpring—no live customers affected.</p>
            </div>
            <span className="safe-pill">Safe to try</span>
          </div>

          <div className="quantity-control">
            <div className="range-label-row">
              <label htmlFor="quantity">Items in this test order</label>
              <output htmlFor="quantity">{quantity}</output>
            </div>
            <input
              id="quantity"
              className="range-input"
              type="range"
              min="0"
              max="8"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              style={{ "--range-progress": `${(quantity / 8) * 100}%` } as CSSProperties}
            />
            <div className="range-ends"><span>0 items</span><span>8 items</span></div>
          </div>

          <div className={currentOrder.total < 0 ? "order-result danger" : "order-result"}>
            <div>
              <span>Customer would pay</span>
              <strong>{preciseMoney.format(currentOrder.total)}</strong>
            </div>
            <div className="calculation-line">
              <span>{preciseMoney.format(currentOrder.subtotal)} items</span>
              <span>− {preciseMoney.format(currentOrder.discount)} discount</span>
              <span>− {preciseMoney.format(knobs.shippingFee)} shipping</span>
            </div>
          </div>

          <div className="mini-chart" aria-label="Order total by quantity">
            {chartValues.map((item) => (
              <div className="chart-column" key={item.quantity}>
                <span
                  className={item.quantity === quantity ? "chart-bar active" : "chart-bar"}
                  style={{ height: `${Math.max(8, (item.total / chartMax) * 100)}%` }}
                  title={`${item.quantity} items: ${preciseMoney.format(item.total)}`}
                />
                <small>{item.quantity}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel issue-panel">
          <div className="issue-flag">NEEDS ATTENTION</div>
          <div className="bug-mark" aria-hidden="true">!</div>
          <h2>A zero-item order pays the customer</h2>
          <p>
            If quantity is 0, ShopSpring returns <strong>−{preciseMoney.format(knobs.shippingFee)}</strong>.
            That could create a refund instead of stopping checkout.
          </p>
          <div className="plain-explanation">
            <span aria-hidden="true">↳</span>
            <div><strong>Why it happens</strong><p>Shipping is being subtracted from the order instead of added.</p></div>
          </div>
          <button className="button dark full" onClick={openTests}>See the real test <span aria-hidden="true">→</span></button>
          <small className="permission-note">Nothing will be changed without your approval.</small>
        </section>
      </div>

      <section className="panel controls-preview">
        <div className="panel-heading horizontal">
          <div>
            <span className="section-kicker">FOUND IN YOUR CODE</span>
            <h2>Business controls</h2>
            <p>VCAIST found 4 values you can safely experiment with.</p>
          </div>
          <button className="text-button with-arrow" onClick={openControls}>Open all controls <span aria-hidden="true">→</span></button>
        </div>
        <div className="knob-preview-grid">
          <CompactKnob label="Price per item" value={`$${knobs.basePrice}`} min={20} max={80} current={knobs.basePrice} onChange={(value) => updateKnob("basePrice", value)} color="green" />
          <CompactKnob label="Bulk discount" value={`${knobs.discountRate}%`} min={0} max={40} current={knobs.discountRate} onChange={(value) => updateKnob("discountRate", value)} color="blue" />
          <CompactKnob label="Shipping fee" value={preciseMoney.format(knobs.shippingFee)} min={0} max={15} step={0.5} current={knobs.shippingFee} onChange={(value) => updateKnob("shippingFee", value)} color="amber" />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note, trend, tone }: { label: string; value: string; note: string; trend: string; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-topline"><span>{label}</span><span className="metric-trend">{trend}</span></div>
      <strong>{value}</strong><p>{note}</p>
    </article>
  );
}

function CompactKnob({
  label, value, min, max, step = 1, current, onChange, color,
}: {
  label: string; value: string; min: number; max: number; step?: number;
  current: number; onChange: (value: number) => void; color: string;
}) {
  return (
    <label className={`compact-knob ${color}`}>
      <span className="compact-knob-title"><span>{label}</span><strong>{value}</strong></span>
      <input
        className="range-input compact" type="range" min={min} max={max} step={step} value={current}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--range-progress": `${((current - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </label>
  );
}

function Controls({
  knobs, updateKnob, snapshot, reset,
}: {
  knobs: PricingKnobs;
  updateKnob: <K extends keyof PricingKnobs>(key: K, value: number) => void;
  snapshot: ReturnType<typeof calculateBusinessSnapshot>;
  reset: () => void;
}) {
  return (
    <div className="controls-layout">
      <section className="panel control-list">
        <div className="panel-heading horizontal">
          <div>
            <span className="section-kicker">YOUR APP'S KNOBS</span>
            <h2>Try a business change</h2>
            <p>Move a slider. The preview updates instantly, but your app stays untouched.</p>
          </div>
          <button className="button ghost small" onClick={reset}>Reset values</button>
        </div>
        <FullKnob title="Price per item" description="What one product costs before discounts." value={knobs.basePrice} displayValue={`$${knobs.basePrice}`} min={20} max={80} prefix="$" onChange={(value) => updateKnob("basePrice", value)} />
        <FullKnob title="Bulk discount" description={`Taken off when someone buys ${knobs.discountThreshold} or more.`} value={knobs.discountRate} displayValue={`${knobs.discountRate}%`} min={0} max={40} suffix="%" onChange={(value) => updateKnob("discountRate", value)} />
        <FullKnob title="Bulk discount starts at" description="The number of items needed to unlock the discount." value={knobs.discountThreshold} displayValue={`${knobs.discountThreshold} items`} min={2} max={12} suffix=" items" onChange={(value) => updateKnob("discountThreshold", value)} />
        <FullKnob title="Shipping fee" description="The amount added to every delivery in the intended rule." value={knobs.shippingFee} displayValue={preciseMoney.format(knobs.shippingFee)} min={0} max={15} step={0.5} prefix="$" onChange={(value) => updateKnob("shippingFee", value)} />
      </section>

      <aside className="panel sticky-preview">
        <span className="section-kicker">LIVE OUTLOOK</span><h2>Your new forecast</h2>
        <div className="forecast-number">{money.format(snapshot.revenue)}</div><p>estimated monthly revenue</p>
        <div className="forecast-row"><span>Typical order</span><strong>{preciseMoney.format(snapshot.averageOrder)}</strong></div>
        <div className="forecast-row"><span>Estimated margin</span><strong>{snapshot.margin.toFixed(1)}%</strong></div>
        <div className="forecast-row"><span>Orders modeled</span><strong>{snapshot.monthlyOrders}</strong></div>
        <div className="sandbox-caption"><span aria-hidden="true">◇</span>This is a private simulation. Publish controls will arrive in a later version.</div>
      </aside>
    </div>
  );
}

function FullKnob({
  title, description, value, displayValue, min, max, step = 1, prefix = "", suffix = "", onChange,
}: {
  title: string; description: string; value: number; displayValue: string; min: number; max: number;
  step?: number; prefix?: string; suffix?: string; onChange: (value: number) => void;
}) {
  return (
    <div className="full-knob">
      <div className="full-knob-copy">
        <div><h3>{title}</h3><p>{description}</p></div><output>{displayValue}</output>
      </div>
      <input
        className="range-input" aria-label={title} type="range" value={value} min={min} max={max} step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--range-progress": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      <div className="range-ends"><span>{prefix}{min}{suffix}</span><span>{prefix}{max}{suffix}</span></div>
    </div>
  );
}

function AppMap({ mode, setMode }: { mode: "plain" | "technical"; setMode: (mode: "plain" | "technical") => void }) {
  const plainNodes = [
    { icon: "1", title: "A shopper adds items", detail: "The cart keeps count" },
    { icon: "2", title: "Your price rules run", detail: "Price, discount, and shipping" },
    { icon: "3", title: "Checkout shows the total", detail: "The shopper reviews it" },
    { icon: "4", title: "Payment is collected", detail: "Stripe handles the charge" },
  ];
  const technicalNodes = [
    { icon: "1", title: "CartPage.tsx", detail: "quantity state" },
    { icon: "2", title: "calculatePrice()", detail: "src/lib/pricing.ts" },
    { icon: "3", title: "Checkout API", detail: "POST /api/checkout" },
    { icon: "4", title: "Stripe PaymentIntent", detail: "server-side request" },
  ];
  const nodes = mode === "plain" ? plainNodes : technicalNodes;

  return (
    <div className="map-layout">
      <section className="panel map-panel">
        <div className="panel-heading horizontal">
          <div><span className="section-kicker">YOUR APP, EXPLAINED</span><h2>How a purchase moves through ShopSpring</h2><p>Follow the path from adding an item to receiving payment.</p></div>
          <div className="segmented-control" aria-label="Diagram language">
            <button className={mode === "plain" ? "active" : ""} onClick={() => setMode("plain")}>Plain English</button>
            <button className={mode === "technical" ? "active" : ""} onClick={() => setMode("technical")}>Technical</button>
          </div>
        </div>
        <div className="flow-map">
          {nodes.map((node, index) => (
            <div className="flow-step-wrap" key={node.title}>
              <article className="flow-step"><span className="flow-icon">{node.icon}</span><strong>{node.title}</strong><small>{node.detail}</small></article>
              {index < nodes.length - 1 ? <span className="flow-arrow" aria-hidden="true">→</span> : null}
            </div>
          ))}
        </div>
      </section>
      <aside className="panel map-insight">
        <div className="insight-icon" aria-hidden="true">◎</div><span className="section-kicker">VCAIST NOTICED</span>
        <h2>One rule affects two important moments</h2>
        <p>The same pricing function sets the number at checkout and the amount sent to Stripe. A mistake here reaches real payments.</p>
        <div className="impact-list"><div><span>Checkout total</span><strong>Direct impact</strong></div><div><span>Payment charge</span><strong>Direct impact</strong></div><div><span>Order receipt</span><strong>Copies total</strong></div></div>
      </aside>
    </div>
  );
}

function SafetyTests({ results, shippingFee }: { results: ReturnType<typeof stressTest>; shippingFee: number }) {
  return (
    <div className="tests-layout">
      <section className="panel test-list-panel">
        <div className="panel-heading"><span className="section-kicker">5 REAL RUNS</span><h2>VCAIST tried the awkward cases for you</h2><p>These are actual outputs from the connected pricing function.</p></div>
        <div className="test-list">
          {results.map((result) => (
            <div className={result.passed ? "test-row" : "test-row failed"} key={result.quantity}>
              <span className="test-state" aria-hidden="true">{result.passed ? "✓" : "!"}</span>
              <div><strong>{result.quantity === 0 ? "An empty order" : `${result.quantity} item${result.quantity === 1 ? "" : "s"}`}</strong><small>{result.passed ? "The total stays sensible" : "The total drops below $0"}</small></div>
              <output>{preciseMoney.format(result.total)}</output>
              <span className={result.passed ? "result-pill" : "result-pill failed"}>{result.passed ? "Passed" : "Found issue"}</span>
            </div>
          ))}
        </div>
      </section>

      <aside className="panel test-detail">
        <div className="issue-flag">ISSUE DETAILS</div><h2>Empty orders become negative</h2>
        <p className="test-summary">Expected at least <strong>$0.00</strong>, but received <strong>−{preciseMoney.format(shippingFee)}</strong>.</p>
        <div className="code-window" aria-label="Relevant code">
          <div className="code-window-top"><span /><span /><span /><small>pricing.ts</small></div>
          <pre><code><span className="code-muted">// Shipping should be added</span>{"\n"}<span className="code-keyword">return</span> subtotal - discount <mark>- SHIPPING_FEE</mark>;</code></pre>
        </div>
        <div className="suggested-fix"><span className="fix-icon" aria-hidden="true">✓</span><div><strong>Suggested safe fix</strong><p>Add shipping to the total and stop checkout when quantity is 0.</p></div></div>
        <button className="button disabled full" disabled title="Patch approvals are planned for a later version">Prepare fix for approval · Coming soon</button>
      </aside>
    </div>
  );
}
