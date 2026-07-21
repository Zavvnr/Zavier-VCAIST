import type { Metadata } from "next";
import Link from "next/link";
import { AppChrome } from "../components/AppChrome";

export const metadata: Metadata = {
  title: "Help center",
  description: "Learn how VCAIST reads, explains, and safely tests your app.",
};

const questions = [
  {
    question: "Can VCAIST change my live app?",
    answer: "Not from this version. Simulations stay private, and future code changes will always wait for your approval.",
  },
  {
    question: "What is a business control?",
    answer: "It is a number or rule in your code that changes how your business behaves—like a price, fee, discount, or limit.",
  },
  {
    question: "Are the safety tests real?",
    answer: "The bundled pricing boundary check runs real fixture code and reports the actual output. Security and architecture findings are clearly labeled guided review examples until project-specific analysis is connected.",
  },
  {
    question: "Does uploading code make it public?",
    answer: "No. Workspace routes require your authenticated session, selected files remain temporary in browser memory, and VCAIST does not publish your source code or place it in a shared project database.",
  },
  {
    question: "Can another VCAIST user see my project?",
    answer: "No. Protected pages and AI endpoints verify your signed-in session on the server. Imported projects are currently temporary to your open browser workspace and are not available through a shared project list.",
  },
];

export default function HelpPage() {
  return (
    <AppChrome active="help">
      <div className="simple-header">
        <span className="section-kicker">HELP CENTER</span>
        <h1>Get comfortable with your app</h1>
        <p>Short answers, zero jargon. Start with the path below.</p>
      </div>

      <div className="help-content">
        <section className="help-hero panel">
          <div>
            <span className="help-badge">QUICK START · 3 MINUTES</span>
            <h2>Your first VCAIST check</h2>
            <p>Choose your current project, browse its interface, then open Compare and select a second local folder or GitHub repository.</p>
            <Link className="button dark link-button" href="/workspace" prefetch={false}>Open my workspace <span aria-hidden="true">→</span></Link>
          </div>
          <div className="help-steps" aria-label="Quick-start steps">
            <div><span>1</span><p><strong>Choose where your project lives</strong>Use a local folder, Drive, or GitHub.</p></div>
            <div><span>2</span><p><strong>Review the plain-English map</strong>See what each part affects.</p></div>
            <div><span>3</span><p><strong>Compare another interface</strong>Browse both page carousels independently.</p></div>
          </div>
        </section>

        <section className="help-section">
          <div className="section-title-row">
            <div><span className="section-kicker">COMMON QUESTIONS</span><h2>Things people ask first</h2></div>
          </div>
          <div className="faq-grid">
            {questions.map((item) => (
              <details className="faq-card" key={item.question}>
                <summary>{item.question}<span aria-hidden="true">+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="support-card">
          <div className="support-mark" aria-hidden="true">?</div>
          <div><strong>Still unsure?</strong><p>Use the sample app freely. It cannot affect a real store or customer.</p></div>
          <Link href="/demo" prefetch={false} className="text-button with-arrow">Try the demo <span aria-hidden="true">→</span></Link>
        </section>
      </div>
    </AppChrome>
  );
}
