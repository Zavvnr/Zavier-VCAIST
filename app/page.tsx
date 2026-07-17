import type { Metadata } from "next";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Learn how VCAIST turns an unfamiliar app into a clear, safe control room.",
};

export default function Home() {
  return <Onboarding />;
}
