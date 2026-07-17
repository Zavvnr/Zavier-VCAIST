"use client";

import { useEffect, useState } from "react";

type Preferences = {
  autoScan: boolean;
  showTechnical: boolean;
  testBoundaries: boolean;
  plainLanguage: boolean;
};

const defaults: Preferences = {
  autoScan: true,
  showTechnical: false,
  testBoundaries: true,
  plainLanguage: true,
};

export function SettingsPanel() {
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("vcaist-preferences");
    if (!stored) return;
    try {
      setPreferences({ ...defaults, ...JSON.parse(stored) });
    } catch {
      window.localStorage.removeItem("vcaist-preferences");
    }
  }, []);

  function toggle(key: keyof Preferences) {
    setSaved(false);
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  function save() {
    window.localStorage.setItem("vcaist-preferences", JSON.stringify(preferences));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div className="settings-layout">
      <div className="settings-main">
        <section className="panel settings-section">
          <div className="settings-heading">
            <span className="settings-icon" aria-hidden="true">✦</span>
            <div><h2>AI model</h2><p>The model that explains and stress-tests your app.</p></div>
          </div>
          <label className="field-label" htmlFor="settings-model">Active model</label>
          <div className="select-wrap">
            <select id="settings-model" defaultValue="vcaist-core">
              <option value="vcaist-core">VCAIST Core · GPT-5.4</option>
            </select>
          </div>
          <div className="model-note"><span aria-hidden="true">i</span><p>More model choices are planned. For now, VCAIST Core keeps every explanation consistent.</p></div>
        </section>

        <section className="panel settings-section">
          <div className="settings-heading">
            <span className="settings-icon green" aria-hidden="true">✓</span>
            <div><h2>Scanning & safety</h2><p>Control what happens when project files are connected.</p></div>
          </div>
          <ToggleRow title="Check again when files change" description="Refresh controls and safety tests after you choose updated files." checked={preferences.autoScan} onChange={() => toggle("autoScan")} />
          <ToggleRow title="Try boundary cases" description="Include zero, very large, and just-before-the-limit inputs." checked={preferences.testBoundaries} onChange={() => toggle("testBoundaries")} />
          <ToggleRow title="Show technical file names" description="Add code file and function names beside plain-English explanations." checked={preferences.showTechnical} onChange={() => toggle("showTechnical")} />
        </section>

        <section className="panel settings-section">
          <div className="settings-heading">
            <span className="settings-icon amber" aria-hidden="true">A</span>
            <div><h2>Explanation style</h2><p>Choose how VCAIST talks about your project.</p></div>
          </div>
          <ToggleRow title="Plain language first" description="Lead with business meaning and keep code details secondary." checked={preferences.plainLanguage} onChange={() => toggle("plainLanguage")} />
        </section>
      </div>

      <aside className="settings-aside">
        <div className="panel privacy-card">
          <span className="privacy-mark" aria-hidden="true">⌾</span>
          <h2>Your approval is required</h2>
          <p>VCAIST can explain and simulate. It cannot publish a code change from this prototype.</p>
          <div className="privacy-list"><span>✓</span>Selected files only</div>
          <div className="privacy-list"><span>✓</span>Private simulations</div>
          <div className="privacy-list"><span>✓</span>No automatic publishing</div>
        </div>
        <button className="button dark full save-button" onClick={save}>{saved ? "Preferences saved ✓" : "Save preferences"}</button>
      </aside>
    </div>
  );
}

function ToggleRow({
  title, description, checked, onChange,
}: {
  title: string; description: string; checked: boolean; onChange: () => void;
}) {
  return (
    <label className="toggle-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </label>
  );
}
