/**
 * The widget's stylesheet, injected into its shadow root. The only theming
 * surface is the small set of `--st-*` custom properties on `:host`; every
 * internal color derives from them or from a fixed terminal palette. A host
 * may set `--st-bg`, `--st-accent`, `--st-font`, `--st-font-size` (and nothing
 * else) to retheme the pane. These are versioned with the widget, like the
 * wire protocol.
 */
export const STYLES = `
:host {
  /* ── Theming surface (host may override these four) ── */
  --st-bg: #0f1117;
  --st-accent: #3b82f6;
  --st-font: 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
  --st-font-size: 13px;

  /* ── Internal palette (derived; not a public surface) ── */
  --bg: var(--st-bg);
  --bg2: #1a1d27;
  --bg3: #252833;
  --border: #2e3140;
  --text: #e1e4ed;
  --text2: #8b8fa3;
  --green: #22c55e;
  --red: #ef4444;
  --amber: #f59e0b;
  --blue: var(--st-accent);

  display: block;
  font-family: var(--st-font);
  font-size: var(--st-font-size);
  color: var(--text);
  background: var(--bg);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

.root { min-height: 100%; background: var(--bg); }

header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
header.running .logo { animation: pulse 1.2s ease-in-out infinite; }

h1 { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.logo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: var(--blue); color: #fff; font-weight: 700;
}

button {
  font-family: inherit; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg3); color: var(--text);
  padding: 5px 10px; border-radius: 5px; display: inline-flex; align-items: center; gap: 6px;
}
button:hover:not(:disabled) { border-color: var(--blue); }
button:disabled { opacity: 0.5; cursor: default; }
.replay-all-btn { color: var(--green); }
.stop-btn { color: var(--red); }

.team-select-wrap { font-size: 12px; color: var(--text2); display: flex; align-items: center; gap: 6px; }
select {
  font-family: inherit; font-size: 12px; background: var(--bg3); color: var(--text);
  border: 1px solid var(--border); border-radius: 5px; padding: 4px 6px;
}

.spacer { flex: 1; }

.stats { display: flex; align-items: center; gap: 14px; font-size: 12px; }
.stat { display: flex; align-items: center; gap: 5px; }
.stat .label { color: var(--text2); }
.stat .value { font-weight: 600; }
.stat.pass .value { color: var(--green); }
.stat.fail .value { color: var(--red); }

.conn { width: 9px; height: 9px; border-radius: 50%; background: var(--text2); }
.conn.connected { background: var(--green); }
.conn.disconnected { background: var(--red); }

.progress { flex-basis: 100%; height: 3px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; width: 0; background: var(--blue); transition: width 0.2s ease; }
.progress.done .progress-fill { background: var(--green); }
.progress.has-failures .progress-fill { background: var(--red); }

main { padding: 16px 20px; }
.waiting { text-align: center; color: var(--text2); padding: 60px 20px; }
.waiting h2 { font-size: 16px; font-weight: 500; margin-bottom: 8px; color: var(--text); }
.waiting code { background: var(--bg3); padding: 2px 6px; border-radius: 4px; }

.scene {
  border: 1px solid var(--border); border-radius: 8px; background: var(--bg2);
  margin-bottom: 14px; overflow: hidden;
}
.scene.failed { border-color: var(--red); }
.scene-head {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-bottom: 1px solid var(--border); background: var(--bg3);
}
.scene-status { font-weight: 700; }
.scene-status.completed { color: var(--green); }
.scene-status.failed, .scene-status.timeout { color: var(--red); }
.scene-status.running { color: var(--amber); }
.scene-name { font-weight: 600; }
.scene-file { color: var(--text2); font-size: 11px; }
.scene-team {
  font-size: 11px; color: var(--blue); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 10px;
}
.scene-dur { color: var(--text2); font-size: 11px; margin-left: auto; }
.copy-btn { padding: 3px 7px; font-size: 11px; }
.copy-btn.copied { color: var(--green); border-color: var(--green); }

.lanes { padding: 8px 14px; display: flex; flex-direction: column; gap: 6px; }
.lane { display: flex; align-items: flex-start; gap: 8px; }
.lane-actor { color: var(--text2); min-width: 90px; font-size: 11px; padding-top: 3px; }
.lane-items { display: flex; flex-wrap: wrap; gap: 4px; }
.pill {
  font-size: 11px; padding: 2px 7px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--bg3); color: var(--text);
}
.pill.running { border-color: var(--amber); color: var(--amber); }
.pill.success { border-color: var(--green); }
.pill.slow { border-color: var(--amber); }
.pill.error { border-color: var(--red); color: var(--red); }
.pill .tgt { color: var(--text2); }

.assertions { padding: 0 14px 10px; display: flex; flex-direction: column; gap: 3px; }
.assert { font-size: 12px; display: flex; gap: 6px; align-items: baseline; }
.assert .mark { font-weight: 700; }
.assert.ok .mark { color: var(--green); }
.assert.bad .mark { color: var(--red); }
.assert .who { color: var(--text2); }

.scene-error {
  margin: 0 14px 12px; padding: 8px 10px; border-radius: 6px;
  background: rgba(239, 68, 68, 0.1); border: 1px solid var(--red);
  color: var(--red); font-size: 12px; white-space: pre-wrap; cursor: pointer;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
`
