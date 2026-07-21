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
  actions?: readonly string[];
  descriptions?: readonly string[];
  code: string;
  previewHtml?: string;
  previewKind?: "static" | "reconstructed";
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

export type EntityModelEvidence = {
  basis: "database-schema" | "source-types" | "structural-fallback";
  evidenceFiles: readonly string[];
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
  entityModel: EntityModelEvidence;
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
  const framework = detectFramework(sourcePaths, normalizedDocuments);
  const kind = detectProjectKind(name, corpus, sourcePaths, normalizedDocuments);
  const technologies = detectTechnologies(sourcePaths, corpus, framework);
  const pages = attachSandboxedPreviews(detectPages(normalizedDocuments, kind, sourcePaths), normalizedDocuments, assets, name, framework);
  const workflow = buildWorkflow(pages);
  const { entities, relationships, evidence: entityModel } = buildEntityModel(kind, normalizedDocuments);
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
    entityModel,
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
  const attributePattern = /\b(?:src|poster|href|data-src|data-lazy-src|data-original)\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi;
  for (const match of document.content.matchAll(attributePattern)) {
    const value = match[2] ?? match[3];
    if (value) references.add(value);
  }
  const srcsetPattern = /\b(?:srcset|data-srcset|data-lazy-srcset)\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/gi;
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
  const moduleAssetPattern = /(?:\bfrom\s*|\brequire\s*\(\s*|\bnew\s+URL\s*\(\s*)["']([^"']+\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp))(?:\?[^"']*)?["']/gi;
  for (const match of document.content.matchAll(moduleAssetPattern)) {
    if (match[1]) references.add(match[1].trim());
  }
  return references;
}

function detectProjectKind(
  name: string,
  corpus: string,
  sourcePaths: readonly string[],
  documents: readonly SafeSourceDocument[],
): ProjectKind {
  const normalizedName = name.toLowerCase();
  const routePaths = sourcePaths.filter((path) => routeFromPath(path)).join(" ").toLowerCase();
  const routeDocuments = documents
    .filter((document) => routeFromPath(document.path))
    .map((document) => `${extractHeadings(document.content).join(" ")} ${extractMetadataValues(document.content).join(" ")}`)
    .join(" ")
    .toLowerCase();
  const surfaceIdentity = `${normalizedName} ${routePaths} ${routeDocuments}`;
  if (normalizedName.includes("portfolio")) return "portfolio";
  if (score(surfaceIdentity, ["/workspace", "/dashboard", "/settings", "control room", "analytics", "admin"]) >= 2) return "dashboard";
  if (score(surfaceIdentity, ["/checkout", "/cart", "/shop", "/products", "add to cart", "product catalog"]) >= 2) return "commerce";
  if (score(surfaceIdentity, ["/blog", "/articles", "/posts", "published", "author"]) >= 2) return "blog";
  if (score(surfaceIdentity, ["/projects", "/experience", "/education", "/contact", "resume", "selected work"]) >= 3) return "portfolio";
  const identity = `${normalizedName} ${corpus.slice(0, 250_000)}`;
  if (score(identity, ["openapi", "swagger", "rest api", "graphql", "api server"]) >= 2) return "api";
  if (score(identity, ["checkout", "shopping cart", "add to cart", "product catalog", "stripe", "shopify", "ecommerce"]) >= 4) return "commerce";
  if (score(identity, ["dashboard", "analytics", "metric", "chart", "admin panel", "kpi"]) >= 4) return "dashboard";
  if (score(identity, ["portfolio", "my projects", "my work", "experience", "resume", "about me", "hire me"]) >= 5) return "portfolio";
  if (score(identity, ["blog", "article", "post", "author", "published at", "markdown"]) >= 5) return "blog";
  return "application";
}

function detectFramework(paths: readonly string[], documents: readonly SafeSourceDocument[]) {
  const pathText = paths.join(" ").toLowerCase();
  const packageDocument = documents.find((document) => document.path.endsWith("package.json"));
  const packageText = packageDocument?.content.toLowerCase() ?? "";
  if (packageText.includes('"next"') || /(^|\/)app\/.*page\.(tsx?|jsx?)$/m.test(pathText)) return "Next.js";
  if (packageText.includes('"@remix-run/') || pathText.includes("app/routes/")) return "Remix";
  if (packageText.includes('"@sveltejs/kit"') || paths.some((path) => /(^|\/)routes\/.*\+page\.svelte$/i.test(path))) return "SvelteKit";
  if (packageText.includes('"nuxt"')) return "Nuxt";
  if (packageText.includes('"@angular/core"')) return "Angular";
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

function detectPages(
  documents: readonly SafeSourceDocument[],
  kind: ProjectKind,
  sourcePaths: readonly string[] = documents.map((document) => document.path),
): ProjectPage[] {
  const pages = new Map<string, ProjectPage>();

  for (const document of documents) {
    const route = routeFromPath(document.path);
    if (!route) continue;
    const relatedDocuments = collectPageSourceDocuments(document, documents);
    const stateViews = relatedDocuments
      .map((candidate) => extractStateDrivenViews(candidate))
      .filter((views) => views.length >= 2)
      .sort((left, right) => right.length - left.length)[0] ?? [];
    if (stateViews.length >= 2) {
      for (const view of stateViews) {
        const viewRoute = view.isDefault ? route : routeWithViewFragment(route, view.id);
        addPage(pages, createPage(
          { path: view.sourcePath, content: view.content },
          viewRoute,
          kind,
          view.label,
        ));
      }
      continue;
    }
    addPage(pages, createPage(document, route, kind, undefined, relatedDocuments));
  }

  for (const document of documents) {
    if (!isRouterConfigurationDocument(document)) continue;
    for (const route of extractRouterPaths(document.content)) {
      if (pages.has(route)) continue;
      addPage(pages, createPage(document, route, kind, undefined, collectPageSourceDocuments(document, documents)));
    }
  }

  if (pages.size <= 1) {
    const homeDocument = documents.find((document) => routeFromPath(document.path) === "/")
      ?? documents.find((document) => /(^|\/)(app|index|home)\.(tsx?|jsx?|html)$/i.test(document.path));
    if (homeDocument) {
      const relatedDocuments = collectPageSourceDocuments(homeDocument, documents);
      if (!pages.has("/")) addPage(pages, createPage(homeDocument, "/", kind, undefined, relatedDocuments));
      for (const section of extractSections(homeDocument.content)) {
        const route = `/#${section.id}`;
        if (!pages.has(route)) addPage(pages, createPage(homeDocument, route, kind, section.label, relatedDocuments));
      }
    }
  }

  if (!pages.size) {
    const document = documents.find((candidate) => isInterfaceSourceDocument(candidate.path));
    if (document) addPage(pages, createPage(document, "/", kind, "Home", collectPageSourceDocuments(document, documents)));
  }

  // Route manifests can be larger than the bounded source-content budget. Keep
  // every framework route visible even when its file was not selected for deep
  // content analysis; those entries receive a clearly structural preview.
  for (const path of sourcePaths) {
    const route = routeFromPath(path);
    if (!route || pages.has(route)) continue;
    addPage(pages, createPage({ path: normalizePath(path), content: "" }, route, kind));
  }

  const detected = [...pages.values()];
  const homeIndex = detected.findIndex((page) => page.route === "/");
  if (homeIndex > 0) detected.unshift(detected.splice(homeIndex, 1)[0]);
  return detected;
}

type StateDrivenView = {
  id: string;
  label: string;
  sourcePath: string;
  content: string;
  isDefault: boolean;
};

function extractStateDrivenViews(document: SafeSourceDocument): StateDrivenView[] {
  if (!isInterfaceSourceDocument(document.path)) return [];
  const manifests = [...document.content.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:[\s\S]{0,800}?)?\s*=\s*\[([\s\S]{0,20000}?)\]\s*(?:as\s+const\s*)?;/g,
  )];

  for (const manifest of manifests) {
    const entries: Array<{ id: string; label: string; stateName: string; componentName?: string }> = [];
    for (const objectMatch of manifest[2].matchAll(/\{([\s\S]*?)\}/g)) {
      const object = objectMatch[1];
      const id = object.match(/\b(?:id|key|value)\s*:\s*["'`]([^"'`]{1,80})["'`]/)?.[1]?.trim();
      const label = object.match(/\b(?:label|title|name)\s*:\s*["'`]([^"'`]{1,120})["'`]/)?.[1]?.trim();
      if (!id || !label || /^(?:https?:|\/)/i.test(id)) continue;
      const escapedId = escapeRegExp(id);
      const comparison = document.content.match(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*={2,3}\\s*["'\\x60]${escapedId}["'\\x60]`))
        ?? document.content.match(new RegExp(`["'\\x60]${escapedId}["'\\x60]\\s*={2,3}\\s*([A-Za-z_$][\\w$]*)\\b`));
      if (!comparison?.[1]) continue;
      const stateName = comparison[1];
      const branch = document.content.match(new RegExp(
        `\\b${escapeRegExp(stateName)}\\s*={2,3}\\s*["'\\x60]${escapedId}["'\\x60][\\s\\S]{0,1800}?<([A-Z][A-Za-z0-9_$]*)\\b`,
      ));
      entries.push({ id, label, stateName, componentName: branch?.[1] });
    }

    const uniqueEntries = entries.filter((entry, index) =>
      entries.findIndex((candidate) => candidate.id === entry.id) === index,
    );
    if (uniqueEntries.length < 2) continue;

    const stateNameCounts = new Map<string, number>();
    for (const entry of uniqueEntries) stateNameCounts.set(entry.stateName, (stateNameCounts.get(entry.stateName) ?? 0) + 1);
    const stateName = [...stateNameCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    const stateEntries = uniqueEntries.filter((entry) => entry.stateName === stateName);
    if (!stateName || stateEntries.length < 2) continue;

    // A shared navigation component often compares an `active` prop with its
    // links. That is navigation metadata, not multiple renderable screens.
    // Only expand a manifest when the controlling value is local UI state.
    const localState = document.content.match(new RegExp(
      `\\[\\s*${escapeRegExp(stateName)}\\s*,[^\\]]+\\]\\s*=\\s*(?:React\\.)?use(?:State|Reducer)`,
    )) ?? document.content.match(new RegExp(
      `\\b(?:const|let)\\s+${escapeRegExp(stateName)}\\s*=\\s*(?:ref|signal)\\s*\\(`,
    ));
    if (!localState) continue;

    const defaultId = document.content.match(new RegExp(
      `\\[\\s*${escapeRegExp(stateName)}\\s*,[^\\]]+\\]\\s*=\\s*(?:React\\.)?useState(?:<[^;()]{0,300}>)?\\(\\s*["'\\x60](${stateEntries.map((entry) => escapeRegExp(entry.id)).join("|")})["'\\x60]`,
    ))?.[1] ?? stateEntries[0].id;

    return stateEntries.map((entry) => {
      const componentSource = entry.componentName
        ? collectNamedComponentSources(document.content, entry.componentName)
        : "";
      return {
        id: slug(entry.id) || entry.id.toLowerCase(),
        label: entry.label,
        sourcePath: document.path,
        // Never append a fixed-length source excerpt here: it can end inside a
        // JSX tag or text node and surface implementation fragments as labels.
        content: `<h1>${entry.label}</h1>\n${componentSource}`,
        isDefault: entry.id === defaultId,
      };
    });
  }

  return [];
}

function collectNamedComponentSources(content: string, rootName: string) {
  const collected: string[] = [];
  const queued = [rootName];
  const visited = new Set<string>();
  while (queued.length && visited.size < 10) {
    const name = queued.shift();
    if (!name || visited.has(name)) continue;
    visited.add(name);
    const source = extractNamedComponentSource(content, name);
    if (!source) continue;
    collected.push(source);
    for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)) {
      if (!visited.has(match[1])) queued.push(match[1]);
    }
  }
  return collected.join("\n");
}

function extractNamedComponentSource(content: string, name: string) {
  const escapedName = escapeRegExp(name);
  const definition = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapedName}\\b|(?:export\\s+)?const\\s+${escapedName}\\b`).exec(content);
  if (!definition) return "";
  const start = definition.index;
  const remainder = content.slice(start + definition[0].length);
  const nextDefinition = /\n(?:export\s+)?(?:(?:async\s+)?function|const)\s+[A-Z][A-Za-z0-9_$]*\b/.exec(remainder);
  const end = nextDefinition ? start + definition[0].length + nextDefinition.index : Math.min(content.length, start + 80_000);
  return content.slice(start, end);
}

function routeWithViewFragment(route: string, id: string) {
  const base = route.split("#")[0] || "/";
  return `${base}#${slug(id) || id.toLowerCase()}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addPage(pages: Map<string, ProjectPage>, page: ProjectPage) {
  if (!pages.has(page.route)) pages.set(page.route, page);
}

function createPage(
  document: SafeSourceDocument,
  route: string,
  kind: ProjectKind,
  explicitName?: string,
  relatedDocuments: readonly SafeSourceDocument[] = [],
): ProjectPage {
  const supportingDocuments = relatedDocuments.filter((candidate) => candidate.path !== document.path);
  const directHeadings = uniqueText([...extractMetadataValues(document.content, "title"), ...extractHeadings(document.content)], 8);
  const headings = uniqueText([
    ...directHeadings,
    ...supportingDocuments.flatMap((candidate) => extractHeadings(candidate.content)),
  ], 8);
  const name = explicitName ?? nameFromRoute(route, headings[0]);
  const links = uniqueLinks([document, ...supportingDocuments].flatMap((candidate) => extractLinks(candidate.content)));
  const navigation = uniqueText(links.map((link) => link.label), 8);
  const descriptions = uniqueText([
    ...extractMetadataValues(document.content, "description"),
    ...extractDescriptions(document.content),
    ...supportingDocuments.flatMap((candidate) => extractDescriptions(candidate.content)),
  ], 8);
  const actions = uniqueText([document, ...supportingDocuments].flatMap((candidate) => extractActions(candidate.content)), 8);
  const purpose = descriptions[0] ?? purposeForPage(name, route, kind);
  return {
    id: slug(`${name}-${route}`),
    name,
    route,
    purpose,
    sourcePath: document.path,
    summary: descriptions[0] ?? (headings.length
      ? `This view leads with “${headings[0]}”${headings[1] ? ` and includes “${headings[1]}”.` : "."}`
      : `This ${kind === "application" ? "application" : kind} view is defined in ${fileName(document.path)}.`),
    headings: headings.slice(0, 5),
    navigation: navigation.slice(0, 5),
    links: route.startsWith("/#") ? [] : links.slice(0, 20),
    actions,
    descriptions,
    code: redactSourceSnippet(document.content),
  };
}

function routeFromPath(path: string) {
  const normalized = normalizePath(path);
  let match = normalized.match(new RegExp(`^(?:src/)?app/(.*?/)?page\\.${routeExtensions}$`, "i"));
  if (match) return routeFromSegments(match[1] ?? "");

  match = normalized.match(new RegExp(`^(?:src/)?pages/(?!api/)(.+)\\.${routeExtensions}$`, "i"));
  if (match && !/^_(app|document|error)$/.test(match[1])) return routeFromSegments(match[1].replace(/\/index$/i, ""));

  match = normalized.match(/^(?:src\/)?routes\/(.*?)(?:\/)?\+page\.(?:js|ts|svelte)$/i);
  if (match) return routeFromSegments(match[1]);

  match = normalized.match(/^(?:src\/)?pages\/(.+)\.astro$/i);
  if (match) return routeFromSegments(match[1].replace(/\/index$/i, ""));

  match = normalized.match(/^(?:app\/)?routes\/(.+)\.(?:jsx?|tsx?)$/i);
  if (match) return remixRouteFromPath(match[1]);

  match = normalized.match(new RegExp(`^(?:src/)?routes?/(.+)\\.${routeExtensions}$`, "i"));
  if (match) return routeFromSegments(match[1].replace(/\/index$/i, ""));

  match = normalized.match(/^(?:(?:public|src)\/)?(.+)\.html$/i);
  if (match) return routeFromSegments(match[1].replace(/\/index$/i, "").replace(/^index$/i, ""));
  return null;
}

function routeFromSegments(value: string) {
  const segments = value
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment) && !segment.startsWith("@") && !segment.startsWith("_"))
    .flatMap((segment) => {
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return [];
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
      if (catchAll) return [`:${catchAll[1]}*`];
      const dynamic = segment.match(/^\[(.+)\]$/);
      return [dynamic ? `:${dynamic[1]}` : segment];
    });
  return normalizeRoute(segments.join("/"));
}

function remixRouteFromPath(value: string) {
  const normalized = value
    .replace(/\.?_index$/i, "")
    .replace(/\.(?:route)$/i, "")
    .replace(/\(([^)]+)\)\.?/g, "")
    .replace(/\$([a-zA-Z][\w-]*)/g, ":$1")
    .replace(/\./g, "/");
  return routeFromSegments(normalized);
}

function isInterfaceSourceDocument(path: string) {
  return /\.(?:astro|html|jsx|svelte|tsx|vue)$/i.test(path)
    && !/\.(?:spec|test|stories)\.[^.]+$/i.test(path)
    && !/(^|\/)(?:tests?|__tests__|fixtures?|mocks?)(\/|$)/i.test(path);
}

function isRouterConfigurationDocument(document: SafeSourceDocument) {
  if (/\.(?:spec|test|stories)\.[^.]+$/i.test(document.path) || /(^|\/)(?:tests?|__tests__|fixtures?)(\/|$)/i.test(document.path)) return false;
  const content = document.content;
  return /from\s*["'](?:react-router|react-router-dom|vue-router|@angular\/router)["']/.test(content)
    || /<Route(?:\s|>)/.test(content)
    || /\b(?:createBrowserRouter|createHashRouter|useRoutes|RouterModule\.(?:forRoot|forChild))\s*\(/.test(content);
}

function collectPageSourceDocuments(entry: SafeSourceDocument, documents: readonly SafeSourceDocument[]) {
  const byPath = new Map(documents.map((document) => [normalizePath(document.path).toLowerCase(), document]));
  const collected: SafeSourceDocument[] = [];
  const visited = new Set<string>();

  function visit(document: SafeSourceDocument, depth: number) {
    const key = normalizePath(document.path).toLowerCase();
    if (visited.has(key) || collected.length >= 16 || depth > 3) return;
    visited.add(key);
    collected.push(document);
    for (const specifier of extractSourceImports(document.content)) {
      const imported = resolveSourceImport(document.path, specifier, byPath);
      if (imported && isInterfaceSourceDocument(imported.path)) visit(imported, depth + 1);
    }
  }

  visit(entry, 0);
  return collected;
}

function extractSourceImports(content: string) {
  const imports = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) if (match[1]) imports.add(match[1]);
  }
  return [...imports];
}

function resolveSourceImport(
  sourcePath: string,
  specifier: string,
  documents: ReadonlyMap<string, SafeSourceDocument>,
) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("~/") && !specifier.startsWith("/")) return null;
  const sourceDirectory = normalizePath(sourcePath).split("/").slice(0, -1).join("/");
  const base = specifier.startsWith("@/") || specifier.startsWith("~/")
    ? normalizePath(specifier.slice(2))
    : specifier.startsWith("/")
      ? normalizePath(specifier)
      : normalizePath(new URL(specifier, `https://source.local/${sourceDirectory}/`).pathname);
  const candidates = [
    base,
    ...["ts", "tsx", "js", "jsx", "vue", "svelte", "astro"].map((extension) => `${base}.${extension}`),
    ...["ts", "tsx", "js", "jsx", "vue", "svelte", "astro"].map((extension) => `${base}/index.${extension}`),
  ];
  for (const candidate of candidates) {
    const document = documents.get(normalizePath(candidate).toLowerCase());
    if (document) return document;
  }
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
      const candidate = match[1].trim();
      if (!candidate || candidate === "*" || /^(?:https?:|\.\.?\/)/i.test(candidate) || /\.(?:js|ts|tsx|jsx|json)$/i.test(candidate)) continue;
      const route = normalizeRoute(candidate);
      if (!/^\/(?:api|source)(?:\/|$)/i.test(route) && !/^\/package(?:[./-]|$)/i.test(route)) routes.add(route);
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
  for (const element of extractJsxElements(content, ["title", "h1", "h2", "h3"])) {
    const text = cleanVisibleText(element.innerContent, 140);
    if (text && !headings.includes(text)) headings.push(text);
  }
  return headings;
}

function extractMetadataValues(content: string, key?: "title" | "description") {
  const values: string[] = [];
  const block = content.match(/\b(?:export\s+const\s+metadata|metadata)\s*(?::[^=]+)?=\s*\{([\s\S]{0,3000}?)\n?\s*\};?/i)?.[1] ?? "";
  const keys = key ? [key] : ["title", "description"];
  for (const metadataKey of keys) {
    const match = block.match(new RegExp(`\\b${metadataKey}\\s*:\\s*["'\\x60]([^"'\\x60]{2,300})["'\\x60]`, "i"));
    if (match?.[1]) values.push(match[1].trim());
  }
  return values;
}

function extractDescriptions(content: string) {
  const descriptions = [...extractMetadataValues(content, "description")];
  for (const element of extractJsxElements(content, ["p", "summary", "figcaption"])) {
    const text = cleanVisibleText(element.innerContent, 360);
    if (text.length >= 12) descriptions.push(text);
  }
  return descriptions;
}

function extractActions(content: string) {
  const actions: string[] = [];
  for (const element of extractJsxElements(content, ["button", "option"])) {
    const label = cleanVisibleText(element.innerContent, 80);
    if (label && label.length <= 60 && !looksLikeSourceCode(label)) actions.push(label);
  }
  for (const match of content.matchAll(/\b(?:placeholder|aria-label)\s*=\s*["']([^"']{2,80})["']/gi)) actions.push(match[1].trim());
  return actions;
}

function extractLinks(content: string) {
  const links: ProjectPageLink[] = [];
  for (const element of extractJsxElements(content, ["a", "Link"])) {
    const label = cleanVisibleText(element.innerContent, 100);
    const destination = element.attributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? "";
    if (label && label.length <= 60 && destination && !links.some((link) => link.label === label && link.destination === destination)) {
      links.push({ label, destination });
    }
  }
  for (const match of content.matchAll(/\b(?:router\.(?:push|replace)|navigate)\s*\(\s*["']([^"']+)["']/g)) {
    const destination = match[1].trim();
    const label = nameFromRoute(normalizeRoute(destination));
    if (destination && !links.some((link) => link.destination === destination)) links.push({ label, destination });
  }
  return links;
}

type ExtractedJsxElement = {
  tagName: string;
  attributes: string;
  innerContent: string;
};

function extractJsxElements(content: string, tagNames: readonly string[]): ExtractedJsxElement[] {
  const results: ExtractedJsxElement[] = [];
  const tags = tagNames.map(escapeRegExp).join("|");
  const openingPattern = new RegExp(`<(${tags})\\b`, "gi");
  for (const match of content.matchAll(openingPattern)) {
    const tagName = match[1];
    const openingStart = match.index;
    const openingEnd = findJsxOpeningTagEnd(content, openingStart + match[0].length);
    if (openingEnd < 0) continue;
    const closingPattern = new RegExp(`</${escapeRegExp(tagName)}\\s*>`, "gi");
    closingPattern.lastIndex = openingEnd + 1;
    const closing = closingPattern.exec(content);
    if (!closing) continue;
    results.push({
      tagName,
      attributes: content.slice(openingStart + match[0].length, openingEnd),
      innerContent: content.slice(openingEnd + 1, closing.index),
    });
  }
  return results;
}

function findJsxOpeningTagEnd(content: string, start: number) {
  let braceDepth = 0;
  let quote = "";
  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      continue;
    }
    if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }
    if (character === ">" && braceDepth === 0) return index;
  }
  return -1;
}

function stripJsxExpressions(value: string) {
  let output = "";
  let braceDepth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (braceDepth === 0) {
      if (character === "{") {
        braceDepth = 1;
        quote = "";
      } else {
        output += character;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth -= 1;
  }
  return output;
}

function looksLikeSourceCode(value: string) {
  return /=>|\b(?:className|on[A-Z][A-Za-z0-9_$]*|set[A-Z][A-Za-z0-9_$]*)\s*(?:=|\()|[{}];?/.test(value);
}

function uniqueText(values: readonly string[], maximum: number) {
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || output.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase())) continue;
    output.push(normalized);
    if (output.length >= maximum) break;
  }
  return output;
}

function uniqueLinks(links: readonly ProjectPageLink[]) {
  const output: ProjectPageLink[] = [];
  for (const link of links) {
    if (!output.some((candidate) => candidate.destination === link.destination && candidate.label === link.label)) output.push(link);
  }
  return output;
}

function buildWorkflow(pages: readonly ProjectPage[]) {
  const candidates = pages;
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

function attachSandboxedPreviews(
  pages: readonly ProjectPage[],
  documents: readonly SafeSourceDocument[],
  assets: readonly SafePreviewAsset[],
  projectName: string,
  framework: string,
) {
  const assetMap = new Map(assets.map((asset) => [normalizePath(asset.path).toLowerCase(), asset.dataUrl]));
  const documentMap = new Map(documents.map((document) => [normalizePath(document.path).toLowerCase(), document.content]));
  const styles = documents
    .filter((document) => /\.(css|scss)$/i.test(document.path))
    .map((document) => inlineCssAssets(document.content, document.path, assetMap))
    .join("\n")
    .slice(0, 300_000);
  const previewByPath = new Map<string, string>();

  return pages.map((page) => {
    const isStaticHtml = /\.html?$/i.test(page.sourcePath);
    const previewKey = `${page.sourcePath}:${page.route}:${isStaticHtml ? "static" : "reconstructed"}`;
    let previewHtml = previewByPath.get(previewKey);
    if (!previewHtml) {
      const document = documents.find((candidate) => candidate.path === page.sourcePath);
      if (!document) return page;
      previewHtml = isStaticHtml
        ? createSandboxedStaticHtml(document.content, styles, document.path, assetMap, documentMap)
        : createReconstructedPageHtml(page, pages, projectName, framework, styles, document, documents, assetMap, documentMap);
      previewByPath.set(previewKey, previewHtml);
    }
    return { ...page, previewHtml, previewKind: isStaticHtml ? "static" as const : "reconstructed" as const };
  });
}

function createReconstructedPageHtml(
  page: ProjectPage,
  pages: readonly ProjectPage[],
  projectName: string,
  framework: string,
  styles: string,
  entryDocument: SafeSourceDocument,
  documents: readonly SafeSourceDocument[],
  assetMap: ReadonlyMap<string, string>,
  documentMap: ReadonlyMap<string, string>,
) {
  const relatedDocuments = collectPageSourceDocuments(entryDocument, documents);
  const imageUrls = uniqueText(relatedDocuments.flatMap((document) =>
    [...collectLocalReferences(document)]
      .map((reference) => resolvePreviewAsset(document.path, reference, assetMap))
      .filter((value): value is string => Boolean(value?.startsWith("data:image/"))),
  ), 2);
  const navigation = pages.slice(0, 8).map((candidate) =>
    `<a href="${escapeHtml(candidate.route)}"${candidate.route === page.route ? ' aria-current="page"' : ""}>${escapeHtml(candidate.name)}</a>`,
  ).join("");
  const headings = page.headings.length ? page.headings : [page.name];
  const descriptions = page.descriptions?.length ? page.descriptions : [page.summary];
  const actions = page.actions?.length ? page.actions.slice(0, 4) : page.links.map((link) => link.label).slice(0, 4);
  const sections = headings.slice(1, 5).map((heading, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(descriptions[index + 1] ?? `Explore ${heading} in this application.`)}</p></article>`).join("");
  const actionButtons = actions.map((action) => `<button type="button" onclick="this.classList.toggle('selected');this.setAttribute('aria-pressed',this.classList.contains('selected'))">${escapeHtml(action)}</button>`).join("");
  const media = imageUrls.length ? `<aside class="vcaist-reconstructed-media">${imageUrls.map((url, index) => `<img src="${url}" alt="${escapeHtml(headings[index] ?? page.name)}">`).join("")}</aside>` : "";
  const markup = `<!doctype html><html><head><title>${escapeHtml(page.name)} · ${escapeHtml(projectName)}</title></head><body>
    <div class="vcaist-reconstructed-shell">
      <header><a class="vcaist-reconstructed-brand" href="/">${escapeHtml(projectName)}</a><nav aria-label="Detected application pages">${navigation}</nav><span>${escapeHtml(page.route)}</span></header>
      <main><section class="vcaist-reconstructed-hero"><div><small>${escapeHtml(framework)} · source-backed preview</small><h1>${escapeHtml(headings[0])}</h1><p>${escapeHtml(descriptions[0] ?? page.summary)}</p>${actionButtons ? `<div class="vcaist-reconstructed-actions">${actionButtons}</div>` : ""}</div>${media}</section>
      ${sections ? `<section class="vcaist-reconstructed-grid">${sections}</section>` : `<section class="vcaist-reconstructed-empty"><h2>${escapeHtml(page.name)}</h2><p>${escapeHtml(page.purpose)}</p></section>`}</main>
      <footer><span>${escapeHtml(fileName(page.sourcePath))}</span><span>Reconstructed from approved interface source</span></footer>
    </div></body></html>`;
  return createSandboxedStaticHtml(markup, `${styles}\n${reconstructedPreviewStyles}`, page.sourcePath, assetMap, documentMap);
}

const reconstructedPreviewStyles = `
  .vcaist-reconstructed-shell{min-height:100vh;color:#f6f2ec;background:#101513;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  .vcaist-reconstructed-shell>header{display:flex;align-items:center;gap:22px;padding:18px 28px;border-bottom:1px solid #34413d;background:#141b18}
  .vcaist-reconstructed-brand{color:#fff;font-size:18px;font-weight:850;text-decoration:none;white-space:nowrap}
  .vcaist-reconstructed-shell nav{display:flex;flex:1;justify-content:center;gap:8px;flex-wrap:wrap}
  .vcaist-reconstructed-shell nav a{padding:8px 11px;color:#bdc7c2;text-decoration:none;border-radius:999px;font-size:12px;font-weight:750}
  .vcaist-reconstructed-shell nav a[aria-current=page]{color:#111;background:#d39579}
  .vcaist-reconstructed-shell>header>span{padding:7px 10px;color:#ffc3a8;background:#3b241e;border-radius:999px;font-size:11px;font-weight:800}
  .vcaist-reconstructed-shell main{max-width:1120px;margin:auto;padding:54px 36px}
  .vcaist-reconstructed-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,.8fr);gap:36px;align-items:center;min-height:330px}
  .vcaist-reconstructed-hero small{color:#f1a98a;font-size:12px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}
  .vcaist-reconstructed-hero h1{max-width:760px;margin:14px 0 16px;color:#fff;font-size:clamp(42px,7vw,82px);line-height:.98;letter-spacing:-.055em}
  .vcaist-reconstructed-hero p{max-width:720px;color:#b9c1bd;font-size:17px;line-height:1.6}
  .vcaist-reconstructed-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
  .vcaist-reconstructed-actions button{padding:11px 15px;color:#15110f;background:#d39579;border:0;border-radius:10px;font-weight:800;cursor:pointer}
  .vcaist-reconstructed-actions button.selected{color:#e8f7ef;background:#236d51;box-shadow:0 0 0 3px #8dd9b433}
  .vcaist-reconstructed-media{display:grid;gap:12px}.vcaist-reconstructed-media img{display:block;width:100%;max-height:290px;object-fit:cover;border:1px solid #53605a;border-radius:24px;background:#1a211e}
  .vcaist-reconstructed-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:38px}
  .vcaist-reconstructed-grid article,.vcaist-reconstructed-empty{padding:24px;background:#171d1a;border:1px solid #3b4742;border-radius:18px}
  .vcaist-reconstructed-grid article>span{color:#f1a98a;font-size:11px;font-weight:900}.vcaist-reconstructed-grid h2,.vcaist-reconstructed-empty h2{margin:10px 0;color:#fff;font-size:21px}.vcaist-reconstructed-grid p,.vcaist-reconstructed-empty p{color:#aeb8b3;line-height:1.5}
  .vcaist-reconstructed-shell footer{display:flex;justify-content:space-between;gap:12px;padding:18px 28px;color:#8e9b95;border-top:1px solid #34413d;font-size:11px}
  @media(max-width:720px){.vcaist-reconstructed-shell>header{align-items:flex-start;flex-wrap:wrap;padding:14px}.vcaist-reconstructed-shell nav{order:3;justify-content:flex-start;width:100%}.vcaist-reconstructed-shell main{padding:32px 20px}.vcaist-reconstructed-hero{grid-template-columns:1fr}.vcaist-reconstructed-hero h1{font-size:48px}.vcaist-reconstructed-grid{grid-template-columns:1fr}}
`;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function createSandboxedStaticHtml(
  html: string,
  styles: string,
  htmlPath: string,
  assetMap: ReadonlyMap<string, string>,
  documentMap: ReadonlyMap<string, string>,
) {
  const safeStyles = styles
    .replace(/@import\s+[^;]+;/gi, "")
    .replace(/<\/style/gi, "<\\/style");
  let safeHtml = inlineApprovedScripts(html, htmlPath, documentMap)
    .replace(/<(?:iframe|object|embed|base)\b[\s\S]*?<\/(?:iframe|object|embed)>/gi, "")
    .replace(/<(?:iframe|object|embed|base)\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "")
    .replace(/\s(?:href|src)\s*=\s*["']\s*javascript:[\s\S]*?["']/gi, "")
    .replace(/\saction\s*=\s*(?:["'][\s\S]*?["']|[^\s>]+)/gi, "");
  safeHtml = inlineHtmlAssetAttributes(safeHtml, htmlPath, assetMap);
  safeHtml = inlineCssAssets(safeHtml, htmlPath, assetMap);
  const headContent = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; worker-src 'none'; child-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'"><style>html,body{margin:0;min-height:100%;overflow:auto}${safeStyles}</style><script>${previewBridgeScript()}</script>`;
  if (/<head\b[^>]*>/i.test(safeHtml)) safeHtml = safeHtml.replace(/<head\b[^>]*>/i, (head) => `${head}${headContent}`);
  else if (/<html\b[^>]*>/i.test(safeHtml)) safeHtml = safeHtml.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${headContent}</head>`);
  else safeHtml = `<!doctype html><html><head>${headContent}</head><body>${safeHtml}</body></html>`;
  return safeHtml;
}

function inlineApprovedScripts(html: string, htmlPath: string, documentMap: ReadonlyMap<string, string>) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_match, attributes: string, inlineCode: string) => {
    const type = attributes.match(/\btype\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i)?.slice(2).find(Boolean)?.toLowerCase() ?? "";
    if (type && !["text/javascript", "application/javascript", "module"].includes(type)) return "";
    const source = attributes.match(/\bsrc\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i)?.slice(2).find(Boolean);
    const code = source ? resolvePreviewDocument(htmlPath, source, documentMap) : inlineCode;
    if (!code) return "";
    const moduleType = type === "module" ? ' type="module"' : "";
    return `<script${moduleType}>${code.replace(/<\/script/gi, "<\\/script")}</script>`;
  });
}

function resolvePreviewDocument(basePath: string, value: string, documentMap: ReadonlyMap<string, string>) {
  const resolved = resolveProjectAssetPath(basePath, value);
  if (!resolved) return null;
  const exact = documentMap.get(resolved.toLowerCase());
  if (exact) return exact;
  const targetName = fileName(resolved).toLowerCase();
  const matches = [...documentMap.entries()].filter(([path]) => fileName(path).toLowerCase() === targetName);
  return matches.length === 1 ? matches[0][1] : null;
}

function previewBridgeScript() {
  return `(function(){
    var memory=function(){var values={};return{getItem:function(key){return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null},setItem:function(key,value){values[String(key)]=String(value)},removeItem:function(key){delete values[String(key)]},clear:function(){values={}},key:function(index){return Object.keys(values)[index]||null},get length(){return Object.keys(values).length}}};
    try{window.localStorage.length}catch(error){try{Object.defineProperty(window,'localStorage',{value:memory()})}catch(ignore){}}
    try{window.sessionStorage.length}catch(error){try{Object.defineProperty(window,'sessionStorage',{value:memory()})}catch(ignore){}}
    function send(destination){if(typeof destination==='string'&&destination){parent.postMessage({type:'vcaist:preview-navigate',destination:destination},'*')}}
    document.addEventListener('click',function(event){var node=event.target;var anchor=node&&node.closest?node.closest('a[href]'):null;if(!anchor)return;event.preventDefault();send(anchor.getAttribute('href'))},true);
    document.addEventListener('submit',function(event){event.preventDefault()},true);
    var push=history.pushState.bind(history);history.pushState=function(state,title,url){push(state,title,url);if(url!=null)send(String(url))};
    var replace=history.replaceState.bind(history);history.replaceState=function(state,title,url){replace(state,title,url);if(url!=null)send(String(url))};
  })();`;
}

function inlineHtmlAssetAttributes(html: string, htmlPath: string, assetMap: ReadonlyMap<string, string>) {
  return html.replace(/<(?:img|source|video|audio)\b[^>]*>/gi, (originalTag) => {
    let tag = originalTag;
    let lazySource: string | null = null;
    let lazySourceSet: string | null = null;
    const singleAssetPattern = /\s(src|poster|data-src|data-lazy-src|data-original)\s*=\s*(?:(["'])([^"']*)\2|([^\s>]+))/gi;
    tag = tag.replace(singleAssetPattern, (match, attribute: string, _quote: string, quotedValue: string, bareValue: string) => {
      const asset = resolvePreviewAsset(htmlPath, quotedValue ?? bareValue ?? "", assetMap);
      if (!asset) return match;
      if (/^data-(?:src|lazy-src|original)$/i.test(attribute)) lazySource = asset;
      return ` ${attribute}="${asset}"`;
    });

    const sourceSetPattern = /\s(srcset|data-srcset|data-lazy-srcset)\s*=\s*(?:(["'])([^"']*)\2|([^\s>]+))/gi;
    tag = tag.replace(sourceSetPattern, (match, attribute: string, _quote: string, quotedValue: string, bareValue: string) => {
      const value = quotedValue ?? bareValue ?? "";
      const candidates = value.split(",").map((candidate) => {
        const [reference, ...descriptor] = candidate.trim().split(/\s+/);
        const asset = resolvePreviewAsset(htmlPath, reference, assetMap);
        return asset ? `${asset}${descriptor.length ? ` ${descriptor.join(" ")}` : ""}` : candidate.trim();
      });
      if (!candidates.some((candidate) => candidate.startsWith("data:"))) return match;
      const inlined = candidates.join(", ");
      if (/^data-/i.test(attribute)) lazySourceSet = inlined;
      return ` ${attribute}="${inlined}"`;
    });

    if (lazySource) tag = setHtmlAttribute(tag, "src", lazySource);
    if (lazySourceSet) tag = setHtmlAttribute(tag, "srcset", lazySourceSet);
    return tag;
  });
}

function setHtmlAttribute(tag: string, attribute: string, value: string) {
  const pattern = new RegExp(`\\s${attribute}\\s*=\\s*(?:(["'])[^"']*\\1|[^\\s>]+)`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${attribute}="${value}"`);
  return tag.replace(/\s*\/?\s*>$/, (ending) => ` ${attribute}="${value}"${ending}`);
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

type InferredEntityField = {
  name: string;
  typeName: string;
  isMany: boolean;
  isPrimary: boolean;
  isForeign: boolean;
  references?: string;
};

type InferredEntity = {
  name: string;
  displayName: string;
  fields: readonly InferredEntityField[];
  sourcePath: string;
  sourceKind: "database-schema" | "source-types";
};

function buildEntityModel(kind: ProjectKind, documents: readonly SafeSourceDocument[]) {
  const schemaEntities = documents.flatMap((document) => [
    ...extractPrismaEntities(document),
    ...extractSqlEntities(document),
  ]);
  const schemaModel = assembleInferredEntityModel(schemaEntities, "database-schema");
  if (schemaModel) return schemaModel;

  const typeEntities = documents.flatMap(extractTypeEntities);
  const typeModel = assembleInferredEntityModel(typeEntities, "source-types");
  if (typeModel) return typeModel;

  const fallback = buildFallbackEntityModel(kind);
  return {
    ...fallback,
    evidence: { basis: "structural-fallback" as const, evidenceFiles: [] },
  };
}

function extractPrismaEntities(document: SafeSourceDocument): InferredEntity[] {
  if (!/\.prisma$/i.test(document.path)) return [];
  const entities: InferredEntity[] = [];
  for (const match of document.content.matchAll(/\bmodel\s+([A-Z][A-Za-z0-9_]*)\s*\{([\s\S]*?)\n?\}/g)) {
    const fields: InferredEntityField[] = [];
    for (const line of match[2].split(/\r?\n/)) {
      const field = line.trim().match(/^([A-Za-z_][\w]*)\s+([A-Za-z_][\w]*)(\[\])?(\?)?\s*(.*)$/);
      if (!field || field[1].startsWith("@@")) continue;
      const modifiers = field[5] ?? "";
      fields.push({
        name: field[1],
        typeName: field[2],
        isMany: Boolean(field[3]),
        isPrimary: /@id\b/.test(modifiers),
        isForeign: /@relation\b/.test(modifiers) || /Id$|_id$/i.test(field[1]),
        references: /^[A-Z]/.test(field[2]) ? field[2] : undefined,
      });
    }
    if (fields.length) entities.push({ name: match[1], displayName: humanizeEntityName(match[1]), fields, sourcePath: document.path, sourceKind: "database-schema" });
  }
  return entities;
}

function extractSqlEntities(document: SafeSourceDocument): InferredEntity[] {
  if (!/\.sql$/i.test(document.path) || !/\bcreate\s+table\b/i.test(document.content)) return [];
  const entities: InferredEntity[] = [];
  for (const match of document.content.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`\[]?([A-Za-z_][\w]*)["`\]]?\s*\(([\s\S]*?)\)\s*;/gi)) {
    const tableName = match[1];
    const fields: InferredEntityField[] = [];
    for (const part of splitTopLevelFields(match[2], ",")) {
      const column = part.trim().match(/^["`\[]?([A-Za-z_][\w]*)["`\]]?\s+([A-Za-z][\w()]*)\s*(.*)$/i);
      if (!column || /^(?:primary|foreign|unique|constraint|check)$/i.test(column[1])) continue;
      const modifiers = column[3] ?? "";
      const reference = modifiers.match(/\breferences\s+["`\[]?([A-Za-z_][\w]*)/i)?.[1];
      fields.push({
        name: column[1],
        typeName: column[2],
        isMany: false,
        isPrimary: /\bprimary\s+key\b/i.test(modifiers),
        isForeign: Boolean(reference) || /_id$|Id$/i.test(column[1]),
        references: reference,
      });
    }
    if (fields.length) entities.push({ name: tableName, displayName: humanizeEntityName(singularizeIdentifier(tableName)), fields, sourcePath: document.path, sourceKind: "database-schema" });
  }
  return entities;
}

function extractTypeEntities(document: SafeSourceDocument): InferredEntity[] {
  if (!/\.(?:ts|tsx|js|jsx)$/i.test(document.path) || /\.(?:spec|test|stories)\.[^.]+$/i.test(document.path)) return [];
  const entities: InferredEntity[] = [];
  const declaration = /\b(?:export\s+)?(?:type|interface)\s+([A-Z][A-Za-z0-9_$]*)(?:<[^>{}]{0,300}>)?[^={]{0,300}(?:=\s*)?\{/g;
  for (const match of document.content.matchAll(declaration)) {
    const name = match[1];
    if (/(?:Props|Options|Parameters|Context|Input|Response|Request|Result|State)$/i.test(name)) continue;
    const openingIndex = match.index + match[0].lastIndexOf("{");
    const closingIndex = findBalancedCodeBlockEnd(document.content, openingIndex);
    if (closingIndex < 0) continue;
    const body = document.content.slice(openingIndex + 1, closingIndex);
    const fields: InferredEntityField[] = [];
    for (const part of splitTopLevelFields(body)) {
      const property = part.trim().match(/^(?:readonly\s+)?["']?([A-Za-z_$][\w$-]*)["']?(\?)?\s*:\s*([\s\S]+)$/);
      if (!property) continue;
      const typeText = property[3].trim().replace(/[;,]\s*$/, "");
      if (!typeText || /^(?:\([^)]*\)\s*=>|Function\b)/.test(typeText)) continue;
      const references = [...typeText.matchAll(/\b([A-Z][A-Za-z0-9_$]*)\b/g)]
        .map((reference) => reference[1])
        .filter((reference) => !["Array", "Readonly", "ReadonlyArray", "Record", "Partial", "Pick", "Omit", "Date", "Promise", "File", "FileList"].includes(reference));
      fields.push({
        name: property[1],
        typeName: references[0] ?? typeText.split(/[|&<\[\s]/)[0],
        isMany: /\[\]|\b(?:Array|ReadonlyArray)\s*</.test(typeText),
        isPrimary: /^(?:id|[a-z][\w]*_id)$/i.test(property[1]),
        isForeign: /(?:Id|_id)$/i.test(property[1]),
        references: references[0],
      });
    }
    if (fields.length >= 3) entities.push({ name, displayName: humanizeEntityName(name), fields, sourcePath: document.path, sourceKind: "source-types" });
  }
  return entities;
}

function assembleInferredEntityModel(candidates: readonly InferredEntity[], basis: "database-schema" | "source-types") {
  const uniqueCandidates = candidates.filter((candidate, index) => candidates.findIndex((other) => other.name === candidate.name) === index);
  if (uniqueCandidates.length < 2) return null;
  const byName = new Map<string, InferredEntity>();
  for (const candidate of uniqueCandidates) {
    byName.set(candidate.name.toLowerCase(), candidate);
    byName.set(singularizeIdentifier(candidate.name).toLowerCase(), candidate);
  }
  const referenceCounts = new Map<string, number>();
  for (const candidate of uniqueCandidates) {
    for (const field of candidate.fields) {
      const target = resolveEntityReference(field, byName);
      if (!target || target.name === candidate.name) continue;
      referenceCounts.set(candidate.name, (referenceCounts.get(candidate.name) ?? 0) + 1);
      referenceCounts.set(target.name, (referenceCounts.get(target.name) ?? 0) + 1);
    }
  }

  const scored = uniqueCandidates
    .map((candidate) => ({
      candidate,
      score: Math.min(candidate.fields.length, 8)
        + (referenceCounts.get(candidate.name) ?? 0) * 5
        + (candidate.fields.some((field) => field.isPrimary) ? 4 : 0)
        + (/schema|model|database|db|entities/i.test(candidate.sourcePath) ? 5 : 0),
    }))
    .filter(({ candidate, score }) => basis === "database-schema" || score >= 7 || candidate.fields.some((field) => field.isPrimary))
    .sort((left, right) => right.score - left.score);
  if (scored.length < 2) return null;

  const selected = selectConnectedEntities(scored.map(({ candidate }) => candidate), byName, 7);
  if (selected.length < 2) return null;
  const selectedNames = new Set(selected.map((candidate) => candidate.name));
  const relationships: ProjectRelationship[] = [];
  for (const candidate of selected) {
    for (const field of candidate.fields) {
      const target = resolveEntityReference(field, byName);
      if (!target || target.name === candidate.name || !selectedNames.has(target.name)) continue;
      const relationship: ProjectRelationship = {
        from: candidate.displayName,
        fromCount: field.isMany ? "1" : field.isForeign ? "M" : "1",
        name: relationshipNameForField(field.name, field.isForeign),
        toCount: field.isMany ? "M" : "1",
        to: target.displayName,
      };
      if (!relationships.some((existing) => existing.from === relationship.from && existing.to === relationship.to && existing.name === relationship.name)) {
        relationships.push(relationship);
      }
    }
  }
  if (!relationships.length) return null;

  const entities: ProjectEntity[] = selected.map((candidate) => ({
    name: candidate.displayName,
    attributes: candidate.fields
      .slice()
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
      .slice(0, 5)
      .map((field) => `${field.name}${field.isPrimary ? " · PK" : field.isForeign ? " · FK" : ""}`),
  }));
  return {
    entities,
    relationships: relationships.slice(0, 9),
    evidence: {
      basis,
      evidenceFiles: [...new Set(selected.map((candidate) => candidate.sourcePath))].slice(0, 6),
    },
  };
}

function selectConnectedEntities(
  ranked: readonly InferredEntity[],
  byName: ReadonlyMap<string, InferredEntity>,
  maximum: number,
) {
  const selected: InferredEntity[] = [];
  const queued = ranked.length ? [ranked[0]] : [];
  const visited = new Set<string>();
  while (queued.length && selected.length < maximum) {
    const candidate = queued.shift();
    if (!candidate || visited.has(candidate.name)) continue;
    visited.add(candidate.name);
    selected.push(candidate);
    for (const possibleParent of ranked) {
      if (visited.has(possibleParent.name)) continue;
      if (possibleParent.fields.some((field) => resolveEntityReference(field, byName)?.name === candidate.name)) queued.push(possibleParent);
    }
    for (const field of candidate.fields) {
      const target = resolveEntityReference(field, byName);
      if (target && !visited.has(target.name)) queued.push(target);
    }
  }
  for (const candidate of ranked) {
    if (selected.length >= maximum) break;
    if (!visited.has(candidate.name) && candidate.fields.some((field) => resolveEntityReference(field, byName) && resolveEntityReference(field, byName)?.name !== candidate.name)) {
      selected.push(candidate);
      visited.add(candidate.name);
    }
  }
  return selected;
}

function resolveEntityReference(field: InferredEntityField, byName: ReadonlyMap<string, InferredEntity>) {
  if (field.references) {
    const exact = byName.get(field.references.toLowerCase());
    if (exact) return exact;
    const singular = byName.get(singularizeIdentifier(field.references).toLowerCase());
    if (singular) return singular;
  }
  const foreignBase = field.name.replace(/(?:_id|Id)$/i, "");
  return byName.get(foreignBase.toLowerCase()) ?? byName.get(singularizeIdentifier(foreignBase).toLowerCase());
}

function relationshipNameForField(fieldName: string, isForeign: boolean) {
  const normalized = fieldName.toLowerCase();
  if (/(?:pages|items|children|entries|records|findings|assets|messages|orders|projects)$/.test(normalized)) return "contains";
  if (/(?:owner|author|user|customer|account)/.test(normalized) || isForeign) return "belongs to";
  if (/(?:uses|modules|skills|categories|tags)/.test(normalized)) return "uses";
  return "has";
}

function findBalancedCodeBlockEnd(content: string, openingIndex: number) {
  let depth = 0;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let index = openingIndex; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelFields(value: string, additionalSeparator = "") {
  const fields: string[] = [];
  let start = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === "(") parenthesisDepth += 1;
    else if (character === ")") parenthesisDepth = Math.max(0, parenthesisDepth - 1);
    const atTopLevel = braceDepth === 0 && bracketDepth === 0 && parenthesisDepth === 0;
    if (atTopLevel && (character === ";" || character === "\n" || (additionalSeparator && character === additionalSeparator))) {
      const field = value.slice(start, index).trim();
      if (field) fields.push(field);
      start = index + 1;
    }
  }
  const finalField = value.slice(start).trim();
  if (finalField) fields.push(finalField);
  return fields;
}

function humanizeEntityName(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function singularizeIdentifier(value: string) {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, "y");
  if (/(?:status|analysis|news)$/i.test(value)) return value;
  if (/ses$/i.test(value)) return value.replace(/es$/i, "");
  if (/s$/i.test(value)) return value.slice(0, -1);
  return value;
}

function buildFallbackEntityModel(kind: ProjectKind) {
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
  if (route === "/" || identity.includes("home") || identity.includes("landing")) return "Introduce the application and direct visitors to its primary destinations";
  if (identity.includes("workspace")) return "Connect a project and provide the main application workspace";
  if (identity.includes("setting")) return "Let users configure their account and application preferences";
  if (identity.includes("help") || identity.includes("support") || identity.includes("docs")) return "Explain how to use the application and resolve common questions";
  if (identity.includes("demo") || identity.includes("sandbox")) return "Provide a safe guided example of the application's main workflow";
  if (identity.includes("sign-up") || identity.includes("signup") || identity.includes("register")) return "Create a new user account";
  if (identity.includes("login") || identity.includes("sign-in") || identity.includes("signin")) return "Authenticate returning users";
  if (identity.includes("profile") || identity.includes("account")) return "Show and manage the current user's account information";
  if (identity.includes("search")) return "Help visitors find relevant information or records";
  if (identity.includes("pricing") || identity.includes("plans")) return "Explain available plans, prices, and purchasing options";
  if (identity.includes("checkout")) return "Review an order and complete its purchase";
  if (identity.includes("cart")) return "Review selected items before checkout";
  if (identity.includes("catalog") || identity.includes("products") || identity.includes("shop")) return "Browse available products or services";
  if (identity.includes("project") || identity.includes("work")) return "Showcase selected work and outcomes";
  if (identity.includes("about") || identity.includes("experience")) return "Explain the person, team, or experience behind the application";
  if (identity.includes("contact")) return "Help visitors start a conversation";
  if (identity.includes("skill") || identity.includes("service")) return "Summarize capabilities and areas of expertise";
  if (identity.includes("blog") || identity.includes("article")) return "Help readers discover and read published content";
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

function cleanVisibleText(value: string, maximum = 320) {
  const text = stripJsxExpressions(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maximum) return text;
  const prefix = text.slice(0, maximum + 1);
  const wordBoundary = prefix.lastIndexOf(" ");
  const end = wordBoundary >= Math.floor(maximum * 0.65) ? wordBoundary : maximum;
  return `${prefix.slice(0, end).trimEnd()}…`;
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
