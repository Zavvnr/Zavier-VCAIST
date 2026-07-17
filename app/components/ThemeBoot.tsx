"use client";

import { useLayoutEffect } from "react";
import { applyTheme, readPreferences } from "@/lib/preferences";

export function ThemeBoot() {
  useLayoutEffect(() => {
    applyTheme(readPreferences().theme);
  }, []);

  return null;
}
