"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  defaultPreferences,
  modelGroups,
  modelOptions,
  readPreferences,
  themeOptions,
  writePreferences,
  type ModelId,
  type Preferences,
  type ThemeId,
} from "@/lib/preferences";

type TogglePreference = "autoScan" | "showTechnical" | "testBoundaries" | "plainLanguage";

export function SettingsPanel() {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [saved, setSaved] = useState(false);
  const activeModel = modelOptions.find((option) => option.id === preferences.model) ?? modelOptions[0];

  useEffect(() => {
    const stored = readPreferences();
    setPreferences(stored);
    applyTheme(stored.theme);
  }, []);

  function toggle(key: TogglePreference) {
    setSaved(false);
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  function chooseTheme(theme: ThemeId) {
    setSaved(false);
    setPreferences((current) => ({ ...current, theme }));
    applyTheme(theme);
  }

  function chooseModel(model: ModelId) {
    setSaved(false);
    setPreferences((current) => ({ ...current, model }));
  }

  function save() {
    writePreferences(preferences);
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
            <select id="settings-model" value={preferences.model} onChange={(event) => chooseModel(event.target.value as ModelId)}>
              {modelGroups.map((group) => (
                <optgroup label={group.label} key={group.label}>
                  {group.options.map((option) => (
                    <option value={option.id} key={option.id}>{option.label} · {option.price}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="active-model-summary" aria-live="polite">
            <div>
              <span>{activeModel.provider} · {activeModel.detail}</span>
              <strong>{activeModel.label}</strong>
            </div>
            <b>{activeModel.price}</b>
            <p>{activeModel.verdict}</p>
          </div>
          <div className="model-note"><span aria-hidden="true">i</span><p>Claude Sonnet 5 is the fresh-install default. Your choice is saved on this device; the prototype still uses the deterministic practice fixture.</p></div>
          <div className="model-catalog" aria-label="Available AI models">
            {modelGroups.map((group) => (
              <section className="model-tier" key={group.label}>
                <h3>{group.label}</h3>
                <div className="model-tier-rows">
                  {group.options.map((option) => (
                    <button
                      type="button"
                      className={preferences.model === option.id ? "model-catalog-row active" : "model-catalog-row"}
                      key={option.id}
                      onClick={() => chooseModel(option.id)}
                      aria-pressed={preferences.model === option.id}
                    >
                      <span className="model-catalog-name">
                        <strong>{option.label}</strong>
                        <small>{option.provider}{option.recommended ? " · Recommended" : ""}</small>
                      </span>
                      <span className="model-catalog-price">{option.price}</span>
                      <span className="model-catalog-verdict">{option.verdict}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="model-pricing-note">Prices are public list prices per 1M input / output tokens, checked July 17, 2026. Provider, platform, batch, and long-context rates can differ.</p>
        </section>

        <section className="panel settings-section appearance-section">
          <div className="settings-heading">
            <span className="settings-icon appearance" aria-hidden="true">◐</span>
            <div><h2>Color & appearance</h2><p>Choose a workspace palette. Changes preview immediately.</p></div>
          </div>
          <div className="theme-grid" role="radiogroup" aria-label="Workspace color theme">
            {themeOptions.map((theme) => (
              <button
                className={preferences.theme === theme.id ? "theme-option active" : "theme-option"}
                key={theme.id}
                onClick={() => chooseTheme(theme.id)}
                role="radio"
                aria-checked={preferences.theme === theme.id}
              >
                <span className={`theme-preview ${theme.id}`} aria-hidden="true"><i /><i /><i /></span>
                <span className="theme-option-copy"><strong>{theme.label}</strong><small>{theme.description}</small></span>
                <span className="theme-check" aria-hidden="true">{preferences.theme === theme.id ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <p className="appearance-note">Midnight Clay is the default: a black canvas, warm clay actions, light-blue details, and responsive hover shadows.</p>
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
