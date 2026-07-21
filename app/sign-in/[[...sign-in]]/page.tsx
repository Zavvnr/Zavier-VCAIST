import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to open your private VCAIST workspace.",
};

export default function SignInPage() {
  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/" aria-label="Return to the VCAIST tutorial">
        <span aria-hidden="true">V</span> VCAIST
      </Link>
      <section className="auth-introduction" aria-labelledby="sign-in-title">
        <span className="section-kicker">PRIVATE WORKSPACE</span>
        <h1 id="sign-in-title">Your application stays with your account</h1>
        <p>Sign in before connecting a project. VCAIST verifies the session again whenever an AI or application resource is requested.</p>
        <ul>
          <li><span aria-hidden="true">✓</span> Other users cannot open your workspace</li>
          <li><span aria-hidden="true">✓</span> Sessions use secure, managed cookies</li>
          <li><span aria-hidden="true">✓</span> Imported source remains temporary</li>
        </ul>
      </section>
      <div className="auth-component-shell">
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/workspace"
          appearance={{
            variables: {
              colorPrimary: "#76d6b1",
              colorBackground: "#141816",
              colorForeground: "#f7f4ef",
              colorMutedForeground: "#aeb8b2",
              borderRadius: "0.85rem",
            },
          }}
        />
      </div>
    </main>
  );
}
