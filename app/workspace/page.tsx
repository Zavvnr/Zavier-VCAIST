import type { Metadata } from "next";
import { Dashboard } from "../Dashboard";

export const metadata: Metadata = {
  title: "Your workspace",
  description: "Connect your own project to VCAIST without starting the tutorial or demo.",
};

export default function WorkspacePage() {
  return <Dashboard startWithImporter />;
}
