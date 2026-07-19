"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { AppChrome } from "./components/AppChrome";
import { ImportProjectDialog } from "./components/ImportProjectDialog";
import type { ImportedProject } from "@/lib/import-sources";
import {
  defaultPreferences,
  modelGroups,
  readPreferences,
  writePreferences,
  type ModelId,
} from "@/lib/preferences";
import {
  calculateBusinessSnapshot,
  defaultKnobs,
  stressTest,
  type PricingKnobs,
} from "@/lib/pricing";

type WorkspaceView = "overview" | "application" | "controls" | "map" | "tests";

const workspaceViewGuides: Record<WorkspaceView, {
  eyebrow: string;
  title: string;
  description: string;
  actions: readonly string[];
}> = {
  overview: {
    eyebrow: "OVERVIEW · START HERE",
    title: "Understand the platform before exploring the app",
    description: "This page explains what VCAIST is for, summarizes every platform feature, and follows one app owner through the complete safe-analysis story. Application pages, metrics, simulations, findings, and controls now live in Current Application.",
    actions: ["Understand the purpose", "Review every feature", "Follow the example story"],
  },
  application: {
    eyebrow: "CURRENT APPLICATION · SEE AND SHAPE IT",
    title: "See every page before deciding what to change",
    description: "This page presents the connected application as a page-by-page carousel and offers an AI change assistant that must ask for permission before it can help plan an edit.",
    actions: ["Browse every detected page", "Choose a page to discuss", "Approve AI help before chatting"],
  },
  controls: {
    eyebrow: "CONTROLS · SAFE EXPERIMENTS",
    title: "See which business rules move the numbers",
    description: "This page gathers prices, discounts, thresholds, and fees into safe controls. Change one value at a time and watch the forecast update without editing source code or affecting live customers.",
    actions: ["Adjust one rule", "Watch the forecast change", "Reset the sample safely"],
  },
  map: {
    eyebrow: "APP MAP · FOLLOW THE FLOW",
    title: "Follow one customer action through the app",
    description: "This page connects the plain-English customer journey to the files, functions, APIs, and services that respond. Select any diagram step to open its source in the read-only workspace below.",
    actions: ["Read the customer journey", "Switch to technical view", "Open source safely"],
  },
  tests: {
    eyebrow: "SAFETY TESTS · CATCH SURPRISES",
    title: "Review safety from customer input to system architecture",
    description: "This page combines executed behavior checks with guided code and system-design review. Search business errors, input limits, rate limiting, authorization, payment integrity, resilience, and information-exposure risks, then select any finding for full evidence and protection guidance.",
    actions: ["Search the complete risk list", "Open full finding details", "Review safer system controls"],
  },
};

const scanCacheStorageKey = "vcaist-project-scan-cache-v1";
const scanCacheLifetime = 30 * 24 * 60 * 60 * 1000;

function projectScanCacheKey(project: ImportedProject) {
  return project.cacheKey ?? `${project.source}:${project.name}:${project.fileCount}`;
}

function hasFreshScanCache(project: ImportedProject) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(scanCacheStorageKey) ?? "{}") as Record<string, number>;
    const savedAt = cache[projectScanCacheKey(project)];
    return typeof savedAt === "number" && Date.now() - savedAt < scanCacheLifetime;
  } catch {
    return false;
  }
}

function rememberScan(project: ImportedProject) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(scanCacheStorageKey) ?? "{}") as Record<string, number>;
    const now = Date.now();
    const freshEntries = Object.fromEntries(
      Object.entries(cache).filter(([, savedAt]) => now - savedAt < scanCacheLifetime),
    );
    freshEntries[projectScanCacheKey(project)] = now;
    window.localStorage.setItem(scanCacheStorageKey, JSON.stringify(freshEntries));
  } catch {
    // Browsers may disable local storage. Scanning still works without the cache.
  }
}

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

const viewOptions: Array<{ id: WorkspaceView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "application", label: "Current Application" },
  { id: "controls", label: "Controls" },
  { id: "map", label: "App map" },
  { id: "tests", label: "Safety tests" },
];

export function Dashboard({ startWithImporter = false }: { startWithImporter?: boolean }) {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [knobs, setKnobs] = useState<PricingKnobs>(defaultKnobs);
  const [model, setModel] = useState<ModelId>(defaultPreferences.model);
  const [scanning, setScanning] = useState(false);
  const [scanCacheHit, setScanCacheHit] = useState(false);
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
  const projectReady = projectConnected && !scanning;
  const scanTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
  }, []);

  useEffect(() => {
    setModel(readPreferences().model);
  }, []);

  const snapshot = useMemo(() => calculateBusinessSnapshot(knobs), [knobs]);
  const testResults = useMemo(() => stressTest(knobs), [knobs]);

  function updateKnob<K extends keyof PricingKnobs>(key: K, value: number) {
    setKnobs((current) => ({ ...current, [key]: value }));
  }

  function updateModel(nextModel: ModelId) {
    setModel(nextModel);
    writePreferences({ ...readPreferences(), model: nextModel });
  }

  function scan(nextProject: ImportedProject = project, { force = false } = {}) {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    setProject(nextProject);

    if (!force && nextProject.source !== "demo" && hasFreshScanCache(nextProject)) {
      setScanning(false);
      setScanCacheHit(true);
      setScanMessage(`${nextProject.sourceLabel} · ${nextProject.fileCount} source files · loaded from device cache`);
      return;
    }

    setScanning(true);
    setScanCacheHit(false);
    setScanMessage(`Indexing ${nextProject.fileCount} supported source file${nextProject.fileCount === 1 ? "" : "s"}…`);
    scanTimer.current = window.setTimeout(() => {
      rememberScan(nextProject);
      setScanning(false);
      setScanMessage(`${nextProject.sourceLabel} · ${nextProject.fileCount} source files · indexing complete`);
      scanTimer.current = null;
    }, 1200);
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
            <select value={model} onChange={(event) => updateModel(event.target.value as ModelId)} aria-label="AI model">
              {modelGroups.map((group) => (
                <optgroup label={group.menuLabel} key={group.label}>
                  {group.options.map((option) => (
                    <option value={option.id} key={option.id}>{option.label} · USD {option.menuPrice} per 1M tokens</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            onClick={() => projectConnected ? scan(project, { force: true }) : setImportOpen(true)}
            disabled={scanning}
          >
            <span className={scanning ? "scan-icon spinning" : "scan-icon"} aria-hidden="true">
              {projectConnected ? "↻" : "+"}
            </span>
            {scanning ? "Checking…" : projectConnected ? "Check again" : "Choose project"}
          </button>
        </div>
      </div>

      {projectReady ? <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
        {viewOptions.map((option) => (
          <button
            key={option.id}
            className={view === option.id ? "workspace-tab active" : "workspace-tab"}
            onClick={() => setView(option.id)}
            role="tab"
            aria-selected={view === option.id}
          >
            {option.label}
          </button>
        ))}
      </div> : null}

      <div className="workspace-content">
        {projectReady ? <WorkspaceViewIntroduction view={view} /> : null}
        {projectReady && view === "overview" ? <ProgramOverview /> : null}

        {projectConnected ? <div className={scanning ? "scan-status loading" : "scan-status"} role="status" aria-live="polite">
          <span className={scanning ? "status-orb scanning" : "status-orb"} aria-hidden="true">
            {scanning ? "↻" : "✓"}
          </span>
          <div>
            <strong>{scanning ? "VCAIST is indexing your source files" : `${project.name} is ready`}</strong>
            <p>{scanMessage}</p>
          </div>
          <div className="scan-spacer" />
          <button className="text-button" onClick={() => setImportOpen(true)} disabled={scanning}>
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

        {scanning ? <ProjectScanProgress project={project} /> : null}

        {projectReady && project.source !== "demo" ? (
          <div className="prototype-notice complete" role="note">
            <span className="notice-complete-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Source-file indexing is complete. Nothing is still loading.</strong>
              <span>Project-specific AI extraction is not available in this prototype. The financial controls below are the guided practice sample, not controls found in {project.name}.</span>
              <small>{scanCacheHit
                ? "This folder matched the private cache on this device, so repeat indexing was skipped."
                : "This project fingerprint is now cached privately on this device for faster repeat loads."}</small>
            </div>
          </div>
        ) : null}

        {projectReady && view === "application" ? (
          <CurrentApplication project={project} />
        ) : null}

        {projectReady && view === "controls" ? (
          <Controls knobs={knobs} updateKnob={updateKnob} snapshot={snapshot} reset={() => setKnobs(defaultKnobs)} />
        ) : null}

        {projectReady && view === "map" ? <AppMap mode={mapMode} setMode={setMapMode} /> : null}
        {projectReady && view === "tests" ? <SafetyTests results={testResults} shippingFee={knobs.shippingFee} /> : null}
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

function WorkspaceViewIntroduction({ view }: { view: WorkspaceView }) {
  const guide = workspaceViewGuides[view];
  const viewMarks: Record<WorkspaceView, string> = {
    overview: "◎",
    application: "▦",
    controls: "↔",
    map: "⌁",
    tests: "!",
  };

  return (
    <section
      className={`view-introduction ${view}`}
      aria-labelledby={`view-introduction-${view}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="view-introduction-mark" aria-hidden="true">
        {viewMarks[view]}
      </span>
      <div className="view-introduction-copy">
        <span className="view-introduction-eyebrow">{guide.eyebrow}</span>
        <h2 id={`view-introduction-${view}`}>{guide.title}</h2>
        <p>{guide.description}</p>
      </div>
      <ul className="view-introduction-actions" aria-label="What you can do on this page">
        {guide.actions.map((action) => <li key={action}>{action}</li>)}
      </ul>
    </section>
  );
}

function ProjectScanProgress({ project }: { project: ImportedProject }) {
  return (
    <section className="project-scan-progress" aria-labelledby="scan-progress-title">
      <div className="scan-progress-symbol" aria-hidden="true"><span /></div>
      <span className="section-kicker">FIRST-TIME PROJECT INDEX</span>
      <h2 id="scan-progress-title">Preparing {project.name}</h2>
      <p>VCAIST is indexing {project.fileCount} supported source file{project.fileCount === 1 ? "" : "s"}. This normally takes only a few seconds.</p>
      <div className="scan-progress-track" aria-hidden="true"><span /></div>
      <div className="scan-progress-steps" aria-label="Project indexing progress">
        <span className="done"><b>✓</b>Folder selected</span>
        <span className="active"><b>2</b>Indexing source files</span>
        <span><b>3</b>Ready to explore</span>
      </div>
      <small>The unchanged project fingerprint will be cached privately in this browser. Your source files are not stored in the cache.</small>
    </section>
  );
}

const applicationPages = [
  { id: "home", name: "Home", route: "/", purpose: "Brand story and featured products" },
  { id: "catalog", name: "Catalog", route: "/shop", purpose: "Browse and compare the full collection" },
  { id: "cart", name: "Cart", route: "/cart", purpose: "Review items, discounts, and totals" },
  { id: "checkout", name: "Checkout", route: "/checkout", purpose: "Confirm delivery and payment" },
] as const;

type ApplicationPage = (typeof applicationPages)[number];
type AssistantPermission = "pending" | "granted" | "declined";
type ProposalState = "none" | "ready" | "approved";
type ChatMessage = { role: "assistant" | "user"; text: string };

function ApplicationCarousel({ project }: { project: ImportedProject }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePage = applicationPages[activeIndex];
  const isGuidedDemo = project.source === "demo";

  function movePage(direction: number) {
    setActiveIndex((current) => (current + direction + applicationPages.length) % applicationPages.length);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      movePage(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      movePage(1);
    }
  }

  return (
    <section className="panel current-application-panel" aria-labelledby="application-carousel-title">
      <div className="application-panel-heading">
        <div>
          <span className="section-kicker">CONNECTED APPLICATION</span>
          <h2 id="application-carousel-title">Every page of {project.name}, in one place</h2>
          <p>
            Move through the page carousel, inspect what customers see, and ask the AI assistant to plan a change only after you give permission.
          </p>
        </div>
        <span className="page-inventory-pill">{applicationPages.length} pages found</span>
      </div>

      <div className="application-carousel-layout">
        <div className="application-carousel-column">
          <div
            className="application-carousel-stage"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            aria-roledescription="carousel"
            aria-label={`${project.name} application pages`}
          >
            <div className="application-browser-bar" aria-hidden="true">
              <span className="browser-dots"><i /><i /><i /></span>
              <span className="browser-address">{project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "application"}.app{activePage.route}</span>
              <span className="browser-live">Preview</span>
            </div>
            <div className="application-page-live" aria-live="polite" aria-atomic="true">
              <ApplicationPagePreview page={activePage} projectName={project.name} />
            </div>
          </div>

          <div className="carousel-controls">
            <button type="button" className="carousel-arrow" onClick={() => movePage(-1)} aria-label="Show previous application page">←</button>
            <div>
              <strong>{activePage.name}</strong>
              <span>Page {activeIndex + 1} of {applicationPages.length} · {activePage.purpose}</span>
            </div>
            <button type="button" className="carousel-arrow" onClick={() => movePage(1)} aria-label="Show next application page">→</button>
          </div>

          <div className="application-page-list" role="tablist" aria-label="All application pages">
            {applicationPages.map((page, index) => (
              <button
                type="button"
                key={page.id}
                className={index === activeIndex ? "application-page-tab active" : "application-page-tab"}
                onClick={() => setActiveIndex(index)}
                role="tab"
                aria-selected={index === activeIndex}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{page.name}</strong><small>{page.route}</small></div>
              </button>
            ))}
          </div>

          <p className="application-preview-boundary">
            {isGuidedDemo
              ? "This carousel shows all four pages in the bundled ShopSpring practice application."
              : `VCAIST found ${project.fileCount} supported files in ${project.name}. The four-page commerce preview remains the guided sample until project-specific page rendering is connected.`}
          </p>
        </div>

        <AiChangeAssistant page={activePage} projectName={project.name} />
      </div>
    </section>
  );
}

function AiChangeAssistant({ page, projectName }: { page: ApplicationPage; projectName: string }) {
  const [permission, setPermission] = useState<AssistantPermission>("pending");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [proposalState, setProposalState] = useState<ProposalState>("none");

  function grantPermission() {
    setPermission("granted");
    setMessages([{
      role: "assistant",
      text: `Thank you. I can now discuss ${projectName} and prepare a private change plan. What would you like to change on the ${page.name} page?`,
    }]);
  }

  function declinePermission() {
    setPermission("declined");
    setMessages([]);
    setProposalState("none");
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = message.trim();
    if (!request || permission !== "granted") return;

    setMessages((current) => [
      ...current,
      { role: "user", text: request },
      {
        role: "assistant",
        text: `I can prepare “${request}” as a reviewable draft for the ${page.name} page. I will not apply it to the sandbox or the live app unless you approve the next step.`,
      },
    ]);
    setMessage("");
    setProposalState("ready");
  }

  function approveProposal() {
    setProposalState("approved");
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        text: "Permission recorded for a sandbox draft. This prototype does not edit connected source files yet, so your original and live application remain unchanged.",
      },
    ]);
  }

  return (
    <aside className="ai-change-chat" aria-labelledby="ai-change-chat-title">
      <div className="ai-chat-heading">
        <span className="ai-avatar" aria-hidden="true">AI</span>
        <div><h3 id="ai-change-chat-title">Change assistant</h3><p>Permission required · live app protected</p></div>
        <span className={permission === "granted" ? "assistant-status allowed" : "assistant-status"}>{permission === "granted" ? "Allowed" : "Locked"}</span>
      </div>

      {permission === "pending" ? (
        <div className="ai-permission-card" role="dialog" aria-labelledby="ai-permission-title" aria-describedby="ai-permission-description">
          <span className="permission-lock" aria-hidden="true">✓</span>
          <div className="chat-bubble assistant">
            <strong id="ai-permission-title">May I help plan changes to this application?</strong>
            <p id="ai-permission-description">I need your permission before I can discuss the project or prepare a draft. I will ask again before any proposed change moves into the sandbox.</p>
          </div>
          <button type="button" className="button dark full" onClick={grantPermission}>Allow change planning</button>
          <button type="button" className="button ghost full" onClick={declinePermission}>Not now</button>
        </div>
      ) : null}

      {permission === "declined" ? (
        <div className="ai-permission-card declined" role="status">
          <span className="permission-lock" aria-hidden="true">—</span>
          <div className="chat-bubble assistant"><strong>Permission declined</strong><p>No project details were shared with the assistant and no changes were made.</p></div>
          <button type="button" className="button ghost full" onClick={() => setPermission("pending")}>Ask me again</button>
        </div>
      ) : null}

      {permission === "granted" ? (
        <>
          <div className="chat-message-list" aria-live="polite">
            {messages.map((chatMessage, index) => (
              <div className={`chat-bubble ${chatMessage.role}`} key={`${chatMessage.role}-${index}`}>
                <strong>{chatMessage.role === "assistant" ? "VCAIST AI" : "You"}</strong>
                <p>{chatMessage.text}</p>
              </div>
            ))}
          </div>

          {proposalState === "ready" ? (
            <div className="proposal-permission" role="group" aria-label="Approve proposed sandbox draft">
              <strong>Prepare this draft in the safe sandbox?</strong>
              <p>Your connected source and live app will stay untouched.</p>
              <div><button type="button" className="button dark small" onClick={approveProposal}>Approve sandbox draft</button><button type="button" className="text-button" onClick={() => setProposalState("none")}>Keep discussing</button></div>
            </div>
          ) : null}

          {proposalState === "approved" ? <div className="proposal-approved" role="status"><span aria-hidden="true">✓</span> Sandbox permission recorded</div> : null}

          <form className="ai-chat-form" onSubmit={submitMessage}>
            <label className="sr-only" htmlFor="ai-change-message">Describe the application change you want</label>
            <textarea
              id="ai-change-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={`Ask for a change to ${page.name}…`}
              rows={3}
            />
            <button type="submit" className="button dark" disabled={!message.trim()}>Send request <span aria-hidden="true">↑</span></button>
          </form>
        </>
      ) : null}
    </aside>
  );
}

function ApplicationPagePreview({ page, projectName }: { page: ApplicationPage; projectName: string }) {
  return (
    <div className={`shop-preview-page ${page.id}`}>
      <header className="shop-preview-header">
        <strong>{projectName}</strong>
        <nav aria-label={`${page.name} preview navigation`}><span>New</span><span>Shop</span><span>Our story</span></nav>
        <button type="button" tabIndex={-1}>Bag · 2</button>
      </header>

      {page.id === "home" ? (
        <div className="shop-home-preview">
          <div className="shop-hero-copy"><small>SMALL-BATCH ESSENTIALS</small><h3>Make everyday rituals feel considered.</h3><p>Warm scents, thoughtful materials, and objects made to last.</p><span>Shop the collection →</span></div>
          <div className="shop-hero-product" aria-hidden="true"><i /><strong>EMBER</strong><small>cedar · amber · fig</small></div>
        </div>
      ) : null}

      {page.id === "catalog" ? (
        <div className="shop-catalog-preview">
          <div className="shop-preview-title"><div><small>THE COLLECTION</small><h3>Find your next favorite</h3></div><span>12 products · Sort by</span></div>
          <div className="shop-product-grid">
            {["Ember", "Sunday", "Quiet Hour", "After Rain"].map((product, index) => <article key={product}><i className={`product-shape tone-${index + 1}`} /><div><strong>{product}</strong><span>{index % 2 ? "$42" : "$49"}</span></div><small>{index % 2 ? "soft linen · moss" : "cedar · amber · fig"}</small></article>)}
          </div>
        </div>
      ) : null}

      {page.id === "cart" ? (
        <div className="shop-cart-preview">
          <div className="shop-cart-items"><small>YOUR BAG · 2 ITEMS</small><h3>A few good things</h3>{["Ember candle", "Quiet Hour candle"].map((product, index) => <article key={product}><i className={`cart-product tone-${index + 1}`} /><div><strong>{product}</strong><span>Qty 1 · Remove</span></div><b>{index ? "$42.00" : "$49.00"}</b></article>)}</div>
          <aside><small>ORDER SUMMARY</small><p><span>Subtotal</span><strong>$91.00</strong></p><p><span>Shipping</span><strong>$6.99</strong></p><p className="shop-total"><span>Total</span><strong>$97.99</strong></p><button type="button" tabIndex={-1}>Continue to checkout</button></aside>
        </div>
      ) : null}

      {page.id === "checkout" ? (
        <div className="shop-checkout-preview">
          <div><small>SECURE CHECKOUT</small><h3>Where should we send it?</h3><div className="preview-form-grid"><label>Email<span>maya@example.com</span></label><label>Country<span>United States</span></label><label>First name<span>Maya</span></label><label>Last name<span>Chen</span></label><label className="wide">Address<span>128 Market Street</span></label></div></div>
          <aside><small>2 ITEMS</small><p><span>Ember</span><strong>$49</strong></p><p><span>Quiet Hour</span><strong>$42</strong></p><p><span>Shipping</span><strong>$6.99</strong></p><p className="shop-total"><span>Total</span><strong>$97.99</strong></p><button type="button" tabIndex={-1}>Continue to payment</button></aside>
        </div>
      ) : null}
    </div>
  );
}

function CurrentApplication({ project }: { project: ImportedProject }) {
  return (
    <div className="view-stack">
      <ApplicationCarousel project={project} />
    </div>
  );
}

const programFeatures = [
  ["Choose your source", "Start with a local folder, a Google Drive folder, or a public GitHub repository."],
  ["Index files clearly", "See an explicit first-load progress state, completion message, and faster repeat checks for unchanged folders."],
  ["Compare AI models", "Choose among Frontier, Workhorse, and Efficient models from OpenAI, Anthropic, Google, Moonshot AI, and Alibaba Cloud."],
  ["Find business controls", "Surface prices, fees, discounts, thresholds, and other values that affect how the app behaves."],
  ["Experiment safely", "Move responsive sliders and re-run the sample app logic in a private sandbox without touching live customers."],
  ["Follow the app map", "Switch between a plain-English customer journey and the corresponding technical files and functions."],
  ["Review system-wide safety", "Combine real boundary runs with guided review of input limits, abuse controls, authorization, payments, resilience, and information exposure."],
  ["Keep human approval", "Review explanations and proposed remedies first. This prototype never publishes a code change automatically."],
  ["Adjust the experience", "Use the Help center, persistent settings, four accessible color themes, and responsive phone or desktop layouts."],
] as const;

function ProgramOverview() {
  return (
    <section className="panel program-overview" aria-labelledby="program-overview-title">
      <div className="program-overview-heading">
        <div>
          <span className="section-kicker">PROGRAM OVERVIEW</span>
          <h2 id="program-overview-title">Understand an app without becoming its engineer</h2>
        </div>
        <span className="overview-scope-pill">Explain · simulate · verify</span>
      </div>

      <div className="program-overview-copy">
        <p>
          VCAIST gives app owners a plain-English control room for software they depend on. It connects a project source,
          makes important rules visible, lets people test business changes safely, and explains surprising results before
          anyone decides what to change.
        </p>
        <p>
          The current prototype indexes supported project files and demonstrates the complete analysis loop with the bundled
          ShopSpring pricing fixture. Project-specific AI extraction and approval-based publishing are the next backend milestones;
          the interface labels that boundary instead of pretending background analysis is still running.
        </p>
      </div>

      <div className="program-feature-grid" aria-label="VCAIST features">
        {programFeatures.map(([title, description], index) => (
          <article key={title}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </article>
        ))}
      </div>

      <aside className="program-story" aria-labelledby="program-story-title">
        <div className="story-person" aria-hidden="true">M</div>
        <div className="story-copy">
          <span className="section-kicker">EXAMPLE USER STORY</span>
          <h3 id="program-story-title">Maya needs to understand a checkout she did not build</h3>
          <p>
            Maya runs a small online candle shop. Her developer is unavailable, but she needs to understand whether a new bulk
            discount will hurt her margin. She opens VCAIST and chooses the shop’s GitHub repository. The project is indexed,
            while the original code remains untouched.
          </p>
          <ol>
            <li><strong>Orient:</strong> Maya reads the plain-English app map and sees where checkout, pricing, and shipping connect.</li>
            <li><strong>Experiment:</strong> She adjusts the sample discount and shipping controls, watching revenue and order totals update immediately.</li>
            <li><strong>Catch a surprise:</strong> A zero-item safety test produces a negative total because shipping is subtracted from an empty order.</li>
            <li><strong>Act with context:</strong> Maya shares the explanation and exact failing case with her developer. Nothing is published without approval.</li>
          </ol>
        </div>
      </aside>
    </section>
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

const appMapSteps = [
  {
    icon: "1",
    plainTitle: "A shopper adds items",
    plainDetail: "The cart keeps count",
    technicalTitle: "CartPage.tsx",
    technicalDetail: "quantity state",
    fileName: "CartPage.tsx",
    filePath: "src/app/cart/CartPage.tsx",
    explanation: "This page owns the item quantity and sends it into the pricing function whenever the shopper changes the cart.",
    highlightLines: [6, 7, 8],
    code: `"use client";

import { useState } from "react";
import { runSamplePricing } from "@/lib/pricing";

export function CartPage() {
  const [quantity, setQuantity] = useState(1);
  const order = runSamplePricing(quantity, defaultKnobs);

  return (
    <Cart
      quantity={quantity}
      total={order.total}
      onQuantityChange={setQuantity}
    />
  );
}`,
  },
  {
    icon: "2",
    plainTitle: "Your price rules run",
    plainDetail: "Price, discount, and shipping",
    technicalTitle: "runSamplePricing()",
    technicalDetail: "lib/pricing.ts",
    fileName: "pricing.ts",
    filePath: "lib/pricing.ts",
    explanation: "The pricing function calculates the subtotal, applies the bulk discount, and produces the total used by checkout.",
    highlightLines: [2, 3, 4, 5, 6, 7],
    code: `export function runSamplePricing(quantity: number, knobs: PricingKnobs) {
  const subtotal = knobs.basePrice * quantity;
  const discount = quantity >= knobs.discountThreshold
    ? subtotal * (knobs.discountRate / 100)
    : 0;
  const total = subtotal - discount - knobs.shippingFee;

  return { subtotal, discount, total };
}`,
  },
  {
    icon: "3",
    plainTitle: "Checkout shows the total",
    plainDetail: "The shopper reviews it",
    technicalTitle: "Checkout API",
    technicalDetail: "POST /api/checkout",
    fileName: "route.ts",
    filePath: "src/app/api/checkout/route.ts",
    explanation: "The checkout endpoint validates the cart, runs the shared pricing rule, and returns the amount the customer reviews.",
    highlightLines: [5, 6, 7, 8],
    code: `import { runSamplePricing } from "@/lib/pricing";

export async function POST(request: Request) {
  const { quantity } = await request.json();
  const order = runSamplePricing(quantity, defaultKnobs);

  return Response.json({
    quantity,
    total: order.total,
  });
}`,
  },
  {
    icon: "4",
    plainTitle: "Payment is collected",
    plainDetail: "Stripe handles the charge",
    technicalTitle: "Stripe PaymentIntent",
    technicalDetail: "server-side request",
    fileName: "stripe.ts",
    filePath: "src/server/stripe.ts",
    explanation: "The server converts the checkout total into cents and sends that exact amount to Stripe for collection.",
    highlightLines: [4, 5, 6, 7],
    code: `import Stripe from "stripe";

export async function createPayment(total: number) {
  const amountInCents = Math.round(total * 100);
  return stripe.paymentIntents.create({
    amount: amountInCents,
    currency: "usd",
  });
}`,
  },
] as const;

function AppMap({ mode, setMode }: { mode: "plain" | "technical"; setMode: (mode: "plain" | "technical") => void }) {
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  return (
    <div className="map-layout">
      <section className="panel map-panel">
        <div className="panel-heading horizontal">
          <div><span className="section-kicker">YOUR APP, EXPLAINED</span><h2>How a purchase moves through ShopSpring</h2><p>Follow the path from adding an item to receiving payment. Select any step to inspect its source.</p></div>
          <div className="segmented-control" aria-label="Diagram language">
            <button className={mode === "plain" ? "active" : ""} onClick={() => setMode("plain")}>Plain English</button>
            <button className={mode === "technical" ? "active" : ""} onClick={() => setMode("technical")}>Technical</button>
          </div>
        </div>
        <div className="flow-map">
          {appMapSteps.map((step, index) => (
            <div className="flow-step-wrap" key={step.filePath}>
              <button
                type="button"
                className={selectedStep === index ? "flow-step selected" : "flow-step"}
                onClick={() => setSelectedStep(index)}
                aria-expanded={selectedStep === index}
                aria-controls="app-map-source-workspace"
              >
                <span className="flow-icon">{step.icon}</span>
                <strong>{mode === "plain" ? step.plainTitle : step.technicalTitle}</strong>
                <small>{mode === "plain" ? step.plainDetail : step.technicalDetail}</small>
                <span className="flow-source-action">View source <b aria-hidden="true">↓</b></span>
              </button>
              {index < appMapSteps.length - 1 ? <span className="flow-arrow" aria-hidden="true">→</span> : null}
            </div>
          ))}
        </div>

        {selectedStep === null ? (
          <div className="source-workspace-prompt" id="app-map-source-workspace" role="note"><span aria-hidden="true">{`{ }`}</span><p><strong>Select any step to inspect its source</strong>The file will open here in a read-only workspace.</p></div>
        ) : <SourceCodeWorkspace selectedStep={selectedStep} onSelect={setSelectedStep} />}
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

function SourceCodeWorkspace({ selectedStep, onSelect }: { selectedStep: number; onSelect: (index: number) => void }) {
  const selectedSource = appMapSteps[selectedStep];
  const codeLines = selectedSource.code.split("\n");

  return (
    <section className="source-workspace" id="app-map-source-workspace" aria-labelledby="source-workspace-title" aria-live="polite">
      <header className="source-workspace-header">
        <div><span className="section-kicker">SOURCE WORKSPACE</span><h3 id="source-workspace-title">Code behind step {selectedStep + 1}</h3></div>
        <span className="read-only-badge"><i aria-hidden="true">◇</i> Read only</span>
      </header>

      <div className="source-workspace-summary">
        <span className="source-file-mark" aria-hidden="true">TS</span>
        <div><strong>{selectedSource.fileName}</strong><code>{selectedSource.filePath}</code><p>{selectedSource.explanation}</p></div>
      </div>

      <div className="source-workspace-body">
        <nav className="source-file-list" aria-label="Files in this application flow">
          <span>FLOW FILES</span>
          {appMapSteps.map((step, index) => (
            <button
              type="button"
              key={step.filePath}
              className={selectedStep === index ? "active" : ""}
              onClick={() => onSelect(index)}
              aria-current={selectedStep === index ? "page" : undefined}
            >
              <i aria-hidden="true">TS</i><span><strong>{step.fileName}</strong><small>Step {index + 1}</small></span>
            </button>
          ))}
        </nav>

        <div className="source-editor" aria-label={`Read-only source code for ${selectedSource.fileName}`}>
          <div className="source-editor-tab"><span aria-hidden="true">TS</span><strong>{selectedSource.fileName}</strong><small>Read only</small></div>
          <div className="source-editor-breadcrumb">ShopSpring <b aria-hidden="true">›</b> {selectedSource.filePath}</div>
          <div className="source-code" role="region" aria-label="Source code" tabIndex={0}>
            {codeLines.map((line, index) => {
              const lineNumber = index + 1;
              const highlighted = (selectedSource.highlightLines as readonly number[]).includes(lineNumber);
              return <div className={highlighted ? "source-code-line highlighted" : "source-code-line"} key={`${selectedSource.fileName}-${lineNumber}`}><span aria-hidden="true">{lineNumber}</span><code>{line || " "}</code></div>;
            })}
          </div>
        </div>
      </div>

      <footer className="source-workspace-footer"><span aria-hidden="true">✓</span><p><strong>Your code is protected.</strong> This workspace can inspect files, but it cannot edit or save them.</p></footer>
    </section>
  );
}

type SafetyFinding = {
  id: string;
  status: "risk" | "passed";
  severity: "critical" | "high" | "medium" | "verified";
  category: string;
  title: string;
  summary: string;
  check: string;
  evidence: string;
  scenario: string;
  impact: string;
  recommendation: string;
  affected: readonly string[];
  fileName: string;
  filePath: string;
  code: string;
};

const safetyFindingCatalog: readonly SafetyFinding[] = [
  {
    id: "negative-total",
    status: "risk",
    severity: "high",
    category: "Business logic",
    title: "Empty orders can produce a negative total",
    summary: "A valid-looking boundary input violates the payment rule and may turn checkout into a refund.",
    check: "Executed the pricing function with quantity 0 and compared the result with the business invariant that an order total must be at least $0.",
    evidence: "The real boundary run returned a total below zero.",
    scenario: "A shopper or automated client submits an empty cart. Shipping is subtracted from zero, and the negative amount reaches checkout logic.",
    impact: "Incorrect refunds, broken payment requests, misleading receipts, and reconciliation failures.",
    recommendation: "Reject quantities below 1 at the API boundary and add shipping instead of subtracting it from the calculated order total.",
    affected: ["Pricing", "Checkout API", "Payments", "Order receipts"],
    fileName: "pricing.ts",
    filePath: "lib/pricing.ts",
    code: `const total = subtotal - discount - knobs.shippingFee;
return { subtotal, discount, total };`,
  },
  {
    id: "oversized-input",
    status: "risk",
    severity: "high",
    category: "Input validation",
    title: "Oversized text has no enforced limit",
    summary: "Very long names, notes, or payload fields can trigger database exceptions or consume excessive memory and processing time.",
    check: "Reviewed external string fields for server-side schemas, maximum lengths, request-size limits, and safe Unicode handling.",
    evidence: "The order note is written after JSON parsing without a visible length constraint or request-body cap.",
    scenario: "An automated client sends a multi-megabyte note or an unexpectedly long Unicode string repeatedly.",
    impact: "Character-length exceptions, slow requests, memory pressure, larger storage costs, and denial of service.",
    recommendation: "Validate every external field on the server, enforce a business-appropriate maximum length, cap request bodies, and return a clear 413 or 422 response.",
    affected: ["Checkout API", "Database", "Request workers", "Logs"],
    fileName: "route.ts",
    filePath: "src/app/api/orders/route.ts",
    code: `const { note } = await request.json();
await db.order.create({
  data: { note },
});`,
  },
  {
    id: "missing-rate-limit",
    status: "risk",
    severity: "critical",
    category: "Abuse prevention",
    title: "Checkout has no rate limit or usage quota",
    summary: "One caller can repeatedly trigger an expensive business flow without a visible per-user, per-IP, or global budget.",
    check: "Traced the checkout request from the public route through payment creation and looked for throttling, concurrency limits, and cost guardrails.",
    evidence: "The endpoint immediately starts checkout work; no limiter, quota decision, retry-after response, or provider spending guard appears in the request path.",
    scenario: "A bot floods checkout with concurrent requests or cycles across accounts to exhaust workers and create payment-provider traffic.",
    impact: "Service degradation, denial of service, payment-provider costs, noisy alerts, and reduced capacity for real customers.",
    recommendation: "Apply identity-aware and IP-aware rate limits, cap concurrent checkout work, return Retry-After, and add provider cost alerts and circuit breakers.",
    affected: ["Edge", "Checkout API", "Payment provider", "Observability"],
    fileName: "route.ts",
    filePath: "src/app/api/checkout/route.ts",
    code: `export async function POST(request: Request) {
  const input = await request.json();
  return createCheckout(input);
}`,
  },
  {
    id: "client-payment-total",
    status: "risk",
    severity: "critical",
    category: "Trust boundaries",
    title: "Payment amount can cross the client trust boundary",
    summary: "The amount sent to the payment provider must be recalculated from trusted product data, never accepted from browser state.",
    check: "Followed the amount from the checkout request to PaymentIntent creation and checked whether the server rebuilds it from trusted prices and quantities.",
    evidence: "The sample payment path accepts a total from the request body before converting it to cents.",
    scenario: "A user changes the request payload in developer tools and submits a lower total than the products in the cart require.",
    impact: "Underpayment, fraudulent orders, accounting mismatches, disputes, and loss of inventory.",
    recommendation: "Accept only product identifiers and quantities, reload authoritative prices server-side, recalculate the amount, and verify stock before payment creation.",
    affected: ["Browser", "Checkout API", "Product catalog", "Payments"],
    fileName: "stripe.ts",
    filePath: "src/server/stripe.ts",
    code: `const { total } = await request.json();
await stripe.paymentIntents.create({
  amount: Math.round(total * 100),
  currency: "usd",
});`,
  },
  {
    id: "missing-idempotency",
    status: "risk",
    severity: "high",
    category: "Resilience",
    title: "Payment retries are not idempotent",
    summary: "A timeout or double-click can repeat a successful payment creation when retry attempts do not share an idempotency key.",
    check: "Reviewed payment creation, client retries, network-error handling, and database writes for a stable request identifier.",
    evidence: "The payment call has no idempotencyKey option and the order does not show a unique checkout-attempt key.",
    scenario: "Stripe creates the payment, the response times out, and the client retries the same checkout request.",
    impact: "Duplicate PaymentIntents, possible duplicate charges, inconsistent orders, support burden, and refund costs.",
    recommendation: "Create one high-entropy idempotency key per checkout attempt, persist it with the order, and reuse it for every retry of the same operation.",
    affected: ["Checkout API", "Payments", "Order database", "Retry worker"],
    fileName: "stripe.ts",
    filePath: "src/server/stripe.ts",
    code: `return stripe.paymentIntents.create({
  amount: amountInCents,
  currency: "usd",
});`,
  },
  {
    id: "order-authorization",
    status: "risk",
    severity: "critical",
    category: "Authorization",
    title: "Order lookup does not prove ownership",
    summary: "An authenticated user must be authorized for the specific order object, not merely allowed to call the endpoint.",
    check: "Reviewed object lookup filters and compared the requested order identifier with the authenticated account or workspace.",
    evidence: "The sample query filters by order id alone; no account, user, or workspace ownership constraint is visible.",
    scenario: "A signed-in user changes an order id in the URL and receives another customer’s order details.",
    impact: "Personal-data exposure, order tampering, compliance incidents, and broken tenant isolation.",
    recommendation: "Scope every object query to the authenticated tenant and subject, deny by default, and add cross-account authorization tests.",
    affected: ["Orders API", "Authentication", "Database", "Customer data"],
    fileName: "[orderId].ts",
    filePath: "src/app/api/orders/[orderId]/route.ts",
    code: `const order = await db.order.findUnique({
  where: { id: params.orderId },
});
return Response.json(order);`,
  },
  {
    id: "error-disclosure",
    status: "risk",
    severity: "medium",
    category: "Information exposure",
    title: "Internal error details can reach clients",
    summary: "Raw exceptions and stack traces can reveal file paths, libraries, queries, and implementation details useful to attackers.",
    check: "Reviewed API catch blocks, response serialization, structured logging, and correlation-id behavior.",
    evidence: "The sample handler serializes error.stack into the response body.",
    scenario: "A malformed request intentionally triggers an exception, and the response exposes internal code locations and dependency details.",
    impact: "Information disclosure, easier exploit development, accidental personal-data leakage, and confusing customer messages.",
    recommendation: "Return a generic public error with a correlation id, record structured internal details only in protected logs, and redact secrets and personal data.",
    affected: ["API responses", "Logs", "Monitoring", "Customer support"],
    fileName: "route.ts",
    filePath: "src/app/api/checkout/route.ts",
    code: `} catch (error) {
  return Response.json(
    { error: error.stack },
    { status: 500 },
  );
}`,
  },
  {
    id: "webhook-signature",
    status: "passed",
    severity: "verified",
    category: "Integration security",
    title: "Payment webhook verifies its signature",
    summary: "The handler checks the raw payload and Stripe signature before trusting a payment event.",
    check: "Verified that the raw body, Stripe-Signature header, and endpoint secret are passed to the provider’s verification function before event processing.",
    evidence: "Signature construction occurs before the event type is read or an order is updated.",
    scenario: "A forged request without a valid provider signature is rejected before it can mark an order as paid.",
    impact: "This protection reduces forged-payment events and unauthorized order-state changes.",
    recommendation: "Keep the signature check first, rotate webhook secrets safely, reject replayed events, and cover invalid signatures in automated tests.",
    affected: ["Webhook endpoint", "Payments", "Order status", "Secrets"],
    fileName: "webhook.ts",
    filePath: "src/app/api/stripe/webhook.ts",
    code: `const event = stripe.webhooks.constructEvent(
  rawBody,
  request.headers.get("stripe-signature"),
  env.STRIPE_WEBHOOK_SECRET,
);`,
  },
];

type SafetyFilter = "all" | "risks" | "passed";

function SafetyTests({ results, shippingFee }: { results: ReturnType<typeof stressTest>; shippingFee: number }) {
  const [filter, setFilter] = useState<SafetyFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState(safetyFindingCatalog[0].id);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFindings = useMemo(() => safetyFindingCatalog.filter((finding) => {
    const matchesFilter = filter === "all" || (filter === "risks" ? finding.status === "risk" : finding.status === "passed");
    const matchesQuery = !normalizedQuery || [finding.title, finding.summary, finding.category, finding.severity, ...finding.affected]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesFilter && matchesQuery;
  }), [filter, normalizedQuery]);

  useEffect(() => {
    if (filteredFindings.length > 0 && !filteredFindings.some((finding) => finding.id === selectedFindingId)) {
      setSelectedFindingId(filteredFindings[0].id);
    }
  }, [filteredFindings, selectedFindingId]);

  const selectedFinding = safetyFindingCatalog.find((finding) => finding.id === selectedFindingId) ?? safetyFindingCatalog[0];
  const emptyOrder = results.find((result) => result.quantity === 0);
  const selectedEvidence = selectedFinding.id === "negative-total"
    ? `The executed quantity-0 check expected at least $0.00 and received −${preciseMoney.format(Math.abs(emptyOrder?.total ?? shippingFee))}.`
    : selectedFinding.evidence;
  const severityLabels = { critical: "Critical", high: "High", medium: "Medium", verified: "Verified" } as const;

  return (
    <div className="tests-layout safety-review-layout">
      <section className="panel test-list-panel safety-findings-panel">
        <div className="safety-review-heading">
          <div><span className="section-kicker">SYSTEM-WIDE SAFETY REVIEW</span><h2>Errors and security risks across the application</h2><p>Business behavior, APIs, trust boundaries, abuse controls, payments, and resilience are reviewed together.</p></div>
          <span className="review-scope-pill">Guided architecture review</span>
        </div>

        <div className="safety-review-boundary" role="note"><span aria-hidden="true">i</span><p><strong>What is real in this prototype?</strong>The pricing boundary test executes the bundled ShopSpring function. Security findings are guided code-review examples based on the sample architecture, not proof that an imported project was exploited.</p></div>

        <div className="safety-toolbar">
          <div className="safety-filter" aria-label="Filter safety findings">
            {(["all", "risks", "passed"] as const).map((option) => <button type="button" className={filter === option ? "active" : ""} onClick={() => setFilter(option)} key={option}>{option === "all" ? "All findings" : option === "risks" ? "Risks only" : "Passed protections"}</button>)}
          </div>
          <label className="safety-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search safety findings</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search risks or systems" /></label>
        </div>

        <ul className="safety-finding-list" aria-label="Application safety findings">
          {filteredFindings.map((finding) => (
            <li key={finding.id}>
              <button type="button" className={`${finding.status} ${selectedFinding.id === finding.id ? "selected" : ""}`} onClick={() => setSelectedFindingId(finding.id)} aria-pressed={selectedFinding.id === finding.id}>
                <span className={`finding-severity-icon ${finding.severity}`} aria-hidden="true">{finding.status === "passed" ? "✓" : finding.severity === "critical" ? "C" : finding.severity === "high" ? "H" : "M"}</span>
                <span className="finding-list-copy"><span>{finding.category}</span><strong>{finding.title}</strong><small>{finding.summary}</small></span>
                <span className={`finding-severity-pill ${finding.severity}`}>{severityLabels[finding.severity]}</span>
                <span className="finding-open-icon" aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>

        {filteredFindings.length === 0 ? <div className="safety-empty-state" role="status"><span aria-hidden="true">⌕</span><strong>No findings match this search.</strong><button type="button" className="text-button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div> : null}
      </section>

      <aside className={`panel test-detail safety-detail-panel ${selectedFinding.status}`} aria-live="polite">
        <div className="safety-detail-tags"><span>{selectedFinding.category}</span><span className={selectedFinding.severity}>{severityLabels[selectedFinding.severity]}</span></div>
        <h2>{selectedFinding.title}</h2>
        <p className="safety-detail-summary">{selectedFinding.summary}</p>

        <div className="safety-risk-path" aria-label="Risk path">
          <div><span>1</span><strong>Trigger</strong><small>{selectedFinding.category}</small></div><i aria-hidden="true">→</i>
          <div><span>2</span><strong>Weakness</strong><small>{selectedFinding.status === "passed" ? "Protection present" : "Guard missing"}</small></div><i aria-hidden="true">→</i>
          <div><span>3</span><strong>Impact</strong><small>{selectedFinding.affected[0]}</small></div>
        </div>

        <section className="safety-detail-section"><span>HOW VCAIST CHECKED</span><p>{selectedFinding.check}</p></section>
        <section className="safety-detail-section"><span>EVIDENCE</span><p>{selectedEvidence}</p></section>

        <div className="code-window safety-code-window" aria-label={`Relevant code in ${selectedFinding.fileName}`}>
          <div className="code-window-top"><span /><span /><span /><small>{selectedFinding.filePath}</small></div>
          <pre><code>{selectedFinding.code}</code></pre>
        </div>

        <section className="safety-detail-section"><span>FAILURE OR ATTACK SCENARIO</span><p>{selectedFinding.scenario}</p></section>
        <section className="safety-detail-section"><span>BUSINESS AND SYSTEM IMPACT</span><p>{selectedFinding.impact}</p></section>

        <div className="affected-system-list" aria-label="Affected systems">{selectedFinding.affected.map((system) => <span key={system}>{system}</span>)}</div>

        <div className={`safety-recommendation ${selectedFinding.status}`}><span aria-hidden="true">{selectedFinding.status === "passed" ? "✓" : "↳"}</span><div><strong>{selectedFinding.status === "passed" ? "Keep this protection" : "Recommended protection"}</strong><p>{selectedFinding.recommendation}</p></div></div>
        <button className="button disabled full" disabled title="Patch approvals are planned for a later version">Prepare reviewed fix for approval · Coming soon</button>
      </aside>
    </div>
  );
}
