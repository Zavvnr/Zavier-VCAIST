import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AppChrome } from "../components/AppChrome";
import { SettingsPanel } from "./SettingsPanel";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage VCAIST model, scanning, and explanation preferences.",
};

export default async function SettingsPage() {
  await auth.protect();
  return (
    <AppChrome active="settings">
      <div className="simple-header">
        <span className="section-kicker">PREFERENCES</span>
        <h1>Make VCAIST work your way</h1>
        <p>Choose how your app is explained and what VCAIST can inspect.</p>
      </div>
      <SettingsPanel />
    </AppChrome>
  );
}
