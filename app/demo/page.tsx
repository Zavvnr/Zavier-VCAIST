import type { Metadata } from "next";
import { Dashboard } from "../Dashboard";

export const metadata: Metadata = {
  title: "Financial demo",
  description: "Try VCAIST with a safe, interactive pricing application demo.",
};

export default function DemoPage() {
  return <Dashboard />;
}
