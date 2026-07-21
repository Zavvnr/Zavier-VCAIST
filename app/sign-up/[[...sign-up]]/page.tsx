import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a private VCAIST workspace.",
};

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/" aria-label="Return to the VCAIST tutorial">
        <span aria-hidden="true">V</span> VCAIST
      </Link>
      <section className="auth-introduction" aria-labelledby="sign-up-title">
        <span className="section-kicker">CREATE YOUR WORKSPACE</span>
        <h1 id="sign-up-title">One private workspace per person</h1>
        <p>Create an account before importing an application. Your identity becomes the ownership boundary for protected VCAIST resources.</p>
        <ul>
          <li><span aria-hidden="true">✓</span> Individually verified sessions</li>
          <li><span aria-hidden="true">✓</span> Server-enforced API protection</li>
          <li><span aria-hidden="true">✓</span> Sign out from any workspace page</li>
        </ul>
      </section>
      <div className="auth-component-shell">
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
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
