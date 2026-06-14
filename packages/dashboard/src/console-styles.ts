/**
 * Console chrome styles, scoped to the console's own shadow root. The Waterfall
 * view is mounted via `mountDashboard` into a *nested* shadow root, so its
 * widget styles (`styles.ts`) stay fully isolated — these rules never reach it.
 * Adapted from the former `analyze-app.ts` inline stylesheet.
 */
export const CONSOLE_STYLES = `
  :host {
    --bg: var(--st-bg, #0f1117);
    --bg2: #1a1d27;
    --bg3: #252833;
    --border: #2e3140;
    --text: #e1e4ed;
    --text2: #8b8fa3;
    --text3: #5a5e72;
    --green: #22c55e;
    --red: #ef4444;
    --amber: #f59e0b;
    --blue: #3b82f6;
    display: block;
    height: 100%;
    font-family: var(--st-font, 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace);
    font-size: var(--st-font-size, 13px);
    background: var(--bg);
    color: var(--text);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  .console { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .console-nav {
    display: flex; align-items: center; gap: 16px;
    padding: 10px 16px; background: var(--bg2);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .console-nav h1 { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .logo {
    width: 26px; height: 26px; border-radius: 6px;
    background: rgba(80, 70, 229, 0.15);
    box-shadow: inset 0 1px 4px rgba(80, 70, 229, 0.3);
    display: inline-flex; align-items: center; justify-content: center; font-size: 13px;
  }
  .tabs { display: flex; gap: 4px; }
  .tab {
    padding: 5px 12px; background: transparent; color: var(--text2);
    border: 1px solid var(--border); border-radius: 4px;
    font: inherit; cursor: pointer; font-size: 12px;
  }
  .tab:hover { color: var(--text); border-color: var(--text2); }
  .tab.active { background: var(--bg3); color: var(--text); border-color: var(--text2); }

  .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  /* ── Runner ───────────────────────────────────────────── */
  .runner { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .runner-bar {
    display: flex; align-items: center; gap: 16px;
    padding: 8px 16px; background: var(--bg2);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .run-picker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
  .run-picker select {
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 8px; font: inherit; font-size: 12px; min-width: 200px;
  }
  .conn { width: 8px; height: 8px; border-radius: 50%; background: var(--text3); }
  .conn.connected { background: var(--green); }
  .conn.disconnected { background: var(--red); }
  .status-bar { margin-left: auto; font-size: 12px; color: var(--text2); display: flex; gap: 14px; }
  .status-bar .ok { color: var(--green); }
  .status-bar .fail { color: var(--red); }

  .runner main {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr) minmax(320px, 420px);
    flex: 1; min-height: 0;
  }
  .runner aside.tree, .runner aside.detail {
    background: var(--bg2); border-right: 1px solid var(--border); overflow: auto;
  }
  .runner aside.detail { border-right: none; border-left: 1px solid var(--border); padding: 14px; }
  .list-pane { display: flex; flex-direction: column; min-width: 0; }
  .filters {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg2);
  }
  .filters input[type=search] {
    flex: 1; min-width: 180px;
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 5px 10px; font: inherit; font-size: 12px;
  }
  .chips { display: flex; gap: 4px; }
  .chip {
    border: 1px solid var(--border); background: transparent;
    color: var(--text3); padding: 4px 10px; border-radius: 12px;
    font: inherit; font-size: 11px; cursor: pointer;
  }
  .chip.on { color: var(--text); border-color: var(--text2); background: var(--bg3); }
  .chip[data-status=failed].on { color: var(--red); border-color: var(--red); }
  .chip[data-status=completed].on { color: var(--green); border-color: var(--green); }
  .chip[data-status=running].on { color: var(--blue); border-color: var(--blue); }
  .chip[data-status=timeout].on { color: var(--amber); border-color: var(--amber); }
  select.group-by {
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 8px; font: inherit; font-size: 12px;
  }
  .btn {
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; text-decoration: none;
  }
  .btn:hover { border-color: var(--blue); color: var(--blue); }
  .btn.subtle { color: var(--text2); }
  .btn.copied { color: var(--green); border-color: var(--green); }
  .list { flex: 1; overflow: auto; }
  .group-header {
    padding: 8px 14px; font-size: 11px; text-transform: uppercase;
    color: var(--text2); background: var(--bg);
    border-bottom: 1px solid var(--border); position: sticky; top: 0; letter-spacing: 0.04em;
  }
  .row {
    display: grid; grid-template-columns: 22px minmax(0, 1fr) auto auto auto;
    gap: 10px; align-items: center;
    padding: 6px 14px; border-bottom: 1px solid rgba(46, 49, 64, 0.4); cursor: pointer;
  }
  .row .row-team {
    color: var(--blue); font-size: 11px; white-space: nowrap;
    padding: 1px 6px; border: 1px solid var(--border); border-radius: 3px;
    background: rgba(59, 130, 246, 0.08);
  }
  .row:hover { background: rgba(255, 255, 255, 0.02); }
  .row.selected { background: rgba(59, 130, 246, 0.08); }
  .row .icon { font-weight: 700; }
  .row .icon.completed { color: var(--green); }
  .row .icon.failed { color: var(--red); }
  .row .icon.timeout { color: var(--amber); }
  .row .icon.running { color: var(--blue); }
  .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .row .meta { color: var(--text2); font-size: 11px; white-space: nowrap; }
  .row .file {
    color: var(--text3); font-size: 11px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 240px;
  }

  .tree { padding: 10px 0; font-size: 12px; }
  .tree-file { padding: 4px 14px; color: var(--text2); display: flex; justify-content: space-between; gap: 8px; }
  .tree-file .fail { color: var(--red); }
  .tree-scene {
    padding: 3px 14px 3px 28px; color: var(--text);
    display: flex; justify-content: space-between; gap: 8px; cursor: pointer;
  }
  .tree-scene:hover { background: rgba(255, 255, 255, 0.03); }
  .tree-scene.failed, .tree-scene.timeout { color: var(--red); }
  .tree-scene.running { color: var(--blue); }
  .tree-scene.selected { background: rgba(59, 130, 246, 0.08); }

  .detail h3 { font-size: 13px; margin-bottom: 8px; word-break: break-word; }
  .detail .meta-row { color: var(--text2); font-size: 11px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
  .detail .meta-row .pill { border: 1px solid var(--border); border-radius: 10px; padding: 1px 8px; }
  .detail .err {
    background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4);
    color: var(--red); padding: 8px 10px; border-radius: 4px;
    font-size: 12px; white-space: pre-wrap; word-break: break-word; margin-bottom: 12px;
  }
  .detail h4 { font-size: 11px; text-transform: uppercase; color: var(--text2); margin: 14px 0 6px; letter-spacing: 0.04em; }
  .detail ul { list-style: none; }
  .detail .alist li { font-size: 12px; padding: 2px 0; }
  .detail .alist .pass { color: var(--green); }
  .detail .alist .fail { color: var(--red); }
  .detail .timeline li { font-size: 11px; color: var(--text2); padding: 2px 0; }
  .detail .timeline .err-step { color: var(--red); }
  .detail .actions { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
  .detail .empty { color: var(--text2); font-size: 12px; }

  pre.snippet {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 4px; padding: 8px 0; font-size: 11px;
    overflow: auto; max-height: 240px; line-height: 1.45;
  }
  pre.snippet .ln {
    display: inline-block; width: 38px; text-align: right;
    color: var(--text3); padding-right: 10px; user-select: none;
  }
  pre.snippet .row-line { padding: 0 8px; white-space: pre; }
  pre.snippet .row-line.hl { background: rgba(239, 68, 68, 0.12); }

  /* ── Home ─────────────────────────────────────────────── */
  .index { padding: 48px 32px; max-width: 720px; margin: 0 auto; }
  .index h1 { font-size: 22px; font-weight: 600; display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .index .lede { color: var(--text2); font-size: 13px; margin-bottom: 32px; }
  .index .cards { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
  .index .card {
    display: block; text-align: left; width: 100%; padding: 20px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg2);
    color: var(--text); font: inherit; cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .index .card:hover { border-color: var(--text2); background: var(--bg3); }
  .index .card .name { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .index .card .desc { font-size: 12px; color: var(--text2); line-height: 1.5; }

  /* ── Waterfall host (nested shadow widget) ────────────── */
  .waterfall-host { flex: 1; min-height: 0; display: block; }
`
