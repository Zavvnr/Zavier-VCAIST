export type SafeSourceDocument = {
  path: string;
  content: string;
};

export type SafePreviewAsset = {
  path: string;
  dataUrl: string;
  mimeType: string;
  fileName: string;
};

export type ProjectKind = "portfolio" | "commerce" | "blog" | "dashboard" | "api" | "application";

export type ProjectPage = {
  id: string;
  name: string;
  route: string;
  purpose: string;
  sourcePath: string;
  summary: string;
  headings: readonly string[];
  navigation: readonly string[];
  links: readonly ProjectPageLink[];
  code: string;
  previewHtml?: string;
};

export type ProjectPageLink = {
  label: string;
  destination: string;
};

export type NavigationGraphNode = {
  id: string;
  label: string;
  route: string;
  purpose: string;
  sourcePath: string;
};

export type NavigationGraphEdge = {
  from: string;
  to: string;
  label: string;
};

export type NavigationGraph = {
  title: string;
  summary: string;
  layout: "hub" | "radial" | "layers" | "network";
  nodes: readonly NavigationGraphNode[];
  edges: readonly NavigationGraphEdge[];
  rationale: string;
  generatedBy: "source" | "ai";
};

export type ApplicationOverview = {
  purpose: string;
  audience: string;
  features: readonly { title: string; description: string }[];
  storyTitle: string;
  storyIntroduction: string;
  storySteps: readonly { label: string; description: string }[];
};

export type ProjectWorkflowStep = {
  icon: string;
  plainTitle: string;
  plainDetail: string;
  technicalTitle: string;
  technicalDetail: string;
  fileName: string;
  filePath: string;
  explanation: string;
  highlightLines: readonly number[];
  code: string;
};

export type ProjectEntity = {
  name: string;
  attributes: readonly string[];
};

export type ProjectRelationship = {
  from: string;
  fromCount: "1" | "M";
  name: string;
  toCount: "1" | "M";
  to: string;
};

export type ProjectSourceFinding = {
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

export type ProjectAnalysis = {
  kind: ProjectKind;
  framework: string;
  description: string;
  technologies: readonly string[];
  pages: readonly ProjectPage[];
  workflow: readonly ProjectWorkflowStep[];
  entities: readonly ProjectEntity[];
  relationships: readonly ProjectRelationship[];
  findings: readonly ProjectSourceFinding[];
  overview: ApplicationOverview;
  navigationGraph: NavigationGraph;
  assets: readonly SafePreviewAsset[];
  analyzedFileCount: number;
  indexedFilePaths: readonly string[];
};

type AnalysisInput = {
  name: string;
  sourcePaths: readonly string[];
  documents: readonly SafeSourceDocument[];
  assets?: readonly SafePreviewAsset[];
};

const routeExtensions = "(?:js|jsx|ts|tsx|vue|svelte|astro|html)";
const secretAssignmentPattern = /\b(api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password)\b\s*[:=]\s*["'`]((?!process\.env|import\.meta\.env)[^"'`\n]{8,})["'`]/i;

export function analyzeProjectSources({ name, sourcePaths, documents, assets = [] }: AnalysisInput): ProjectAnalysis {
  const normalizedDocuments = documents
    .map((document) => ({ path: normalizePath(document.path), content: document.content }))
    .filter((document) => document.path && document.content.trim());
  const corpus = `${name}\n${normalizedDocuments.map((document) => document.content.slice(0, 60_000)).join("\n")}`.toLowerCase();
  const kind = detectProjectKind(name, corpus);
  const framework = detectFramework(sourcePaths, normalizedDocuments);
  const technologies = detectTechnologies(sourcePaths, corpus, framework);
  const pages = attachSandboxedPreviews(detectPages(normalizedDocuments, kind), normalizedDocuments, assets);
  const workflow = buildWorkflow(pages, normalizedDocuments);
  const { entities, relationships } = buildEntityModel(kind);
  const findings = scanSourceFindings(normalizedDocuments, sourcePaths);
  const overview = buildApplicationOverview(name, kind, pages, framework, technologies);
  const navigationGraph = buildSourceNavigationGraph(name, pages);

  return {
    kind,
    framework,
    description: describeProject(name, kind, pages, framework),
    technologies,
    pages,
    workflow,
    entities,
    relationships,
    findings,
    overview,
    navigationGraph,
    assets,
    analyzedFileCount: normalizedDocuments.length,
    indexedFilePaths: [...sourcePaths].sort(),
  };
}

export function referencedProjectAssetPaths(documents: readonly SafeSourceDocument[], approvedPaths: readonly string[]) {
  const approvedByPath = new Map(approvedPaths.map((path) => [normalizePath(path).toLowerCase(), normalizePath(path)]));
  const approvedByName = new Map<string, string[]>();
  for (const path of approvedPaths) {
    const normalized = normalizePath(path);
    const name = fileName(normalized).toLowerCase();
    approvedByName.set(name, [...(approvedByName.get(name) ?? []), normalized]);
  }

  const selected = new Set<string>();
  for (const document of documents) {
    const references = collectLocalReferences(document);
    for (const reference of references) {
      const resolved = resolveProjectAssetPath(document.path, reference);
      if (!resolved) continue;
      const exact = approvedByPath.get(resolved.toLowerCase());
      if (exact) {
        selected.add(exact);
        continue;
      }
      const matchingNames = approvedByName.get(fileName(resolved).toLowerCase());
      if (matchingNames?.length === 1) selected.add(matchingNames[0]);
    }
  }
  return [...selected];
}

export function resolveProjectAssetPath(basePath: string, value: string) {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!trimmed || /^(?:data:|https?:|blob:|mailto:|tel:|javascript:|#)/i.test(trimmed)) return null;
  try {
    const resolved = new URL(trimmed, `https://imported.local/${normalizePath(basePath)}`).pathname.replace(/^\/+/, "");
    return normalizePath(decodeURIComponent(resolved));
  } catch {
    return null;
  }
}

function collectLocalReferences(document: SafeSourceDocument) {
  const references = new Set<string>();
  const attributePattern = /\b(?:src|poster|href)\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi;
  for (const match of document.content.matchAll(attributePattern)) {
    const value = match[2] ?? match[3];
    if (value) references.add(value);
  }
  const srcsetPattern = /\bsrcset\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi;
  for (const match of document.content.matchAll(srcsetPattern)) {
    const value = match[2] ?? match[3] ?? "";
    for (const candidate of value.split(",")) {
      const reference = candidate.trim().split(/\s+/)[0];
      if (reference) references.add(reference);
    }
  }
  const cssPattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  for (const match of document.content.matchAll(cssPattern)) {
    if (match[2]) references.add(match[2].trim());
  }
  return references;
}

function detectProjectKind(name: string, corpus: string): ProjectKind {
  const identity = `${name} ${corpus.slice(0, 250_000)}`.toLowerCase();
  if (name.toLowerCase().includes("portfolio")) return "portfolio";
  if (score(identity, ["portfolio", "my projects", "my work", "experience", "resume", "about me", "hire me"]) >= 2) return "portfolio";
  if (score(identity, ["checkout", "shopping cart", "add to cart", "product catalog", "stripe", "shopify", "ecommerce"]) >= 2) return "commerce";
  if (score(identity, ["blog", "article", "post", "author", "published at", "markdown"]) >= 2) return "blog";
  if (score(identity, ["dashboard", "analytics", "metric", "chart", "admin panel", "kpi"]) >= 2) return "dashboard";
  if (score(identity, ["openapi", "swagger", "rest api", "graphql", "api server"]) >= 2) return "api";
  return "application";
}

function detectFramework(paths: readonly string[], documents: readonly SafeSourceDocument[]) {
  const pathText = paths.join(" ").toLowerCase();
  const packageDocument = documents.find((document) => document.path.endsWith("package.json"));
  const packageText = packageDocument?.content.toLowerCase() ?? "";
  if (packageText.includes('"next"') || /(^|\/)app\/.*page\.(tsx?|jsx?)$/m.test(pathText)) return "Next.js";
  if (packageText.includes('"@remix-run/') || pathText.includes("app/routes/")) return "Remix";
  if (packageText.includes('"astro"') || paths.some((path) => path.endsWith(".astro"))) return "Astro";
  if (packageText.includes('"vue"') || paths.some((path) => path.endsWith(".vue"))) return "Vue";
  if (packageText.includes('"react"') || paths.some((path) => /\.(jsx|tsx)$/.test(path))) return packageText.includes('"vite"') ? "React + Vite" : "React";
  if (paths.some((path) => path.endsWith(".html"))) return "Static web application";
  if (paths.some((path) => path.endsWith(".py"))) return "Python application";
  return "Web application";
}

function detectTechnologies(paths: readonly string[], corpus: string, framework: string) {
  const technologies = new Set<string>([framework]);
  if (paths.some((path) => /\.tsx?$/.test(path))) technologies.add("TypeScript");
  else if (paths.some((path) => /\.jsx?$/.test(path))) technologies.add("JavaScript");
  if (paths.some((path) => /\.(css|scss)$/.test(path))) technologies.add("CSS");
  if (corpus.includes("tailwind")) technologies.add("Tailwind CSS");
  if (corpus.includes("prisma")) technologies.add("Prisma");
  if (corpus.includes("supabase")) technologies.add("Supabase");
  if (corpus.includes("firebase")) technologies.add("Firebase");
  if (corpus.includes("stripe")) technologies.add("Stripe");
  return [...technologies].slice(0, 6);
}

function detectPages(documents: readonly SafeSourceDocument[], kind: ProjectKind): ProjectPage[] {
  const pages = new Map<string, ProjectPage>();

  for (const document of documents) {
    const route = routeFromPath(document.path);
    if (!route) continue;
    addPage(pages, createPage(document, route, kind));
  }

  for (const document of documents) {
    for (const route of extractRouterPaths(document.content)) {
      if (pages.has(route)) continue;
      addPage(pages, createPage(document, route, kind));
    }
  }

  if (pages.size <= 1) {
    const homeDocument = documents.find((document) => routeFromPath(document.path) === "/")
      ?? documents.find((document) => /(^|\/)(app|index|home)\.(tsx?|jsx?|html)$/i.test(document.path));
    if (homeDocument) {
      if (!pages.has("/")) addPage(pages, createPage(homeDocument, "/", kind));
      for (const section of extractSections(homeDocument.content)) {
        const route = `/#${section.id}`;
        if (!pages.has(route)) addPage(pages, createPage(homeDocument, route, kind, section.label));
      }
    }
  }

  if (!pages.size) {
    const document = documents[0] ?? { path: "Source unavailable", content: "" };
    addPage(pages, createPage(document, "/", kind, "Home"));
  }

  const detected = [...pages.values()];
  const homeIndex = detected.findIndex((page) => page.route === "/");
  if (homeIndex > 0) detected.unshift(detected.splice(homeIndex, 1)[0]);
  return detected.slice(0, 12);
}

function addPage(pages: Map<string, ProjectPage>, page: ProjectPage) {
  if (!pages.has(page.route)) pages.set(page.route, page);
}

function createPage(document: SafeSourceDocument, route: string, kind: ProjectKind, explicitName?: string): ProjectPage {
  const headings = extractHeadings(document.content);
  const name = explicitName ?? nameFromRoute(route, headings[0]);
  const links = extractLinks(document.content);
  const navigation = links.map((link) => link.label);
  return {
    id: slug(`${name}-${route}`),
    name,
    route,
    purpose: purposeForPage(name, route, kind),
    sourcePath: document.path,
    summary: headings.length
      ? `This view leads with “${headings[0]}”${headings[1] ? ` and includes “${headings[1]}”.` : "."}`
      : `This ${kind === "application" ? "application" : kind} view is defined in ${fileName(document.path)}.`,
    headings: headings.slice(0, 5),
    navigation: navigation.slice(0, 5),
    links: route.startsWith("/#") ? [] : links.slice(0, 20),
    code: redactSourceSnippet(document.content),
  };
}

function routeFromPath(path: string) {
  const normalized = normalizePath(path);
  let match = normalized.match(new RegExp(`^(?:src/)?app/(.*?/)?page\\.${routeExtensions}$`, "i"));
  if (match) return normalizeRoute(match[1] ?? "");

  match = normalized.match(new RegExp(`^(?:src/)?pages/(?!api/)(.+)\\.${routeExtensions}$`, "i"));
  if (match && !/^_(app|document|error)$/.test(match[1])) return normalizeRoute(match[1].replace(/\/index$/i, ""));

  match = normalized.match(new RegExp(`^(?:src/)?routes?/(.+)\\.${routeExtensions}$`, "i"));
  if (match) return normalizeRoute(match[1].replace(/\/index$/i, ""));

  match = normalized.match(/^(?:(?:public|src)\/)?(.+)\.html$/i);
  if (match) return normalizeRoute(match[1].replace(/\/index$/i, "").replace(/^index$/i, ""));
  return null;
}

function extractRouterPaths(content: string) {
  const routes = new Set<string>();
  const patterns = [
    /\bpath\s*=\s*["']([^"']+)["']/g,
    /\bpath\s*:\s*["']([^"']+)["']/g,
    /<Route[^>]+path=["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (!match[1].includes("*") && !match[1].includes(":")) routes.add(normalizeRoute(match[1]));
    }
  }
  return [...routes].filter((route) => !route.startsWith("/api/"));
}

function extractSections(content: string) {
  const sections = new Map<string, string>();
  for (const match of content.matchAll(/<(?:section|main|div)[^>]+id=["']([a-zA-Z][\w-]{1,40})["'][^>]*>/g)) {
    const id = match[1].toLowerCase();
    if (["root", "app", "main", "content"].includes(id)) continue;
    sections.set(id, titleCase(id));
  }
  for (const match of content.matchAll(/href=["']#([a-zA-Z][\w-]{1,40})["']/g)) {
    const id = match[1].toLowerCase();
    sections.set(id, titleCase(id));
  }
  return [...sections].slice(0, 8).map(([id, label]) => ({ id, label }));
}

function extractHeadings(content: string) {
  const headings: string[] = [];
  for (const match of content.matchAll(/<(?:title|h1|h2|h3)[^>]*>([\s\S]*?)<\/(?:title|h1|h2|h3)>/gi)) {
    const text = cleanVisibleText(match[1]);
    if (text && !headings.includes(text)) headings.push(text);
  }
  return headings;
}

function extractLinks(content: string) {
  const links: ProjectPageLink[] = [];
  for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = cleanVisibleText(match[2]);
    const destination = match[1].trim();
    if (label && label.length <= 60 && destination && !links.some((link) => link.label === label && link.destination === destination)) {
      links.push({ label, destination });
    }
  }
  return links;
}

function buildWorkflow(pages: readonly ProjectPage[], documents: readonly SafeSourceDocument[]) {
  const candidates = pages.length > 1
    ? pages.slice(0, 4)
    : [pages[0], ...documents.slice(1, 4).map((document) => createPage(document, `/source/${slug(fileName(document.path))}`, "application", titleCase(fileName(document.path).split(".")[0])))];
  return candidates.filter(Boolean).map((page, index) => ({
    icon: String(index + 1),
    plainTitle: index === 0 ? `A visitor opens ${page.name}` : `They continue to ${page.name}`,
    plainDetail: page.purpose,
    technicalTitle: fileName(page.sourcePath),
    technicalDetail: page.route,
    fileName: fileName(page.sourcePath),
    filePath: page.sourcePath,
    explanation: `${page.name} is connected to the ${page.route} route. The indexed source describes it as: ${page.summary}`,
    highlightLines: [1, 2, 3, 4],
    code: page.code,
  }));
}

function attachSandboxedPreviews(pages: readonly ProjectPage[], documents: readonly SafeSourceDocument[], assets: readonly SafePreviewAsset[]) {
  const assetMap = new Map(assets.map((asset) => [normalizePath(asset.path).toLowerCase(), asset.dataUrl]));
  const styles = documents
    .filter((document) => /\.(css|scss)$/i.test(document.path))
    .map((document) => inlineCssAssets(document.content, document.path, assetMap))
    .join("\n")
    .slice(0, 300_000);
  const previewByPath = new Map<string, string>();

  return pages.map((page) => {
    if (!/\.html?$/i.test(page.sourcePath)) return page;
    let previewHtml = previewByPath.get(page.sourcePath);
    if (!previewHtml) {
      const document = documents.find((candidate) => candidate.path === page.sourcePath);
      if (!document) return page;
      previewHtml = createSandboxedStaticHtml(document.content, styles, document.path, assetMap);
      previewByPath.set(page.sourcePath, previewHtml);
    }
    return { ...page, previewHtml };
  });
}

function createSandboxedStaticHtml(html: string, styles: string, htmlPath: string, assetMap: ReadonlyMap<string, string>) {
  const safeStyles = styles
    .replace(/@import\s+[^;]+;/gi, "")
    .replace(/<\/style/gi, "<\\/style");
  let safeHtml = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(?:iframe|object|embed|base)\b[\s\S]*?<\/(?:iframe|object|embed)>/gi, "")
    .replace(/<(?:iframe|object|embed|base)\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:["'][\s\S]*?["']|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*["']\s*javascript:[\s\S]*?["']/gi, "")
    .replace(/\saction\s*=\s*(?:["'][\s\S]*?["']|[^\s>]+)/gi, "");
  safeHtml = safeHtml.replace(/\s(src|poster)\s*=\s*(["'])([^"']+)\2/gi, (match, attribute: string, quote: string, value: string) => {
    const asset = resolvePreviewAsset(htmlPath, value, assetMap);
    return asset ? ` ${attribute}=${quote}${asset}${quote}` : match;
  });
  safeHtml = safeHtml.replace(/\ssrcset\s*=\s*(["'])([^"']+)\1/gi, (match, quote: string, value: string) => {
    const candidates = value.split(",").map((candidate) => {
      const [reference, ...descriptor] = candidate.trim().split(/\s+/);
      const asset = resolvePreviewAsset(htmlPath, reference, assetMap);
      return asset ? `${asset}${descriptor.length ? ` ${descriptor.join(" ")}` : ""}` : candidate.trim();
    });
    return candidates.some((candidate) => candidate.startsWith("data:")) ? ` srcset=${quote}${candidates.join(", ")}${quote}` : match;
  });
  const headContent = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'; navigate-to 'none'"><style>html,body{margin:0;min-height:100%;overflow:auto}${safeStyles}</style>`;
  if (/<head\b[^>]*>/i.test(safeHtml)) safeHtml = safeHtml.replace(/<head\b[^>]*>/i, (head) => `${head}${headContent}`);
  else if (/<html\b[^>]*>/i.test(safeHtml)) safeHtml = safeHtml.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${headContent}</head>`);
  else safeHtml = `<!doctype html><html><head>${headContent}</head><body>${safeHtml}</body></html>`;
  return safeHtml;
}

function inlineCssAssets(css: string, cssPath: string, assetMap: ReadonlyMap<string, string>) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, _quote: string, value: string) => {
    const asset = resolvePreviewAsset(cssPath, value.trim(), assetMap);
    return asset ? `url("${asset}")` : match;
  });
}

function resolvePreviewAsset(basePath: string, value: string, assetMap: ReadonlyMap<string, string>) {
  const resolved = resolveProjectAssetPath(basePath, value);
  if (!resolved) return null;
  const exact = assetMap.get(resolved.toLowerCase());
  if (exact) return exact;
  const targetName = fileName(resolved).toLowerCase();
  const matches = [...assetMap.entries()].filter(([path]) => fileName(path).toLowerCase() === targetName);
  return matches.length === 1 ? matches[0][1] : null;
}

function buildApplicationOverview(
  name: string,
  kind: ProjectKind,
  pages: readonly ProjectPage[],
  framework: string,
  technologies: readonly string[],
): ApplicationOverview {
  const home = pages.find((page) => page.route === "/") ?? pages[0];
  const primaryHeading = home.headings[0] ?? name;
  const audienceByKind: Record<ProjectKind, string> = {
    portfolio: "recruiters, collaborators, clients, and visitors evaluating the owner’s work",
    commerce: "shoppers comparing products and deciding whether to purchase",
    blog: "readers discovering articles and following topics or authors",
    dashboard: "operators who need to understand status and take informed action",
    api: "developers and connected systems consuming the application’s routes",
    application: "people using the application to complete its main task",
  };
  const purposeByKind: Record<ProjectKind, string> = {
    portfolio: `${name} presents the owner’s background, experience, work, and contact paths in one portfolio experience.`,
    commerce: `${name} helps shoppers discover products, evaluate them, and move toward a purchase.`,
    blog: `${name} helps readers discover, understand, and navigate published content.`,
    dashboard: `${name} organizes important status, metrics, and actions into a working dashboard.`,
    api: `${name} exposes application behavior through routes intended for other software and developers.`,
    application: `${name} connects ${pages.length} detected interface views into a single user experience.`,
  };
  const pageFeatures = pages.slice(0, 6).map((page) => ({ title: page.name, description: page.purpose }));
  const features = [
    ...pageFeatures,
    { title: "Navigation", description: home.links.length ? `Visitors can follow ${home.links.slice(0, 5).map((link) => link.label).join(", ")}.` : `The application connects ${pages.length} detected views.` },
    { title: "Technology", description: `${framework} with ${technologies.join(", ")}.` },
  ].slice(0, 9);
  const storyPages = orderStoryPages(pages).slice(0, 4);
  const actor = kind === "portfolio" ? "A recruiter" : kind === "commerce" ? "A shopper" : kind === "blog" ? "A reader" : "A visitor";
  const owner = kind === "portfolio" && primaryHeading.length <= 70 ? primaryHeading : name;
  const storyTitle = kind === "portfolio"
    ? `${actor} explores ${owner}’s work and decides whether to connect`
    : `${actor} uses ${name} from the first view to the main outcome`;
  return {
    purpose: purposeByKind[kind],
    audience: audienceByKind[kind],
    features,
    storyTitle,
    storyIntroduction: `${actor} arrives at ${home.name}, sees “${primaryHeading},” and uses the application’s own navigation to decide where to go next.`,
    storySteps: storyPages.map((page, index) => ({
      label: index === 0 ? "Arrive" : page.name,
      description: index === 0 ? page.summary : `Open ${page.name} to ${lowercaseFirst(page.purpose)}.`,
    })),
  };
}

function orderStoryPages(pages: readonly ProjectPage[]) {
  const priorities = ["home", "experience", "work", "project", "education", "service", "contact", "resume"];
  return [...pages].sort((left, right) => {
    const leftText = `${left.name} ${left.route}`.toLowerCase();
    const rightText = `${right.name} ${right.route}`.toLowerCase();
    const leftPriority = priorities.findIndex((term) => leftText.includes(term));
    const rightPriority = priorities.findIndex((term) => rightText.includes(term));
    return (leftPriority < 0 ? priorities.length : leftPriority) - (rightPriority < 0 ? priorities.length : rightPriority);
  });
}

function buildSourceNavigationGraph(name: string, pages: readonly ProjectPage[]): NavigationGraph {
  const nodes = pages.map((page) => ({ id: page.id, label: page.name, route: page.route, purpose: page.purpose, sourcePath: page.sourcePath }));
  const byRoute = new Map(pages.map((page) => [normalizeComparableRoute(page.route), page]));
  const edges: NavigationGraphEdge[] = [];
  for (const page of pages) {
    for (const link of page.links) {
      const destination = byRoute.get(normalizeComparableRoute(link.destination));
      if (!destination || destination.id === page.id) continue;
      const edge = { from: page.id, to: destination.id, label: link.label || "Navigate" };
      if (!edges.some((candidate) => candidate.from === edge.from && candidate.to === edge.to)) edges.push(edge);
    }
  }
  const home = pages.find((page) => page.route === "/") ?? pages[0];
  if (!edges.length && home) {
    for (const page of pages) if (page.id !== home.id) edges.push({ from: home.id, to: page.id, label: page.name });
  }
  return {
    title: `Navigation map for ${name}`,
    summary: `This graph shows which detected pages or sections visitors can open directly from one another. It is a map, not a required step-by-step story.`,
    layout: edges.filter((edge) => edge.from === home?.id).length > 2 ? "hub" : "network",
    nodes,
    edges: edges.slice(0, 30),
    rationale: "Built from detected routes and link destinations in approved source files.",
    generatedBy: "source",
  };
}

function normalizeComparableRoute(value: string) {
  if (/^https?:/i.test(value) || value.startsWith("mailto:") || value.startsWith("tel:")) return "__external__";
  if (value.startsWith("#")) return `/${value}`.toLowerCase();
  return normalizeRoute(value.split("?")[0]).toLowerCase();
}

function buildEntityModel(kind: ProjectKind) {
  if (kind === "portfolio") {
    return {
      entities: [
        { name: "Page", attributes: ["page_id · PK", "route", "title"] },
        { name: "Project", attributes: ["project_id · PK", "title", "summary", "link"] },
        { name: "Skill", attributes: ["skill_id · PK", "name", "category"] },
        { name: "Contact Link", attributes: ["contact_id · PK", "label", "destination"] },
      ],
      relationships: [
        { from: "Page", fromCount: "1" as const, name: "showcases", toCount: "M" as const, to: "Project" },
        { from: "Project", fromCount: "M" as const, name: "uses", toCount: "M" as const, to: "Skill" },
        { from: "Page", fromCount: "1" as const, name: "offers", toCount: "M" as const, to: "Contact Link" },
      ],
    };
  }
  if (kind === "blog") {
    return {
      entities: [
        { name: "Page", attributes: ["page_id · PK", "route", "title"] },
        { name: "Article", attributes: ["article_id · PK", "title", "published_at"] },
        { name: "Author", attributes: ["author_id · PK", "name"] },
        { name: "Category", attributes: ["category_id · PK", "name"] },
      ],
      relationships: [
        { from: "Author", fromCount: "1" as const, name: "writes", toCount: "M" as const, to: "Article" },
        { from: "Article", fromCount: "M" as const, name: "belongs to", toCount: "M" as const, to: "Category" },
      ],
    };
  }
  const pageAttributes = ["page_id · PK", "route", "title"];
  return {
    entities: [
      { name: "Application", attributes: ["application_id · PK", "name", "framework"] },
      { name: "Page", attributes: pageAttributes },
      { name: "Source Module", attributes: ["module_id · PK", "path", "language"] },
      { name: "User Action", attributes: ["action_id · PK", "label", "destination"] },
    ],
    relationships: [
      { from: "Application", fromCount: "1" as const, name: "contains", toCount: "M" as const, to: "Page" },
      { from: "Page", fromCount: "M" as const, name: "uses", toCount: "M" as const, to: "Source Module" },
      { from: "Page", fromCount: "1" as const, name: "offers", toCount: "M" as const, to: "User Action" },
    ],
  };
}

function scanSourceFindings(documents: readonly SafeSourceDocument[], sourcePaths: readonly string[]): ProjectSourceFinding[] {
  const findings: ProjectSourceFinding[] = [];
  for (const document of documents) {
    const file = fileName(document.path);
    if (secretAssignmentPattern.test(document.content)) {
      findings.push(sourceFinding({
        id: `hardcoded-secret-${slug(document.path)}`,
        severity: "critical",
        category: "Secrets and environment",
        title: "A credential-like value appears hard-coded in source",
        summary: "A secret-shaped assignment was found in an approved source file. Its value is redacted and was not retained in the project manifest.",
        evidence: `A credential-like assignment was detected in ${document.path}; the value is withheld.`,
        recommendation: "Move the value to a protected server-side environment variable, remove it from source history, and rotate it if it was ever active.",
        affected: ["Source control", "Deployment credentials", file],
        filePath: document.path,
        code: "[VALUE REDACTED]\nA credential-like assignment was detected in this approved source file.",
      }));
    }
    if (/dangerouslySetInnerHTML\s*=|\binnerHTML\s*=|\beval\s*\(/.test(document.content)) {
      findings.push(sourceFinding({
        id: `unsafe-render-${slug(document.path)}`,
        severity: "high",
        category: "Injection safety",
        title: "Dynamic content reaches an unsafe rendering API",
        summary: "Unsafe HTML or code execution can turn untrusted content into script execution unless it is strictly sanitized.",
        evidence: `An unsafe rendering or execution API appears in ${document.path}.`,
        recommendation: "Render structured content normally. If raw HTML is unavoidable, sanitize it with a maintained allow-list and add hostile-input tests.",
        affected: ["Browser", "User content", file],
        filePath: document.path,
        code: matchingRedactedLines(document.content, /dangerouslySetInnerHTML|innerHTML\s*=|eval\s*\(/),
      }));
    }
    if (/target\s*=\s*["']_blank["']/i.test(document.content) && !/rel\s*=\s*["'][^"']*(noopener|noreferrer)/i.test(document.content)) {
      findings.push(sourceFinding({
        id: `external-link-${slug(document.path)}`,
        severity: "medium",
        category: "Browser isolation",
        title: "A new-tab link is missing an opener protection",
        summary: "A page opened in a new tab may receive access to its opener when rel=\"noopener noreferrer\" is absent.",
        evidence: `A target=\"_blank\" link without a matching opener protection was detected in ${document.path}.`,
        recommendation: "Add rel=\"noopener noreferrer\" to external new-tab links and cover shared link components with a small test.",
        affected: ["Browser navigation", "External links", file],
        filePath: document.path,
        code: matchingRedactedLines(document.content, /target\s*=\s*["']_blank["']/i),
      }));
    }
    if (/<form\b/i.test(document.content) && /<(input|textarea)\b/i.test(document.content) && !/maxLength|maxlength|z\.string\(\).*\.max\(|\.max\(\d+\)/.test(document.content)) {
      findings.push(sourceFinding({
        id: `input-limit-${slug(document.path)}`,
        severity: "high",
        category: "Input validation",
        title: "A form has no visible input-length boundary",
        summary: "Unbounded text can cause oversized requests, storage errors, log amplification, or avoidable resource use.",
        evidence: `A form with text input was found in ${document.path}, but this lightweight scan did not find a maximum-length guard in the same module.`,
        recommendation: "Enforce appropriate limits in the browser and again on the server, cap request bodies, and return a clear validation response.",
        affected: ["Forms", "Request handling", file],
        filePath: document.path,
        code: matchingRedactedLines(document.content, /<(form|input|textarea)\b/i),
      }));
    }
    if (/\/(api|routes?)\//i.test(document.path) && /\b(POST|PUT|PATCH|DELETE)\b/.test(document.content) && !/(rate.?limit|throttl|quota|Retry-After)/i.test(document.content)) {
      findings.push(sourceFinding({
        id: `rate-limit-${slug(document.path)}`,
        severity: "high",
        category: "Abuse prevention",
        title: "A state-changing endpoint has no visible rate-limit guard",
        summary: "Repeated requests may consume workers or trigger expensive downstream work without a clear caller budget.",
        evidence: `${document.path} exposes a state-changing handler, while no limiter, quota, or Retry-After behavior is visible in that module.`,
        recommendation: "Apply identity-aware and IP-aware limits at the edge or server boundary, cap concurrency, and monitor cost-heavy downstream operations.",
        affected: ["API", "Availability", file],
        filePath: document.path,
        code: matchingRedactedLines(document.content, /\b(POST|PUT|PATCH|DELETE)\b/),
      }));
    }
  }

  if (!findings.length) {
    findings.push({
      id: "lightweight-source-review",
      status: "passed",
      severity: "verified",
      category: "Source boundary",
      title: "No high-confidence issue was found in the approved source sample",
      summary: "The lightweight local scan found no source-backed critical, high, or medium pattern in the files it safely read.",
      check: "Applied a deterministic scan for hard-coded credential assignments, unsafe HTML execution, unsafe new-tab links, unbounded forms, and unguarded state-changing routes.",
      evidence: `${documents.length} approved file${documents.length === 1 ? " was" : "s were"} analyzed from ${sourcePaths.length} indexed source path${sourcePaths.length === 1 ? "" : "s"}. This is not a substitute for a build, dependency audit, or authenticated penetration test.`,
      scenario: "A deeper runtime or dependency problem may still exist even when this bounded pattern scan passes.",
      impact: "This result provides a clean lightweight baseline without claiming that the whole application is vulnerability-free.",
      recommendation: "Keep this privacy boundary and add project builds, dependency scanning, authenticated route tests, and deployment-specific checks before production changes.",
      affected: ["Approved source files", "Import privacy boundary"],
      fileName: "Project manifest",
      filePath: "Approved source analysis",
      code: "[LIGHTWEIGHT SCAN COMPLETE]\nNo high-confidence source pattern was detected.",
    });
  }
  return findings.slice(0, 20);
}

function sourceFinding(input: {
  id: string;
  severity: "critical" | "high" | "medium";
  category: string;
  title: string;
  summary: string;
  evidence: string;
  recommendation: string;
  affected: readonly string[];
  filePath: string;
  code: string;
}): ProjectSourceFinding {
  return {
    ...input,
    status: "risk",
    check: "Scanned only approved, non-ignored source text for a high-confidence code pattern. Secret and environment paths were excluded before any content read.",
    scenario: "An attacker or malformed input reaches the affected path under real deployment conditions.",
    impact: "The affected application boundary could expose data, execute unsafe behavior, or lose availability depending on how this path is deployed.",
    fileName: fileName(input.filePath),
  };
}

function describeProject(name: string, kind: ProjectKind, pages: readonly ProjectPage[], framework: string) {
  const kindDescriptions: Record<ProjectKind, string> = {
    portfolio: "a portfolio experience that presents work, experience, skills, and ways to make contact",
    commerce: "a commerce experience that helps visitors discover products and complete a purchase",
    blog: "a publishing experience that organizes articles and helps readers explore content",
    dashboard: "a dashboard that brings operational information and actions into one interface",
    api: "an API-oriented application whose routes expose program behavior to other systems",
    application: "an application whose indexed routes and source modules define the user experience",
  };
  return `${name} is ${kindDescriptions[kind]}. VCAIST detected ${pages.length} interface ${pages.length === 1 ? "view" : "views"} from approved ${framework} source files.`;
}

function purposeForPage(name: string, route: string, kind: ProjectKind) {
  const identity = `${name} ${route}`.toLowerCase();
  if (identity.includes("project") || identity.includes("work")) return "Showcase selected work and outcomes";
  if (identity.includes("about") || identity.includes("experience")) return "Explain the person, team, or experience behind the application";
  if (identity.includes("contact")) return "Help visitors start a conversation";
  if (identity.includes("skill") || identity.includes("service")) return "Summarize capabilities and areas of expertise";
  if (identity.includes("blog") || identity.includes("article")) return "Help readers discover and read published content";
  if (identity.includes("login") || identity.includes("sign-in")) return "Authenticate returning users";
  if (identity.includes("dashboard")) return "Summarize the most important application state";
  if (kind === "portfolio") return "Introduce the portfolio and guide visitors toward the most important work";
  return "Introduce this part of the application and its primary action";
}

function nameFromRoute(route: string, heading?: string) {
  if (route === "/") return heading && heading.length <= 38 ? heading : "Home";
  const segment = route.replace(/^\/#?/, "").split("/").filter(Boolean).at(-1) ?? "Page";
  return titleCase(segment.replace(/[\[\]()$]/g, "").replace(/[-_]+/g, " "));
}

function normalizeRoute(value: string) {
  const cleaned = value.replace(/\\/g, "/").replace(/\/page$/i, "").replace(/\/?index$/i, "").replace(/\/+$/g, "");
  if (!cleaned || cleaned === "/") return "/";
  return `/${cleaned.replace(/^\/+/, "")}`;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

function cleanVisibleText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function redactSourceSnippet(content: string) {
  return content
    .split("\n")
    .slice(0, 30)
    .map((line) => secretAssignmentPattern.test(line) ? line.replace(/([:=]\s*)["'`][^"'`]+["'`]/, "$1\"[REDACTED]\"") : line)
    .join("\n")
    .slice(0, 5_000);
}

function matchingRedactedLines(content: string, pattern: RegExp) {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  return redactSourceSnippet(lines.slice(Math.max(0, index - 2), index + 3).join("\n"));
}

function fileName(path: string) {
  return path.split("/").at(-1) ?? path;
}

function score(value: string, terms: readonly string[]) {
  return terms.reduce((total, term) => total + (value.includes(term) ? 1 : 0), 0);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
}

function titleCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lowercaseFirst(value: string) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}
