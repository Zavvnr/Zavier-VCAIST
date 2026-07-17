"use client";

import Link from "next/link";
import { useState } from "react";

const tutorialSteps = [
  {
    id: 0,
    eyebrow: "START HERE",
    title: "Choose where your app lives",
    description: "Point VCAIST at a local folder, Google Drive folder, or GitHub repository. Your original project stays untouched.",
    time: "About 30 seconds",
  },
  {
    id: 1,
    eyebrow: "UNDERSTAND",
    title: "See the important rules",
    description: "VCAIST finds prices, fees, limits, and other business controls, then explains what each one changes in everyday language.",
    time: "About 1 minute",
  },
  {
    id: 2,
    eyebrow: "EXPERIMENT",
    title: "Try changes in a safe sandbox",
    description: "Move a slider and watch the real app logic run with your new value. Live customers and production data are never involved.",
    time: "Try as many times as you like",
  },
  {
    id: 3,
    eyebrow: "STAY SAFE",
    title: "Review surprises before acting",
    description: "VCAIST stress-tests awkward cases, explains any failure, and waits for your approval before a future code change can be prepared.",
    time: "You make the final decision",
  },
];

export function Onboarding() {
  const [activeStep, setActiveStep] = useState(0);
  const step = tutorialSteps[activeStep];

  return (
    <div className="onboarding-page">
      <header className="welcome-nav">
        <Link className="brand welcome-brand" href="/" aria-label="VCAIST home">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>VCAIST</span>
        </Link>
        <nav className="welcome-links" aria-label="Welcome navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#what-it-does">What it does</a>
          <Link className="button welcome-nav-button" href="/demo">Open demo <span aria-hidden="true">→</span></Link>
        </nav>
      </header>

      <main>
        <section className="welcome-hero">
          <div className="welcome-hero-copy">
            <div className="welcome-pill"><span aria-hidden="true">✦</span>No code knowledge needed</div>
            <h1>Understand the app you built—without learning to read code.</h1>
            <p>
              VCAIST turns an unfamiliar project into a plain-English map, safe business controls,
              and early warnings you can actually understand.
            </p>
            <div className="welcome-actions">
              <Link className="button dark welcome-primary" href="/demo">Take the financial demo <span aria-hidden="true">→</span></Link>
              <a className="welcome-text-link" href="#how-it-works">Show me how it works <span aria-hidden="true">↓</span></a>
            </div>
            <div className="welcome-reassurance">
              <span><b aria-hidden="true">✓</b>Your project stays yours</span>
              <span><b aria-hidden="true">✓</b>No automatic code changes</span>
            </div>
          </div>

          <div className="welcome-product-visual" aria-label="Preview of the VCAIST control room">
            <div className="welcome-visual-glow one" />
            <div className="welcome-visual-glow two" />
            <div className="welcome-app-window">
              <div className="welcome-window-top">
                <span className="mini-brand">V</span>
                <span className="window-title">Your app control room</span>
                <span className="window-model"><i />VCAIST Core</span>
              </div>
              <div className="welcome-window-body">
                <div className="welcome-window-side">
                  <span className="window-project">S</span>
                  <i className="window-nav-line active" />
                  <i className="window-nav-line" />
                  <i className="window-nav-line short" />
                </div>
                <div className="welcome-window-main">
                  <div className="window-connected"><span>✓</span><div><strong>ShopSpring is connected</strong><small>27 source files checked</small></div></div>
                  <div className="window-metrics"><i /><i /><i /></div>
                  <div className="window-panels">
                    <div className="window-sandbox">
                      <small>LIVE SANDBOX</small><strong>Try an order change</strong>
                      <div className="window-slider"><span /></div>
                      <div className="window-total"><small>Customer pays</small><b>$140.01</b></div>
                      <div className="window-bars"><i /><i /><i /><i /><i /></div>
                    </div>
                    <div className="window-warning"><span>!</span><small>VCAIST FOUND</small><strong>A zero-item order pays the customer</strong><p>Explained in plain English</p></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="welcome-float-card float-safe"><span>✓</span><div><strong>Safe to try</strong><small>No live data affected</small></div></div>
            <div className="welcome-float-card float-found"><span>4</span><div><strong>Controls found</strong><small>Ready to explore</small></div></div>
          </div>
        </section>

        <section className="welcome-proof" aria-label="VCAIST principles">
          <span>PLAIN ENGLISH</span><i />
          <span>REAL CODE RESULTS</span><i />
          <span>SAFE SIMULATIONS</span><i />
          <span>YOU APPROVE CHANGES</span>
        </section>

        <section className="tutorial-section" id="how-it-works">
          <div className="welcome-section-heading">
            <span className="section-kicker">YOUR FIRST FIVE MINUTES</span>
            <h2>Four steps from “I’m afraid to touch it” to “I understand this.”</h2>
            <p>Click each step to see what VCAIST does and what you stay in control of.</p>
          </div>

          <div className="tutorial-shell">
            <div className="tutorial-step-list" role="tablist" aria-label="VCAIST tutorial steps">
              {tutorialSteps.map((item, index) => (
                <button
                  className={activeStep === index ? "tutorial-step active" : "tutorial-step"}
                  key={item.title}
                  onClick={() => setActiveStep(index)}
                  role="tab"
                  aria-selected={activeStep === index}
                  aria-controls="tutorial-panel"
                >
                  <span className="tutorial-number">{index + 1}</span>
                  <span><strong>{item.title}</strong><small>{item.eyebrow}</small></span>
                  <span className="tutorial-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>

            <div className="tutorial-panel" id="tutorial-panel" role="tabpanel">
              <div className="tutorial-panel-copy">
                <span className="tutorial-panel-label">STEP {activeStep + 1} OF 4 · {step.eyebrow}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <span className="tutorial-time"><b aria-hidden="true">◷</b>{step.time}</span>
              </div>
              <TutorialPreview step={activeStep} />
              <div className="tutorial-panel-nav">
                <button onClick={() => setActiveStep(Math.max(0, activeStep - 1))} disabled={activeStep === 0}>← Previous</button>
                {activeStep < tutorialSteps.length - 1 ? (
                  <button className="next" onClick={() => setActiveStep(activeStep + 1)}>Next step →</button>
                ) : (
                  <Link className="next" href="/demo">Start demo →</Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="purpose-section" id="what-it-does">
          <div className="welcome-section-heading compact">
            <span className="section-kicker">WHAT VCAIST IS FOR</span>
            <h2>Your app, translated into decisions.</h2>
            <p>VCAIST keeps technical detail available without making you start there.</p>
          </div>
          <div className="purpose-grid">
            <article><span className="purpose-icon green" aria-hidden="true">◎</span><h3>See how it works</h3><p>Follow a visual map from what a customer does to the code and services that respond.</p><small>Plain-English and technical views</small></article>
            <article><span className="purpose-icon blue" aria-hidden="true">↔</span><h3>Explore business controls</h3><p>Adjust prices, thresholds, and fees in a sandbox, then see the real output change.</p><small>Your live app stays untouched</small></article>
            <article><span className="purpose-icon coral" aria-hidden="true">!</span><h3>Find surprises early</h3><p>Run awkward inputs on purpose and turn failures into a clear explanation of business impact.</p><small>Real tests, understandable results</small></article>
          </div>
        </section>

        <section className="demo-invitation">
          <div className="demo-invitation-copy">
            <span className="demo-kicker">INTERACTIVE PRACTICE APP</span>
            <h2>Ready to see the moment it clicks?</h2>
            <p>
              Use a safe financial demo to change a price, watch revenue move, and discover why
              a zero-item order accidentally creates negative money.
            </p>
            <Link className="button demo-button" href="/demo">Launch the financial demo <span aria-hidden="true">→</span></Link>
            <small>No setup required · About 3 minutes · Nothing can break</small>
          </div>
          <div className="demo-lesson-card">
            <div className="lesson-card-top"><span>THE MOMENT TO LOOK FOR</span><b>1 issue</b></div>
            <div className="lesson-bug-mark">!</div>
            <h3>A zero-item order pays the customer</h3>
            <p>Move the order quantity to zero and watch VCAIST explain the real pricing defect.</p>
            <div className="lesson-outcome"><span>Expected</span><strong>$0.00 or more</strong><span>Actual</span><strong className="negative">−$6.99</strong></div>
          </div>
        </section>
      </main>

      <footer className="welcome-footer">
        <Link className="brand" href="/" aria-label="VCAIST home"><span className="brand-mark" aria-hidden="true">V</span><span>VCAIST</span></Link>
        <p>No jargon. No surprise changes. You stay in control.</p>
        <div><Link href="/help">Help center</Link><Link href="/settings">Settings</Link><Link href="/demo">Demo</Link></div>
      </footer>
    </div>
  );
}

function TutorialPreview({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="lesson-preview source-preview" aria-label="Project source choices">
        <button><span>⌁</span><strong>Local folder</strong><small>On this device</small></button>
        <button><span>△</span><strong>Google Drive</strong><small>Choose a folder</small></button>
        <button><span className="gh">GH</span><strong>GitHub</strong><small>Paste a repository</small></button>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="lesson-preview controls-lesson-preview" aria-label="Business controls found">
        <div className="lesson-found"><span>✓</span><p><strong>4 business controls found</strong><small>Explained in plain English</small></p></div>
        <div className="lesson-control"><span>Price per item</span><b>$49</b><i><em style={{ width: "58%" }} /></i></div>
        <div className="lesson-control"><span>Bulk discount</span><b>20%</b><i><em style={{ width: "42%" }} /></i></div>
        <div className="lesson-control"><span>Shipping fee</span><b>$6.99</b><i><em style={{ width: "35%" }} /></i></div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="lesson-preview simulation-preview" aria-label="Safe order simulation">
        <div className="simulation-heading"><span>LIVE SANDBOX</span><b>Safe to try</b></div>
        <div className="simulation-quantity"><span>Items in test order</span><strong>3</strong></div>
        <div className="simulation-slider"><i /></div>
        <div className="simulation-total"><span>Customer would pay</span><strong>$140.01</strong></div>
        <div className="simulation-note"><span>◇</span>Live customers are not affected</div>
      </div>
    );
  }

  return (
    <div className="lesson-preview approval-preview" aria-label="Safety issue and approval flow">
      <div className="approval-alert"><span>!</span><div><small>NEEDS ATTENTION</small><strong>Empty orders become negative</strong></div></div>
      <div className="approval-explanation"><span>Plain-English reason</span><p>Shipping is subtracted from an empty order instead of added.</p></div>
      <div className="approval-lock"><span>✓</span><div><strong>You approve the next step</strong><small>No code changes happen automatically.</small></div></div>
    </div>
  );
}
