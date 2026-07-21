"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AppChrome } from "./components/AppChrome";
import { ImportProjectDialog } from "./components/ImportProjectDialog";
import type { ImportedProject } from "@/lib/import-sources";
import type { ProjectPage, ProjectWorkflowStep } from "@/lib/project-analysis";
import {
  defaultPreferences,
  modelGroups,
  modelOptions,
  readPreferences,
  writePreferences,
  type ModelId,
} from "@/lib/preferences";
import { defaultKnobs, stressTest, type PricingKnobs } from "@/lib/pricing";

type WorkspaceView = "overview" | "application" | "compare" | "map" | "tests";
type ModelAvailability = Partial<Record<ModelId, boolean>>;

const workspaceViewGuides: Record<WorkspaceView, {
  eyebrow: string;
  title: string;
  description: string;
  actions: readonly string[];
}> = {
  overview: {
    eyebrow: "OVERVIEW · START HERE",
    title: "Understand the platform before exploring the app",
    description: "This page explains what VCAIST is for, summarizes every platform feature, and follows one app owner through the complete safe-analysis story. Application pages live in Current Application, while side-by-side interface review lives in Compare.",
    actions: ["Understand the purpose", "Review every feature", "Follow the example story"],
  },
  application: {
    eyebrow: "CURRENT APPLICATION · SEE AND SHAPE IT",
    title: "See every page before deciding what to change",
    description: "This page presents the connected application as a page-by-page carousel and offers an AI change assistant that must ask for permission before it can help plan an edit.",
    actions: ["Browse every detected page", "Choose a page to discuss", "Approve AI help before chatting"],
  },
  compare: {
    eyebrow: "COMPARE · INTERFACE TO INTERFACE",
    title: "Compare your current app with another app",
    description: "This page places two application interfaces side by side. Keep your connected app on the left, choose a second app from a local folder, Google Drive, or GitHub, and move through each page carousel independently.",
    actions: ["Keep your current app visible", "Choose a second app", "Compare every page"],
  },
  map: {
    eyebrow: "APP MAP · FOLLOW THE FLOW",
    title: "Follow the workflow, source code, and data relationships",
    description: "This page connects the customer journey to the files, functions, APIs, services, and stored entities that respond. Inspect workflow source, read the entity relationship diagram, and open detected runtime or compile-time problems in Safety Tests.",
    actions: ["Follow the customer journey", "Inspect source and data", "Open errors in Safety Tests"],
  },
  tests: {
    eyebrow: "SAFETY TESTS · CATCH SURPRISES",
    title: "Review safety from customer input to system architecture",
    description: "This page combines import privacy checks, executed behavior checks, and guided system-design review. Search secret exposure, business errors, input limits, rate limiting, authorization, payment integrity, resilience, and information-exposure risks, then select any finding for full evidence and protection guidance.",
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

const preciseMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const viewOptions: Array<{ id: WorkspaceView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "application", label: "Current Application" },
  { id: "compare", label: "Compare" },
  { id: "map", label: "App Map" },
  { id: "tests", label: "Safety Tests" },
];

export function Dashboard({ startWithImporter = false }: { startWithImporter?: boolean }) {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [knobs] = useState<PricingKnobs>(defaultKnobs);
  const [model, setModel] = useState<ModelId>(defaultPreferences.model);
  const [modelAvailability, setModelAvailability] = useState<ModelAvailability>({});
  const [unavailableModel, setUnavailableModel] = useState<ModelId | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanCacheHit, setScanCacheHit] = useState(false);
  const [scanMessage, setScanMessage] = useState(
    startWithImporter ? "Choose a project source to begin" : "Demo app · Last checked 2 minutes ago",
  );
  const [mapMode, setMapMode] = useState<"plain" | "technical">("plain");
  const [importOpen, setImportOpen] = useState(startWithImporter);
  const [comparisonImportOpen, setComparisonImportOpen] = useState(false);
  const [comparisonProject, setComparisonProject] = useState<ImportedProject | null>(null);
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
    const timer = window.setTimeout(() => setModel(readPreferences().model), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/models", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ models?: Array<{ id: ModelId; available: boolean }> }> : null)
      .then((body) => {
        if (!active || !body?.models) return;
        setModelAvailability(Object.fromEntries(body.models.map((entry) => [entry.id, entry.available])) as ModelAvailability);
      })
      .catch(() => {
        // The chat endpoint remains the source of truth if availability cannot load.
      });
    return () => { active = false; };
  }, []);

  const testResults = useMemo(() => stressTest(knobs), [knobs]);
  const runtimeErrorCount = project.source === "demo" ? testResults.filter((result) => !result.passed).length : 0;

  function updateModel(nextModel: ModelId) {
    if (modelAvailability[nextModel] === false) {
      setUnavailableModel(nextModel);
      return;
    }
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
          <label className={modelAvailability[model] === false ? "model-picker unavailable" : "model-picker"}>
            <span className="model-dot" aria-hidden="true" />
            <span className="sr-only">AI model</span>
            <select value={model} onChange={(event) => updateModel(event.target.value as ModelId)} aria-label="AI model">
              {modelGroups.map((group) => (
                <optgroup label={group.menuLabel} key={group.label}>
                  {group.options.map((option) => (
                    <option value={option.id} key={option.id}>{option.label} · USD {option.menuPrice} per 1M tokens{modelAvailability[option.id] === false ? " · unavailable" : ""}</option>
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
        {projectReady && view === "overview" ? <ProgramOverview project={project} /> : null}

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

        {projectReady && project.privacy ? (
          <div
            className={project.privacy.exposedSecretFileCount ? "privacy-boundary-alert critical" : "privacy-boundary-alert"}
            role={project.privacy.exposedSecretFileCount ? "alert" : "note"}
          >
            <span className="privacy-boundary-icon" aria-hidden="true">{project.privacy.exposedSecretFileCount ? "!" : "✓"}</span>
            <div>
              <strong>{project.privacy.exposedSecretFileCount
                ? "Sensitive configuration was blocked before analysis"
                : "Project privacy boundary enforced"}</strong>
              <p>{project.privacy.exposedSecretFileCount
                ? `${project.privacy.exposedSecretFileCount} suspicious file path${project.privacy.exposedSecretFileCount === 1 ? " was" : "s were"} found outside .gitignore. No secret contents were opened or retained.`
                : `${project.privacy.excludedFileCount} ignored or sensitive file${project.privacy.excludedFileCount === 1 ? " was" : "s were"} excluded before source analysis.`}</p>
            </div>
            {project.privacy.exposedSecretFileCount ? <button type="button" className="button dark" onClick={() => setView("tests")}>Review Critical Safety Test</button> : null}
          </div>
        ) : null}

        {scanning ? <ProjectScanProgress project={project} /> : null}

        {projectReady && project.source !== "demo" ? (
          <div className="prototype-notice complete" role="note">
            <span className="notice-complete-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Project analysis is complete. Nothing is still loading.</strong>
              <span>{project.analysis
                ? `${project.analysis.analyzedFileCount} approved files were read into a private, redacted manifest. Every workspace page below now uses the detected ${project.analysis.kind} structure.`
                : "The approved source index is ready."}</span>
              <small>{scanCacheHit
                ? "This folder matched the private cache on this device, so repeat indexing was skipped."
                : "This project fingerprint is now cached privately on this device for faster repeat loads."}</small>
            </div>
          </div>
        ) : null}

        {projectReady && view === "application" ? (
          <CurrentApplication project={project} model={model} onModelUnavailable={() => setUnavailableModel(model)} />
        ) : null}

        {projectReady && view === "compare" ? (
          <CompareApplications
            currentProject={project}
            comparisonProject={comparisonProject}
            onChooseComparison={() => setComparisonImportOpen(true)}
          />
        ) : null}

        {projectReady && view === "map" ? (
          <AppMap
            project={project}
            mode={mapMode}
            setMode={setMapMode}
            runtimeErrorCount={runtimeErrorCount}
            compileErrorCount={0}
            onOpenSafetyTests={() => {
              setView("tests");
              window.requestAnimationFrame(() => document.getElementById("workspace-view-introduction")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
          />
        ) : null}
        {projectReady && view === "tests" ? <SafetyTests results={testResults} shippingFee={knobs.shippingFee} project={project} /> : null}
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
      {comparisonImportOpen ? (
        <ImportProjectDialog
          eyebrow="COMPARISON APPLICATION"
          title="Which app would you like to compare?"
          description="Choose a local folder, Google Drive folder, or public GitHub repository. Your current application stays connected."
          onClose={() => setComparisonImportOpen(false)}
          onImport={(nextProject) => {
            setComparisonProject(nextProject);
            setComparisonImportOpen(false);
          }}
        />
      ) : null}
      {unavailableModel ? (
        <ModelUnavailableDialog model={unavailableModel} onClose={() => setUnavailableModel(null)} />
      ) : null}
    </AppChrome>
  );
}

function WorkspaceViewIntroduction({ view }: { view: WorkspaceView }) {
  const guide = workspaceViewGuides[view];
  const viewMarks: Record<WorkspaceView, string> = {
    overview: "◎",
    application: "▦",
    compare: "⇄",
    map: "⌁",
    tests: "!",
  };

  return (
    <section
      id="workspace-view-introduction"
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

const demoApplicationPages: readonly ProjectPage[] = [
  { id: "home", name: "Home", route: "/", purpose: "Brand story and featured products", sourcePath: "src/app/page.tsx", summary: "A candle storefront introduces the brand and featured products.", headings: ["Make everyday rituals feel considered."], navigation: ["New", "Shop", "Our story"], code: "export default function HomePage() {\n  return <Storefront />;\n}" },
  { id: "catalog", name: "Catalog", route: "/shop", purpose: "Browse and compare the full collection", sourcePath: "src/app/shop/page.tsx", summary: "The full candle collection appears in a product grid.", headings: ["Find your next favorite"], navigation: ["New", "Shop", "Our story"], code: "export default function CatalogPage() {\n  return <ProductGrid />;\n}" },
  { id: "cart", name: "Cart", route: "/cart", purpose: "Review items, discounts, and totals", sourcePath: "src/app/cart/page.tsx", summary: "The shopper reviews items and the calculated order total.", headings: ["A few good things"], navigation: ["New", "Shop", "Our story"], code: "export default function CartPage() {\n  return <Cart />;\n}" },
  { id: "checkout", name: "Checkout", route: "/checkout", purpose: "Confirm delivery and payment", sourcePath: "src/app/checkout/page.tsx", summary: "The shopper confirms delivery details before payment.", headings: ["Where should we send it?"], navigation: ["New", "Shop", "Our story"], code: "export default function CheckoutPage() {\n  return <Checkout />;\n}" },
];

type ApplicationPage = ProjectPage;
type AssistantPermission = "pending" | "granted" | "declined";
type ProposalState = "none" | "ready" | "approved";
type ChatMessage = { role: "assistant" | "user"; text: string };

function pagesForProject(project: ImportedProject) {
  return project.analysis?.pages.length ? project.analysis.pages : demoApplicationPages;
}

function ApplicationCarousel({
  project,
  model,
  onModelUnavailable,
}: {
  project: ImportedProject;
  model: ModelId;
  onModelUnavailable: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pages = pagesForProject(project);
  const safeActiveIndex = activeIndex % pages.length;
  const activePage = pages[safeActiveIndex];

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
        <span className="page-inventory-pill">{pages.length} {pages.length === 1 ? "view" : "views"} found</span>
      </div>

      <div className="application-carousel-layout">
        <ApplicationInterfaceCarousel project={project} activeIndex={safeActiveIndex} onPageChange={setActiveIndex} contextLabel="Preview" />

        <AiChangeAssistant page={activePage} projectName={project.name} model={model} onModelUnavailable={onModelUnavailable} />
      </div>
    </section>
  );
}

function ApplicationInterfaceCarousel({
  project,
  activeIndex,
  onPageChange,
  contextLabel,
  compact = false,
}: {
  project: ImportedProject;
  activeIndex: number;
  onPageChange: (index: number) => void;
  contextLabel: string;
  compact?: boolean;
}) {
  const pages = pagesForProject(project);
  const safeActiveIndex = activeIndex % pages.length;
  const activePage = pages[safeActiveIndex];
  const isGuidedDemo = project.source === "demo";

  function movePage(direction: number) {
    onPageChange((safeActiveIndex + direction + pages.length) % pages.length);
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
    <div className={compact ? "application-carousel-column compact" : "application-carousel-column"}>
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
          <span className="browser-live">{contextLabel}</span>
        </div>
        <div className="application-page-live" aria-live="polite" aria-atomic="true">
          <ApplicationPagePreview page={activePage} project={project} />
        </div>
      </div>

      <div className="carousel-controls">
        <button type="button" className="carousel-arrow" onClick={() => movePage(-1)} aria-label={`Show previous page in ${project.name}`}>←</button>
        <div>
          <strong>{activePage.name}</strong>
          <span>View {safeActiveIndex + 1} of {pages.length} · {activePage.purpose}</span>
        </div>
        <button type="button" className="carousel-arrow" onClick={() => movePage(1)} aria-label={`Show next page in ${project.name}`}>→</button>
      </div>

      <div className="application-page-list" role="tablist" aria-label={`All pages in ${project.name}`}>
        {pages.map((page, index) => (
          <button
            type="button"
            key={page.id}
            className={index === safeActiveIndex ? "application-page-tab active" : "application-page-tab"}
            onClick={() => onPageChange(index)}
            role="tab"
            aria-selected={index === safeActiveIndex}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{page.name}</strong><small>{page.route}</small></div>
          </button>
        ))}
      </div>

      {!compact ? (
        <p className="application-preview-boundary">
          {isGuidedDemo
            ? "This carousel shows all four pages in the bundled ShopSpring practice application."
            : `This structural preview was generated from ${project.analysis?.analyzedFileCount ?? 0} approved source files in ${project.name}. It shows detected routes, headings, navigation, and purpose without executing untrusted project code.`}
        </p>
      ) : null}
    </div>
  );
}

function CompareApplications({
  currentProject,
  comparisonProject,
  onChooseComparison,
}: {
  currentProject: ImportedProject;
  comparisonProject: ImportedProject | null;
  onChooseComparison: () => void;
}) {
  return (
    <section className="panel compare-applications-panel" aria-labelledby="compare-applications-title">
      <div className="compare-applications-heading">
        <div><span className="section-kicker">SIDE-BY-SIDE INTERFACES</span><h2 id="compare-applications-title">Compare two applications page by page</h2><p>Each side uses its own detected page manifest. Move through real routes, headings, navigation, and purpose without changing either project.</p></div>
        <button type="button" className={comparisonProject ? "button ghost" : "button dark"} onClick={onChooseComparison}>{comparisonProject ? "Choose another app" : "Choose comparison app"} <span aria-hidden="true">＋</span></button>
      </div>

      <div className="compare-carousel-grid">
        <ComparisonAppCarousel project={currentProject} label="Current application" contextLabel="Current" />
        {comparisonProject ? (
          <ComparisonAppCarousel project={comparisonProject} label="Comparison application" contextLabel="Compare" />
        ) : (
          <article className="comparison-app-empty" aria-labelledby="comparison-empty-title">
            <span className="comparison-empty-mark" aria-hidden="true">⇄</span>
            <span className="section-kicker">ADD A SECOND APPLICATION</span>
            <h3 id="comparison-empty-title">What would you like to compare with {currentProject.name}?</h3>
            <p>Select another project. Your current application stays connected and neither source is changed.</p>
            <button type="button" className="button dark" onClick={onChooseComparison}>Choose comparison app <span aria-hidden="true">→</span></button>
            <div className="comparison-source-options" aria-label="Comparison project sources"><span>⌁ Local folder</span><span>△ Google Drive</span><span>GH GitHub</span></div>
          </article>
        )}
      </div>

      <div className="comparison-preview-note" role="note"><span aria-hidden="true">i</span><p><strong>Safe structural comparison</strong>Each carousel is generated independently from approved source. VCAIST does not execute imported code or claim that this is a pixel-perfect browser render.</p></div>
    </section>
  );
}

function ComparisonAppCarousel({ project, label, contextLabel }: { project: ImportedProject; label: string; contextLabel: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pages = pagesForProject(project);

  return (
    <article className="comparison-app-card">
      <header className="comparison-app-heading">
        <div><span>{label}</span><h3>{project.name}</h3><p>{project.sourceLabel} · {project.fileCount} source files</p></div>
        <span className="comparison-page-count">{pages.length} {pages.length === 1 ? "view" : "views"}</span>
      </header>
      <ApplicationInterfaceCarousel project={project} activeIndex={activeIndex} onPageChange={setActiveIndex} contextLabel={contextLabel} compact />
    </article>
  );
}

function AiChangeAssistant({
  page,
  projectName,
  model,
  onModelUnavailable,
}: {
  page: ApplicationPage;
  projectName: string;
  model: ModelId;
  onModelUnavailable: () => void;
}) {
  const [permission, setPermission] = useState<AssistantPermission>("pending");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [proposalState, setProposalState] = useState<ProposalState>("none");
  const [submitting, setSubmitting] = useState(false);
  const modelLabel = modelOptions.find((option) => option.id === model)?.label ?? model;

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

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = message.trim();
    if (!request || permission !== "granted" || submitting) return;

    const userMessage: ChatMessage = { role: "user", text: request };
    const nextMessages: ChatMessage[] = [...messages, userMessage].slice(-10);
    setMessages(nextMessages);
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          project: projectName,
          page: `${page.name} (${page.route})`,
          messages: nextMessages,
        }),
      });
      const body = await response.json() as { code?: string; message?: string; output?: string };
      if (!response.ok || typeof body.output !== "string" || !body.output.trim()) {
        if (body.code === "MODEL_UNAVAILABLE" || response.status === 503) {
          onModelUnavailable();
        } else {
          setMessages((current) => [...current, {
            role: "assistant",
            text: body.message || "I could not prepare that plan. Please wait a moment and try again.",
          }]);
        }
        return;
      }

      setMessages((current) => [...current, { role: "assistant", text: body.output!.trim() }]);
      setProposalState("ready");
    } catch {
      onModelUnavailable();
    } finally {
      setSubmitting(false);
    }
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
        <div><h3 id="ai-change-chat-title">Change assistant</h3><p>{modelLabel} · permission required · live app protected</p></div>
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
          <div className="chat-message-list" aria-live="polite" aria-busy={submitting}>
            {messages.map((chatMessage, index) => (
              <div className={`chat-bubble ${chatMessage.role}`} key={`${chatMessage.role}-${index}`}>
                <strong>{chatMessage.role === "assistant" ? "VCAIST AI" : "You"}</strong>
                <p>{chatMessage.text}</p>
              </div>
            ))}
            {submitting ? <div className="chat-bubble assistant thinking"><strong>VCAIST AI</strong><p>Preparing a reviewable plan…</p></div> : null}
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
              maxLength={4000}
              disabled={submitting}
            />
            <button type="submit" className="button dark" disabled={!message.trim() || submitting}>{submitting ? "Thinking…" : "Send request"} <span aria-hidden="true">↑</span></button>
          </form>
        </>
      ) : null}
    </aside>
  );
}

function ApplicationPagePreview({ page, project }: { page: ApplicationPage; project: ImportedProject }) {
  if (project.source === "demo") return <ShopSpringPagePreview page={page} projectName={project.name} />;

  const kind = project.analysis?.kind ?? "application";
  const headings = page.headings.length ? page.headings : [page.name, page.purpose];
  const navigation = page.navigation.length ? page.navigation : pagesForProject(project).map((entry) => entry.name).slice(0, 5);

  return (
    <div className={`detected-preview-page ${kind}`}>
      <header className="detected-preview-header">
        <div><span className="detected-brand-mark" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span><strong>{project.name}</strong></div>
        <nav aria-label={`${page.name} detected navigation`}>{navigation.map((item) => <span key={item}>{item}</span>)}</nav>
        <span className="detected-route-pill">{page.route}</span>
      </header>
      <div className="detected-preview-body">
        <section className="detected-preview-hero">
          <span className="section-kicker">DETECTED {kind.toUpperCase()} VIEW</span>
          <h3>{headings[0]}</h3>
          <p>{page.summary}</p>
          <div className="detected-preview-actions"><span>Primary content</span><span>Source-backed structure</span></div>
        </section>
        <aside className="detected-preview-visual" aria-label="Detected page structure">
          <span className="detected-visual-label">{page.name}</span>
          <div className="detected-visual-window"><i /><i /><i /></div>
          <strong>{page.purpose}</strong>
          <small>{page.sourcePath}</small>
        </aside>
      </div>
      <div className="detected-content-grid">
        {headings.slice(1, 4).map((heading, index) => <article key={heading}><span>{String(index + 1).padStart(2, "0")}</span><strong>{heading}</strong><small>Detected in approved page source</small></article>)}
        {headings.length === 1 ? <article><span>01</span><strong>{page.purpose}</strong><small>Primary responsibility of this view</small></article> : null}
      </div>
      <footer className="detected-preview-footer"><span>{project.analysis?.framework}</span><span>Read-only structural preview</span></footer>
    </div>
  );
}

function ShopSpringPagePreview({ page, projectName }: { page: ApplicationPage; projectName: string }) {
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

function CurrentApplication({ project, model, onModelUnavailable }: { project: ImportedProject; model: ModelId; onModelUnavailable: () => void }) {
  return (
    <div className="view-stack">
      <ApplicationCarousel project={project} model={model} onModelUnavailable={onModelUnavailable} />
    </div>
  );
}

function ModelUnavailableDialog({ model, onClose }: { model: ModelId; onClose: () => void }) {
  const label = modelOptions.find((option) => option.id === model)?.label ?? model;

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="model-unavailable-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="model-unavailable-dialog" role="dialog" aria-modal="true" aria-labelledby="model-unavailable-title" aria-describedby="model-unavailable-description">
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close model unavailable message">×</button>
        <span className="model-unavailable-icon" aria-hidden="true">!</span>
        <span className="section-kicker">MODEL UNAVAILABLE</span>
        <h2 id="model-unavailable-title">{label} cannot be used right now</h2>
        <p id="model-unavailable-description">This model is currently unavailable. Please select another AI model.</p>
        <button type="button" className="button dark full" onClick={onClose}>Choose another AI model</button>
      </section>
    </div>
  );
}

const programFeatures = [
  ["Choose your source", "Start with a local folder, a Google Drive folder, or a public GitHub repository."],
  ["Index files clearly", "See an explicit first-load progress state, completion message, and faster repeat checks for unchanged folders."],
  ["Compare AI models", "Choose among Frontier, Workhorse, and Efficient models from OpenAI, Anthropic, Google, Moonshot AI, and Alibaba Cloud."],
  ["Compare application interfaces", "Keep the current app visible while browsing every page of a second app in an independent carousel."],
  ["Choose either app source", "Select the comparison app from a local folder, Google Drive, or a public GitHub repository without replacing the current app."],
  ["Follow the app map", "Switch between a plain-English customer journey and technical source, then read a simple entity relationship diagram and open red-highlighted errors in Safety Tests."],
  ["Review system-wide safety", "Combine real boundary runs with guided review of input limits, abuse controls, authorization, payments, resilience, and information exposure."],
  ["Keep human approval", "Review explanations and proposed remedies first. This prototype never publishes a code change automatically."],
  ["Adjust the experience", "Use the Help center, persistent settings, four accessible color themes, and responsive phone or desktop layouts."],
] as const;

function ProgramOverview({ project }: { project: ImportedProject }) {
  const analysis = project.analysis;
  const isDemo = project.source === "demo";
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
        {!isDemo && analysis ? (
          <div className="connected-project-summary">
            <span className="section-kicker">WHAT VCAIST FOUND IN THIS APPLICATION</span>
            <h3>{project.name} is a {analysis.kind} built with {analysis.framework}</h3>
            <p>{analysis.description}</p>
            <div className="connected-project-facts">
              <span><strong>{analysis.pages.length}</strong> detected views</span>
              <span><strong>{analysis.analyzedFileCount}</strong> approved files analyzed</span>
              <span><strong>{analysis.technologies.join(" · ")}</strong> detected stack</span>
            </div>
          </div>
        ) : null}
        <p>
          VCAIST gives app owners a plain-English control room for software they depend on. It connects a project source,
          makes important rules visible, lets people test business changes safely, and explains surprising results before
          anyone decides what to change.
        </p>
        {isDemo ? <p>
          The current prototype indexes supported project files and demonstrates the complete analysis loop with the bundled
          ShopSpring pricing fixture. Project-specific AI extraction and approval-based publishing are the next backend milestones;
          the interface labels that boundary instead of pretending background analysis is still running.
        </p> : <p>
          For this connected project, the overview, interface carousel, comparison, app map, and Safety Tests are generated from
          approved source only. VCAIST does not execute imported code, open ignored secrets, or present the financial demo as project evidence.
        </p>}
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
        <div className="story-person" aria-hidden="true">{isDemo ? "M" : "A"}</div>
        <div className="story-copy">
          <span className="section-kicker">EXAMPLE USER STORY</span>
          <h3 id="program-story-title">{isDemo ? "Maya needs to understand a checkout she did not build" : `Alex wants to understand ${project.name} before requesting a change`}</h3>
          {isDemo ? <>
          <p>
            Maya runs a small online candle shop. Her developer is unavailable, but she needs to understand whether a new bulk
            discount will hurt her margin. She opens VCAIST and chooses the shop’s GitHub repository. The project is indexed,
            while the original code remains untouched.
          </p>
          <ol>
            <li><strong>Orient:</strong> Maya reads the plain-English app map and sees where checkout, pricing, and shipping connect.</li>
            <li><strong>Compare:</strong> She keeps her current app open, chooses another project, and browses matching pages in two independent carousels.</li>
            <li><strong>Catch a surprise:</strong> A zero-item safety test produces a negative total because shipping is subtracted from an empty order.</li>
            <li><strong>Act with context:</strong> Maya shares the explanation and exact failing case with her developer. Nothing is published without approval.</li>
          </ol>
          </> : <>
            <p>Alex connects {project.name} from {project.sourceLabel}. VCAIST applies the project’s ignore rules first, reads only approved source, and builds a private manifest without changing or executing the application.</p>
            <ol>
              <li><strong>Orient:</strong> Alex learns that {analysis?.description.toLowerCase()}</li>
              <li><strong>Browse:</strong> Current Application shows {analysis?.pages.length ?? 1} detected view{analysis?.pages.length === 1 ? "" : "s"}, with real routes and source-backed headings.</li>
              <li><strong>Trace:</strong> App Map connects those views to the approved files that define them.</li>
              <li><strong>Review safely:</strong> Safety Tests show only source-backed findings and privacy checks; AI change planning still requires permission.</li>
            </ol>
          </>}
        </div>
      </aside>
    </section>
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

type ErdField = {
  name: string;
  type: string;
  key?: "PK" | "FK" | "UQ";
  detail: string;
};

type ErdEntity = {
  name: string;
  tableName: string;
  purpose: string;
  fields: readonly ErdField[];
};

const appEntities: readonly ErdEntity[] = [
  {
    name: "Customer",
    tableName: "customers",
    purpose: "The account that owns orders and the private customer data attached to them.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Stable customer identifier." },
      { name: "email", type: "VARCHAR(254)", key: "UQ", detail: "Normalized, unique sign-in and receipt address." },
      { name: "displayName", type: "VARCHAR(120)", detail: "Human-readable name with a server-side length limit." },
      { name: "createdAt", type: "TIMESTAMPTZ", detail: "Auditable account creation time." },
    ],
  },
  {
    name: "Order",
    tableName: "orders",
    purpose: "The commercial record of one checkout, including totals that must remain historically stable.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Publicly unguessable order identifier." },
      { name: "customerId", type: "UUID", key: "FK", detail: "Owner; every read must be scoped to this customer or tenant." },
      { name: "status", type: "ORDER_STATUS", detail: "Draft, pending, paid, fulfilled, cancelled, or refunded." },
      { name: "subtotal", type: "DECIMAL(12,2)", detail: "Item total before adjustments." },
      { name: "discount", type: "DECIMAL(12,2)", detail: "Discount snapshot applied at checkout." },
      { name: "shippingFee", type: "DECIMAL(12,2)", detail: "Shipping snapshot; never recomputed from a later rule." },
      { name: "total", type: "DECIMAL(12,2)", detail: "Server-calculated amount, constrained to zero or greater." },
      { name: "createdAt", type: "TIMESTAMPTZ", detail: "Ordering and audit timestamp." },
    ],
  },
  {
    name: "Order Item",
    tableName: "order_items",
    purpose: "A product and quantity captured inside an order, with the price frozen at purchase time.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Line-item identifier." },
      { name: "orderId", type: "UUID", key: "FK", detail: "Parent order; delete behavior must be explicit." },
      { name: "productId", type: "UUID", key: "FK", detail: "Catalog product that was purchased." },
      { name: "quantity", type: "INTEGER", detail: "Positive item count with an upper business limit." },
      { name: "unitPriceSnapshot", type: "DECIMAL(12,2)", detail: "Purchase-time price so catalog edits cannot rewrite history." },
    ],
  },
  {
    name: "Product",
    tableName: "products",
    purpose: "The current sellable catalog item and its authoritative server-side price.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Product identifier referenced by order items." },
      { name: "sku", type: "VARCHAR(64)", key: "UQ", detail: "Unique stock-keeping identifier." },
      { name: "name", type: "VARCHAR(160)", detail: "Customer-facing product name." },
      { name: "currentUnitPrice", type: "DECIMAL(12,2)", detail: "Trusted price loaded by the server during checkout." },
      { name: "active", type: "BOOLEAN", detail: "Prevents new sales without deleting historical references." },
    ],
  },
  {
    name: "Payment Attempt",
    tableName: "payment_attempts",
    purpose: "Every provider request or retry for an order, retained separately for reconciliation and incident review.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Internal payment-attempt identifier." },
      { name: "orderId", type: "UUID", key: "FK", detail: "Order being paid." },
      { name: "providerPaymentId", type: "VARCHAR(255)", key: "UQ", detail: "Unique Stripe PaymentIntent or equivalent provider id." },
      { name: "idempotencyKey", type: "VARCHAR(255)", key: "UQ", detail: "Stable retry key that prevents duplicate creation." },
      { name: "amount", type: "DECIMAL(12,2)", detail: "Amount sent to the provider, matched against the order total." },
      { name: "status", type: "PAYMENT_STATUS", detail: "Created, processing, succeeded, failed, or refunded." },
      { name: "createdAt", type: "TIMESTAMPTZ", detail: "Sequence and audit timestamp." },
    ],
  },
  {
    name: "Pricing Rule",
    tableName: "pricing_rules",
    purpose: "A versioned business rule such as a bulk discount, threshold, or shipping fee.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Rule identifier." },
      { name: "name", type: "VARCHAR(120)", key: "UQ", detail: "Stable administrative name." },
      { name: "kind", type: "RULE_KIND", detail: "Discount, threshold, fee, or other supported calculation." },
      { name: "value", type: "DECIMAL(12,4)", detail: "Rule value with explicit units and precision." },
      { name: "threshold", type: "INTEGER?", detail: "Optional activation boundary." },
      { name: "version", type: "INTEGER", detail: "Monotonic version used for reproducibility." },
      { name: "active", type: "BOOLEAN", detail: "Controls future use without deleting history." },
    ],
  },
  {
    name: "Applied Pricing Rule",
    tableName: "applied_pricing_rules",
    purpose: "The join record proving which version of each rule changed a particular order.",
    fields: [
      { name: "id", type: "UUID", key: "PK", detail: "Applied-rule identifier." },
      { name: "orderId", type: "UUID", key: "FK", detail: "Order affected by the rule." },
      { name: "pricingRuleId", type: "UUID", key: "FK", detail: "Source rule definition." },
      { name: "ruleVersion", type: "INTEGER", detail: "Exact rule version evaluated for this order." },
      { name: "amountApplied", type: "DECIMAL(12,2)", detail: "Signed monetary effect captured for audit and explanation." },
    ],
  },
];

const appEntityRelationships = [
  { from: "Customer", fromCount: "1", verb: "places", toCount: "0..*", to: "Order", detail: "A customer may have no orders or many orders; every order has exactly one owner." },
  { from: "Order", fromCount: "1", verb: "contains", toCount: "1..*", to: "Order Item", detail: "A valid order contains at least one item; every item belongs to one order." },
  { from: "Product", fromCount: "1", verb: "appears in", toCount: "0..*", to: "Order Item", detail: "A product may appear in many historical line items; each line item references one product." },
  { from: "Order", fromCount: "1", verb: "has attempts", toCount: "0..*", to: "Payment Attempt", detail: "An unpaid order may have no attempt, while retries create an auditable one-to-many history." },
  { from: "Order", fromCount: "1", verb: "records", toCount: "0..*", to: "Applied Pricing Rule", detail: "An order records every pricing adjustment that affected its stored total." },
  { from: "Pricing Rule", fromCount: "1", verb: "is captured by", toCount: "0..*", to: "Applied Pricing Rule", detail: "One versioned rule can be used by many orders without rewriting their historical outcomes." },
] as const;

function AppMap({
  project,
  mode,
  setMode,
  runtimeErrorCount,
  compileErrorCount,
  onOpenSafetyTests,
}: {
  project: ImportedProject;
  mode: "plain" | "technical";
  setMode: (mode: "plain" | "technical") => void;
  runtimeErrorCount: number;
  compileErrorCount: number;
  onOpenSafetyTests: () => void;
}) {
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const steps: readonly ProjectWorkflowStep[] = project.analysis?.workflow.length ? project.analysis.workflow : appMapSteps;
  const isDemo = project.source === "demo";

  return (
    <div className="map-layout">
      <section className="panel map-panel">
        <div className="panel-heading horizontal">
          <div><span className="section-kicker">YOUR APP, EXPLAINED</span><h2>{isDemo ? "How a purchase moves through ShopSpring" : `How visitors move through ${project.name}`}</h2><p>{isDemo ? "Follow the path from adding an item to receiving payment." : "Follow the detected interface path from the first view to the next important destination."} Select any step to inspect its approved source.</p></div>
          <div className="segmented-control" aria-label="Diagram language">
            <button className={mode === "plain" ? "active" : ""} onClick={() => setMode("plain")}>Plain English</button>
            <button className={mode === "technical" ? "active" : ""} onClick={() => setMode("technical")}>Technical</button>
          </div>
        </div>
        <div className="flow-map">
          {steps.map((step, index) => {
            const hasRuntimeError = isDemo && runtimeErrorCount > 0 && step.filePath === "lib/pricing.ts";
            return (
              <div className="flow-step-wrap" key={step.filePath}>
                <button
                  type="button"
                  className={`flow-step${selectedStep === index ? " selected" : ""}${hasRuntimeError ? " error" : ""}`}
                  onClick={() => setSelectedStep(index)}
                  aria-expanded={selectedStep === index}
                  aria-controls="app-map-source-workspace"
                  aria-label={`${mode === "plain" ? step.plainTitle : step.technicalTitle}${hasRuntimeError ? ", runtime error detected" : ""}`}
                >
                  <span className="flow-icon">{step.icon}</span>
                  <strong>{mode === "plain" ? step.plainTitle : step.technicalTitle}</strong>
                  <small>{mode === "plain" ? step.plainDetail : step.technicalDetail}</small>
                  {hasRuntimeError ? <span className="flow-error-status">Runtime error · {step.fileName}</span> : null}
                  <span className="flow-source-action">View source <b aria-hidden="true">↓</b></span>
                </button>
                {index < steps.length - 1 ? <span className="flow-arrow" aria-hidden="true">→</span> : null}
              </div>
            );
          })}
        </div>

        {selectedStep === null ? (
          <div className="source-workspace-prompt" id="app-map-source-workspace" role="note"><span aria-hidden="true">{`{ }`}</span><p><strong>Select any step to inspect its source</strong>The file will open here in a read-only workspace.</p></div>
        ) : <SourceCodeWorkspace project={project} steps={steps} selectedStep={selectedStep} onSelect={setSelectedStep} runtimeErrorCount={runtimeErrorCount} />}
      </section>
      <aside className="panel map-insight">
        <div className="insight-icon" aria-hidden="true">◎</div><span className="section-kicker">VCAIST NOTICED</span>
        <h2>{isDemo ? "One rule affects two important moments" : `${project.name} has ${steps.length} connected interface steps`}</h2>
        <p>{isDemo ? "The same pricing function sets the number at checkout and the amount sent to Stripe. A mistake here reaches real payments." : `VCAIST traced these steps to ${new Set(steps.map((step) => step.filePath)).size} approved source modules. Select a step to see the exact redacted source excerpt.`}</p>
        <div className="impact-list">{isDemo ? <><div><span>Checkout total</span><strong>Direct impact</strong></div><div><span>Payment charge</span><strong>Direct impact</strong></div><div><span>Order receipt</span><strong>Copies total</strong></div></> : <><div><span>Application type</span><strong>{project.analysis?.kind}</strong></div><div><span>Detected framework</span><strong>{project.analysis?.framework}</strong></div><div><span>Approved files</span><strong>{project.analysis?.analyzedFileCount}</strong></div></>}</div>
      </aside>
      <EntityRelationshipSection
        project={project}
        runtimeErrorCount={runtimeErrorCount}
        compileErrorCount={compileErrorCount}
        onOpenSafetyTests={onOpenSafetyTests}
      />
    </div>
  );
}

function EntityRelationshipSection({
  project,
  runtimeErrorCount,
  compileErrorCount,
  onOpenSafetyTests,
}: {
  project: ImportedProject;
  runtimeErrorCount: number;
  compileErrorCount: number;
  onOpenSafetyTests: () => void;
}) {
  const hasErrors = runtimeErrorCount > 0 || compileErrorCount > 0;
  const isDemo = project.source === "demo";
  const entities = project.analysis?.entities ?? [
    { name: "Customer", attributes: ["customer_id · PK", "email", "name"] },
    { name: "Order", attributes: ["order_id · PK", "customer_id · FK", "total", "status"] },
    { name: "Order Item", attributes: ["item_id · PK", "order_id · FK", "product_id · FK", "quantity"] },
    { name: "Product", attributes: ["product_id · PK", "sku", "name", "current_price"] },
  ];
  const relationships = project.analysis?.relationships ?? [
    { from: "Customer", fromCount: "1" as const, name: "places", toCount: "M" as const, to: "Order" },
    { from: "Order", fromCount: "1" as const, name: "contains", toCount: "M" as const, to: "Order Item" },
    { from: "Order Item", fromCount: "M" as const, name: "references", toCount: "1" as const, to: "Product" },
  ];

  return (
    <section className="panel erd-section" aria-labelledby="erd-title">
      <div className="erd-heading">
        <div>
          <span className="section-kicker">ENTITY RELATIONSHIP DIAGRAM</span>
          <h2 id="erd-title">{isDemo ? "The four records behind a ShopSpring order" : `The main concepts detected in ${project.name}`}</h2>
        </div>
        <span className="erd-model-badge">Simple conceptual model</span>
      </div>

      <div className="simple-erd-explanation">
        <h3>What is an entity relationship diagram?</h3>
        <p>An ERD is a picture of the information an application stores and how those records connect. <strong>Rectangles are entities</strong>, <strong>diamonds are relationships</strong>, and <strong>ovals are important attributes</strong>. The labels <code>1</code> and <code>M</code> mean “one” and “many.” Underlined attributes are primary keys; attributes marked <code>FK</code> point to another entity.</p>
      </div>

      <div className="erd-scope-note" role="note"><span aria-hidden="true">i</span><p><strong>How to interpret this diagram</strong>{isDemo ? "This is VCAIST’s conceptual model of the bundled ShopSpring example." : `This conceptual model was inferred from the approved ${project.analysis?.kind} source manifest.`} It explains important information relationships; it is not a live database introspection and does not apply schema changes.</p></div>

      <div className="chen-erd-legend" aria-label="Entity relationship diagram legend">
        <span><i className="entity" aria-hidden="true" /> Entity</span>
        <span><i className="relationship" aria-hidden="true" /> Relationship</span>
        <span><i className="attribute" aria-hidden="true" /> Attribute</span>
        <span><b>1</b> One</span>
        <span><b>M</b> Many</span>
      </div>

      <figure className="chen-erd-diagram" aria-labelledby="erd-relationships-title">
        <figcaption id="erd-relationships-title">Read each relationship from left to right. The labels 1 and M show whether one or many records can participate.</figcaption>
        <div className="chen-erd-scroll" tabIndex={0} aria-label="Scrollable entity relationship diagram">
          <div className="chen-erd-track">
            {relationships.map((relationship, index) => {
              const from = entities.find((entity) => entity.name === relationship.from) ?? entities[0];
              const to = entities.find((entity) => entity.name === relationship.to) ?? entities[index + 1] ?? entities[0];
              return <div className="chen-relationship-row" key={`${relationship.from}-${relationship.name}-${relationship.to}`}><ChenEntity name={from.name} attributes={from.attributes} /><ChenRelationship fromCount={relationship.fromCount} name={relationship.name} toCount={relationship.toCount} /><ChenEntity name={to.name} attributes={to.attributes} /></div>;
            })}
          </div>
        </div>
      </figure>

      {hasErrors ? (
        <div className="map-diagnostic-alert error" role="alert">
          <span className="map-diagnostic-icon" aria-hidden="true">!</span>
          <div className="map-diagnostic-copy">
            <span className="section-kicker">PROGRAM ERROR DETECTED</span>
            <h3>The pricing module has a failing runtime path</h3>
            <p><strong>lib/pricing.ts</strong> returns a negative total when quantity is zero. The affected workflow module and source file are highlighted in red above.</p>
            <div className="map-diagnostic-status" aria-label="Program diagnostic status">
              <span className={runtimeErrorCount > 0 ? "error" : "healthy"}>Runtime <strong>{runtimeErrorCount > 0 ? `${runtimeErrorCount} error${runtimeErrorCount === 1 ? "" : "s"}` : "No errors"}</strong></span>
              <span className={compileErrorCount > 0 ? "error" : "healthy"}>Compile-time <strong>{compileErrorCount > 0 ? `${compileErrorCount} error${compileErrorCount === 1 ? "" : "s"}` : "No errors"}</strong></span>
            </div>
          </div>
          <button type="button" className="map-safety-button" onClick={onOpenSafetyTests}>Open Safety Tests <span aria-hidden="true">→</span></button>
        </div>
      ) : null}
    </section>
  );
}

function ChenEntity({ name, attributes }: { name: string; attributes: readonly string[] }) {
  return (
    <div className="chen-entity-group">
      <div className="chen-attributes" aria-label={`${name} attributes`}>
        {attributes.map((attribute) => {
          const isPrimaryKey = attribute.includes("· PK");
          return <span className={isPrimaryKey ? "primary" : ""} key={attribute}>{attribute}</span>;
        })}
      </div>
      <div className="chen-entity-node">{name}</div>
    </div>
  );
}

function ChenRelationship({ fromCount, name, toCount }: { fromCount: "1" | "M"; name: string; toCount: "1" | "M" }) {
  return (
    <div className="chen-relationship-node" aria-label={`${fromCount} ${name} ${toCount}`}>
      <b>{fromCount}</b><i aria-hidden="true" /><span><em>{name}</em></span><i aria-hidden="true" /><b>{toCount}</b>
    </div>
  );
}

function SourceCodeWorkspace({ project, steps, selectedStep, onSelect, runtimeErrorCount }: { project: ImportedProject; steps: readonly ProjectWorkflowStep[]; selectedStep: number; onSelect: (index: number) => void; runtimeErrorCount: number }) {
  const selectedSource = steps[selectedStep];
  const codeLines = selectedSource.code.split("\n");
  const selectedSourceHasError = project.source === "demo" && runtimeErrorCount > 0 && selectedSource.filePath === "lib/pricing.ts";

  return (
    <section className={`source-workspace${selectedSourceHasError ? " error-file" : ""}`} id="app-map-source-workspace" aria-labelledby="source-workspace-title" aria-live="polite">
      <header className="source-workspace-header">
        <div><span className="section-kicker">SOURCE WORKSPACE</span><h3 id="source-workspace-title">Code behind step {selectedStep + 1}</h3></div>
        <span className={`read-only-badge${selectedSourceHasError ? " error" : ""}`}><i aria-hidden="true">{selectedSourceHasError ? "!" : "◇"}</i> {selectedSourceHasError ? "Runtime error" : "Read only"}</span>
      </header>

      <div className="source-workspace-summary">
        <span className="source-file-mark" aria-hidden="true">TS</span>
        <div><strong>{selectedSource.fileName}</strong><code>{selectedSource.filePath}</code><p>{selectedSource.explanation}</p></div>
      </div>

      <div className="source-workspace-body">
        <nav className="source-file-list" aria-label="Files in this application flow">
          <span>FLOW FILES</span>
          {steps.map((step, index) => (
            <button
              type="button"
              key={step.filePath}
              className={`${selectedStep === index ? "active" : ""}${project.source === "demo" && runtimeErrorCount > 0 && step.filePath === "lib/pricing.ts" ? " has-error" : ""}`.trim()}
              onClick={() => onSelect(index)}
              aria-current={selectedStep === index ? "page" : undefined}
            >
              <i aria-hidden="true">{project.source === "demo" && runtimeErrorCount > 0 && step.filePath === "lib/pricing.ts" ? "!" : "{}"}</i><span><strong>{step.fileName}</strong><small>{project.source === "demo" && runtimeErrorCount > 0 && step.filePath === "lib/pricing.ts" ? "Runtime error" : `Step ${index + 1}`}</small></span>
            </button>
          ))}
        </nav>

        <div className="source-editor" aria-label={`Read-only source code for ${selectedSource.fileName}`}>
          <div className={`source-editor-tab${selectedSourceHasError ? " error" : ""}`}><span aria-hidden="true">{selectedSourceHasError ? "!" : "TS"}</span><strong>{selectedSource.fileName}</strong><small>{selectedSourceHasError ? "Runtime error" : "Read only"}</small></div>
          <div className="source-editor-breadcrumb">{project.name} <b aria-hidden="true">›</b> {selectedSource.filePath}</div>
          <div className="source-code" role="region" aria-label="Source code" tabIndex={0}>
            {codeLines.map((line, index) => {
              const lineNumber = index + 1;
              const highlighted = (selectedSource.highlightLines as readonly number[]).includes(lineNumber);
              return <div className={highlighted ? `source-code-line highlighted${selectedSourceHasError ? " error-highlight" : ""}` : "source-code-line"} key={`${selectedSource.fileName}-${lineNumber}`}><span aria-hidden="true">{lineNumber}</span><code>{line || " "}</code></div>;
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

const safetySeverityPriority: Record<SafetyFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  verified: 3,
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

const safetyFindingsByPriority = [...safetyFindingCatalog].sort(
  (left, right) => safetySeverityPriority[left.severity] - safetySeverityPriority[right.severity],
);

function createSecretExposureFinding(project: ImportedProject): SafetyFinding | null {
  const exposedCount = project.privacy?.exposedSecretFileCount ?? 0;
  if (!exposedCount) return null;

  return {
    id: "secret-file-exposure",
    status: "risk",
    severity: "critical",
    category: "Secrets and environment",
    title: "Sensitive configuration is not protected by .gitignore",
    summary: `${exposedCount} environment or secret file${exposedCount === 1 ? " was" : "s were"} visible at the project boundary without a matching ignore rule. VCAIST blocked the file${exposedCount === 1 ? "" : "s"} without opening them.`,
    check: "Compared project path metadata with built-in environment and credential filename rules, then applied every readable .gitignore policy before selecting any file for analysis.",
    evidence: `${exposedCount} suspicious file path${exposedCount === 1 ? " was" : "s were"} detected outside the effective ignore policy. File contents were not read, indexed, cached, logged, or sent to an AI provider.`,
    scenario: "A secret-bearing file is left outside .gitignore, then becomes eligible for source control, cloud synchronization, an archive, or a less careful analysis tool.",
    impact: "API keys, database credentials, signing material, or private configuration could be exposed and used to access connected systems.",
    recommendation: "Add the sensitive path to .gitignore, remove any tracked copy from source control history, rotate potentially exposed credentials, and verify that deployment secrets live only in protected server-side environment settings.",
    affected: ["Environment files", "Credentials", "Source control", "AI privacy boundary"],
    fileName: "Content withheld",
    filePath: "Project import privacy boundary",
    code: `[BLOCKED BEFORE READ]\n${exposedCount} sensitive path${exposedCount === 1 ? "" : "s"} require attention.\nNo secret content was inspected or retained.`,
  };
}

type SafetyFilter = "all" | "risks" | "passed";

function SafetyTests({ results, shippingFee, project }: { results: ReturnType<typeof stressTest>; shippingFee: number; project: ImportedProject }) {
  const [filter, setFilter] = useState<SafetyFilter>("all");
  const [query, setQuery] = useState("");
  const secretExposureFinding = useMemo(() => createSecretExposureFinding(project), [project]);
  const baseFindings = useMemo(
    () => project.source === "demo" ? safetyFindingsByPriority : [...(project.analysis?.findings ?? [])].sort(
      (left, right) => safetySeverityPriority[left.severity] - safetySeverityPriority[right.severity],
    ),
    [project],
  );
  const projectFindings = useMemo(
    () => secretExposureFinding ? [secretExposureFinding, ...baseFindings] : baseFindings,
    [baseFindings, secretExposureFinding],
  );
  const [selectedFindingId, setSelectedFindingId] = useState(
    () => secretExposureFinding?.id ?? baseFindings[0]?.id ?? "",
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFindings = useMemo(() => projectFindings.filter((finding) => {
    const matchesFilter = filter === "all" || (filter === "risks" ? finding.status === "risk" : finding.status === "passed");
    const matchesQuery = !normalizedQuery || [finding.title, finding.summary, finding.category, finding.severity, ...finding.affected]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesFilter && matchesQuery;
  }), [filter, normalizedQuery, projectFindings]);

  const selectedFinding = filteredFindings.find((finding) => finding.id === selectedFindingId)
    ?? filteredFindings[0]
    ?? projectFindings.find((finding) => finding.id === selectedFindingId)
    ?? projectFindings[0];
  const emptyOrder = results.find((result) => result.quantity === 0);
  const selectedEvidence = selectedFinding.id === "negative-total"
    ? `The executed quantity-0 check expected at least $0.00 and received −${preciseMoney.format(Math.abs(emptyOrder?.total ?? shippingFee))}.`
    : selectedFinding.evidence;
  const severityLabels = { critical: "Critical", high: "High", medium: "Medium", verified: "Verified" } as const;

  return (
    <div className="tests-layout safety-review-layout">
      <section className="panel test-list-panel safety-findings-panel">
        <div className="safety-review-heading">
          <div><span className="section-kicker">SYSTEM-WIDE SAFETY REVIEW</span><h2>Errors and security risks across {project.name}</h2><p>{project.source === "demo" ? "Business behavior, APIs, trust boundaries, abuse controls, payments, and resilience are reviewed together." : "Only privacy-boundary results and high-confidence patterns found in this project’s approved source are shown here."}</p></div>
          <span className="review-scope-pill">{project.source === "demo" ? "Guided architecture review" : "Source-backed review"}</span>
        </div>

        <div className="safety-review-boundary" role="note"><span aria-hidden="true">i</span><p><strong>What was checked?</strong>{project.source === "demo" ? "The pricing boundary test executes the bundled ShopSpring function, while security findings illustrate the sample architecture." : `${project.analysis?.analyzedFileCount ?? 0} approved source files were scanned locally after .gitignore and secret-path exclusions. Imported code was not executed, and these results do not claim to replace a build, dependency audit, or penetration test.`}</p></div>

        <div className="safety-sort-note" role="note"><span aria-hidden="true">↓</span><p><strong>Highest priority first.</strong> Critical risks appear before high and medium findings; verified protections stay at the bottom.</p></div>

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
