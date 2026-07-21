import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Dashboard } from "../Dashboard";

export const metadata: Metadata = {
  title: "Financial demo",
  description: "Try VCAIST with a safe, interactive pricing application demo.",
};

export default async function DemoPage() {
  await auth.protect();
  return <Dashboard />;
}
