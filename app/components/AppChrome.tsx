"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";

type Destination = "workspace" | "about" | "help" | "settings";

const destinations: Array<{
  id: Destination;
  href: string;
  label: string;
  symbol: string;
}> = [
  { id: "workspace", href: "/demo", label: "Workspace", symbol: "⌂" },
  { id: "about", href: "/about", label: "About", symbol: "i" },
  { id: "help", href: "/help", label: "Help center", symbol: "?" },
  { id: "settings", href: "/settings", label: "Settings", symbol: "⚙" },
];

export function AppChrome({
  active,
  children,
  project = { name: "ShopSpring", sourceLabel: "Demo app" },
  projectConnected = true,
  workspaceHref = "/demo",
}: {
  active: Destination;
  children: ReactNode;
  project?: { name: string; sourceLabel: string };
  projectConnected?: boolean;
  workspaceHref?: string;
}) {
  const { isLoaded, user } = useUser();
  const accountName = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "My workspace";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="VCAIST home">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>VCAIST</span>
        </Link>

        <div className="side-label">YOUR APP</div>
        <div className="project-chip">
          <span className="project-avatar" aria-hidden="true">{project.name.charAt(0).toUpperCase()}</span>
          <span className="project-chip-copy">
            <strong>{project.name}</strong>
            <small>{project.sourceLabel}</small>
          </span>
          <span
            className={projectConnected ? "live-dot" : "live-dot disconnected"}
            role="img"
            aria-label={projectConnected ? "Connected" : "Not connected"}
          />
        </div>

        <nav className="side-nav">
          {destinations.map((item) => (
            <Link
              className={active === item.id ? "side-link active" : "side-link"}
              href={item.id === "workspace" ? workspaceHref : item.href}
              prefetch={item.id === "workspace" || item.id === "settings" ? false : undefined}
              key={item.id}
              aria-current={active === item.id ? "page" : undefined}
            >
              <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="side-note">
          <span className="shield-mark" aria-hidden="true">✓</span>
          <div>
            <strong>You stay in control</strong>
            <p>VCAIST always asks before changing code.</p>
          </div>
        </div>

        <div className="profile-row">
          {isLoaded && user ? (
            <>
              <UserButton
                signInUrl="/sign-in"
                appearance={{ elements: { avatarBox: { width: "38px", height: "38px" } } }}
              />
              <span>
                <strong>{accountName}</strong>
                <small>Private workspace</small>
              </span>
              <span className="profile-private-mark" aria-label="Authenticated private session">✓</span>
            </>
          ) : (
            <Link className="profile-sign-in" href="/sign-in">
              <span className="profile-avatar" aria-hidden="true">→</span>
              <span><strong>Sign in</strong><small>Open your private workspace</small></span>
            </Link>
          )}
        </div>
      </aside>

      <main className="main-area">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {destinations.map((item) => (
          <Link
            className={active === item.id ? "mobile-link active" : "mobile-link"}
            href={item.id === "workspace" ? workspaceHref : item.href}
            prefetch={item.id === "workspace" || item.id === "settings" ? false : undefined}
            key={item.id}
            aria-current={active === item.id ? "page" : undefined}
          >
            <span aria-hidden="true">{item.symbol}</span>
            {item.label.replace(" center", "")}
          </Link>
        ))}
      </nav>
    </div>
  );
}
