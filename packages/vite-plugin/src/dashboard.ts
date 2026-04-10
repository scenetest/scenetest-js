/**
 * Self-contained HTML dashboard page with swim-lane timeline.
 * Connects to /__scenetest/events via SSE for real-time updates.
 */
export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scenetest Dashboard</title>
  <style>
    :root {
      --bg: #0f1117;
      --bg2: #1a1d27;
      --bg3: #252833;
      --border: #2e3140;
      --text: #e1e4ed;
      --text2: #8b8fa3;
      --green: #22c55e;
      --red: #ef4444;
      --amber: #f59e0b;
      --blue: #3b82f6;
      --purple: #8b5cf6;
      --cyan: #06b6d4;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bg2);
    }

    header h1 {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(80, 70, 229, 0.15);
      box-shadow: inset 0 1px 4px rgba(80, 70, 229, 0.3);
      font-size: 14px;
    }

    .status-bar {
      display: flex;
      gap: 16px;
      margin-left: auto;
      font-size: 13px;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat .label { color: var(--text2); }
    .stat .value { font-weight: 600; }
    .stat.pass .value { color: var(--green); }
    .stat.fail .value { color: var(--red); }

    .connection {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--amber);
      transition: background 0.3s;
    }
    .connection.connected { background: var(--green); }
    .connection.disconnected { background: var(--red); }

    main {
      padding: 24px;
    }

    .waiting {
      text-align: center;
      padding: 80px 24px;
      color: var(--text2);
    }

    .waiting h2 {
      font-size: 18px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .waiting p {
      font-size: 13px;
    }

    /* ─── Scene sections ──────────────────────────────── */
    .scene-section {
      margin-bottom: 32px;
    }

    .scene-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 8px 8px 0 0;
      font-size: 13px;
    }

    .scene-header .icon {
      font-size: 14px;
    }

    .scene-header .name {
      font-weight: 600;
    }

    .scene-header .file {
      color: var(--text2);
      margin-left: auto;
      font-size: 12px;
    }

    .scene-header .duration {
      color: var(--text2);
      font-size: 12px;
    }

    /* ─── Swim lanes ──────────────────────────────────── */
    .swim-lanes {
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    }

    .lane {
      display: flex;
      align-items: stretch;
      border-bottom: 1px solid var(--border);
      min-height: 48px;
    }

    .lane:last-child {
      border-bottom: none;
    }

    .lane-label {
      width: 120px;
      min-width: 120px;
      padding: 8px 14px;
      background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--cyan);
    }

    .lane-track {
      flex: 1;
      position: relative;
      padding: 6px 8px;
      min-height: 48px;
      overflow: hidden;
    }

    .action-bar {
      display: inline-flex;
      align-items: center;
      height: 28px;
      margin: 3px 2px;
      padding: 0 8px;
      border-radius: 4px;
      font-size: 11px;
      white-space: nowrap;
      position: relative;
      transition: opacity 0.2s;
      cursor: default;
    }

    .action-bar.success {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: var(--green);
    }

    .action-bar.error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--red);
    }

    .action-bar.running {
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: var(--blue);
      animation: pulse 1.5s ease-in-out infinite;
    }

    .action-bar.slow {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--amber);
    }

    .action-bar .duration {
      margin-left: 6px;
      opacity: 0.7;
      font-size: 10px;
    }

    .action-bar:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      background: var(--bg3);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      white-space: nowrap;
      z-index: 10;
      color: var(--text);
    }

    /* ─── Assertion markers ───────────────────────────── */
    .assertion-marker {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      margin: 7px 1px;
      border-radius: 3px;
      font-size: 10px;
      cursor: default;
    }

    .assertion-marker.pass {
      background: rgba(34, 197, 94, 0.2);
      color: var(--green);
    }

    .assertion-marker.fail {
      background: rgba(239, 68, 68, 0.2);
      color: var(--red);
    }

    /* ─── Time ruler ──────────────────────────────────── */
    .time-ruler {
      display: flex;
      align-items: stretch;
      border-bottom: 1px solid var(--border);
      height: 24px;
      background: var(--bg2);
    }

    .time-ruler .lane-label {
      height: 24px;
      min-height: 24px;
    }

    .time-ruler .ruler-track {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .tick {
      position: absolute;
      top: 0;
      height: 100%;
      border-left: 1px solid var(--border);
      font-size: 9px;
      color: var(--text2);
      padding-left: 4px;
      line-height: 24px;
    }

    /* ─── Event log ───────────────────────────────────── */
    .event-log {
      margin-top: 24px;
    }

    .event-log h3 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text2);
    }

    .log-entry {
      font-size: 12px;
      padding: 3px 0;
      color: var(--text2);
      display: flex;
      gap: 8px;
    }

    .log-entry .ts {
      color: var(--text2);
      opacity: 0.6;
      min-width: 70px;
    }

    .log-entry .actor {
      color: var(--cyan);
      min-width: 80px;
    }

    .log-entry .msg { color: var(--text); }
    .log-entry.error .msg { color: var(--red); }
    .log-entry.pass .msg { color: var(--green); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  </style>
</head>
<body>
  <header>
    <h1><span class="logo">S</span> Scenetest Dashboard</h1>
    <div class="status-bar">
      <div class="stat scenes">
        <span class="label">Scenes:</span>
        <span class="value" id="scene-count">0</span>
      </div>
      <div class="stat pass">
        <span class="label">Pass:</span>
        <span class="value" id="pass-count">0</span>
      </div>
      <div class="stat fail">
        <span class="label">Fail:</span>
        <span class="value" id="fail-count">0</span>
      </div>
      <div class="stat">
        <span class="label">Time:</span>
        <span class="value" id="elapsed">-</span>
      </div>
      <div class="connection" id="connection" title="SSE connection"></div>
    </div>
  </header>

  <main id="main">
    <div class="waiting" id="waiting">
      <h2>Waiting for scene run...</h2>
      <p>Run <code>scenetest</code> to see the live timeline here.</p>
    </div>
    <div id="scenes"></div>
  </main>

  <script>
    // ─── State ────────────────────────────────────────
    const state = {
      scenes: [],       // { name, file, actors, actions: Map<actor, []>, assertions: [], startTime, endTime, status }
      currentScene: null,
      runStartTime: null,
      passCount: 0,
      failCount: 0,
      sceneCount: 0,
    }

    // ─── SSE Connection ───────────────────────────────
    const evtSource = new EventSource('/__scenetest/events')
    const connEl = document.getElementById('connection')

    evtSource.onopen = () => {
      connEl.classList.add('connected')
      connEl.classList.remove('disconnected')
      connEl.title = 'Connected'
    }

    evtSource.onerror = () => {
      connEl.classList.add('disconnected')
      connEl.classList.remove('connected')
      connEl.title = 'Disconnected — retrying...'
    }

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        handleEvent(event)
      } catch {}
    }

    // ─── Event handling ───────────────────────────────
    function handleEvent(event) {
      switch (event.type) {
        case 'run:start':
          // Clear previous run
          state.scenes = []
          state.currentScene = null
          state.runStartTime = event.timestamp
          state.passCount = 0
          state.failCount = 0
          state.sceneCount = event.sceneCount
          document.getElementById('waiting').style.display = 'none'
          document.getElementById('scenes').innerHTML = ''
          updateStats()
          break

        case 'scene:start': {
          const scene = {
            name: event.name,
            file: event.file,
            actors: event.actors || [],
            actions: new Map(),
            assertions: [],
            startTime: event.timestamp,
            endTime: null,
            status: 'running',
          }
          // Initialize lanes for declared actors
          for (const actor of scene.actors) {
            scene.actions.set(actor, [])
          }
          state.scenes.push(scene)
          state.currentScene = scene
          renderScene(scene)
          break
        }

        case 'action:start': {
          const scene = state.currentScene
          if (!scene) break
          // Ensure lane exists for this actor
          if (!scene.actions.has(event.actor)) {
            scene.actions.set(event.actor, [])
            scene.actors.push(event.actor)
          }
          const actions = scene.actions.get(event.actor)
          actions.push({
            action: event.action,
            target: event.target,
            startTime: event.timestamp,
            endTime: null,
            duration: null,
            error: null,
            status: 'running',
          })
          renderScene(scene)
          break
        }

        case 'action:end': {
          const scene = state.currentScene
          if (!scene) break
          const actions = scene.actions.get(event.actor)
          if (!actions) break
          // Find the running action (last one that matches)
          for (let i = actions.length - 1; i >= 0; i--) {
            if (actions[i].status === 'running' && actions[i].action === event.action) {
              actions[i].endTime = event.timestamp
              actions[i].duration = event.duration
              actions[i].error = event.error || null
              actions[i].status = event.error ? 'error' : (event.duration > 500 ? 'slow' : 'success')
              break
            }
          }
          renderScene(scene)
          break
        }

        case 'assertion': {
          const scene = state.currentScene
          if (!scene) break
          scene.assertions.push({
            actor: event.actor,
            description: event.description,
            result: event.result,
            timestamp: event.timestamp,
          })
          if (event.result) state.passCount++
          else state.failCount++
          updateStats()
          renderScene(scene)
          break
        }

        case 'scene:end': {
          const scene = state.currentScene
          if (!scene) break
          scene.endTime = event.timestamp
          scene.status = event.status
          scene.duration = event.duration
          scene.error = event.error
          state.currentScene = null
          renderScene(scene)
          updateStats()
          break
        }

        case 'run:end':
          state.sceneCount = event.summary?.scenes || state.sceneCount
          state.passCount = event.summary?.assertions?.passed || state.passCount
          state.failCount = event.summary?.assertions?.failed || state.failCount
          document.getElementById('elapsed').textContent = event.duration + 'ms'
          updateStats()
          break
      }
    }

    // ─── Stats ────────────────────────────────────────
    function updateStats() {
      const completed = state.scenes.filter(s => s.status !== 'running').length
      document.getElementById('scene-count').textContent =
        completed + '/' + state.sceneCount
      document.getElementById('pass-count').textContent = state.passCount
      document.getElementById('fail-count').textContent = state.failCount

      if (state.runStartTime && state.scenes.some(s => s.status === 'running')) {
        document.getElementById('elapsed').textContent =
          (Date.now() - state.runStartTime) + 'ms'
      }
    }

    // Update elapsed timer
    setInterval(() => {
      if (state.runStartTime && state.scenes.some(s => s.status === 'running')) {
        document.getElementById('elapsed').textContent =
          (Date.now() - state.runStartTime) + 'ms'
      }
    }, 200)

    // ─── Rendering ────────────────────────────────────
    function renderScene(scene) {
      const idx = state.scenes.indexOf(scene)
      let el = document.getElementById('scene-' + idx)
      if (!el) {
        el = document.createElement('div')
        el.id = 'scene-' + idx
        el.className = 'scene-section'
        document.getElementById('scenes').appendChild(el)
      }

      const statusIcon = scene.status === 'completed' ? '\\u2713'
        : scene.status === 'failed' ? '\\u2717'
        : scene.status === 'timeout' ? '\\u23F1'
        : '\\u25B6'

      const statusColor = scene.status === 'completed' ? 'var(--green)'
        : scene.status === 'failed' || scene.status === 'timeout' ? 'var(--red)'
        : 'var(--blue)'

      const durationStr = scene.duration ? scene.duration + 'ms' : 'running...'

      // Build swim lanes
      let lanesHtml = ''
      const actors = Array.from(scene.actions.keys())

      // Calculate time range for positioning
      let minTime = scene.startTime
      let maxTime = scene.endTime || Date.now()
      for (const actions of scene.actions.values()) {
        for (const a of actions) {
          if (a.endTime && a.endTime > maxTime) maxTime = a.endTime
        }
      }
      const timeSpan = Math.max(maxTime - minTime, 1)

      // Time ruler
      const tickCount = 5
      let rulerHtml = ''
      for (let i = 0; i <= tickCount; i++) {
        const pct = (i / tickCount) * 100
        const ms = Math.round((i / tickCount) * timeSpan)
        rulerHtml += '<div class="tick" style="left: ' + pct + '%">' + formatMs(ms) + '</div>'
      }

      for (const actor of actors) {
        const actions = scene.actions.get(actor) || []
        let barsHtml = ''

        for (const a of actions) {
          const offsetPct = ((a.startTime - minTime) / timeSpan) * 100
          const durMs = a.duration || (Date.now() - a.startTime)
          const widthPct = Math.max((durMs / timeSpan) * 100, 2)

          const cls = a.status
          const label = a.action + (a.target ? '(' + escapeHtml(a.target) + ')' : '')
          const durLabel = a.duration ? formatMs(a.duration) : '...'
          const tooltip = label + ' — ' + durLabel + (a.error ? ' — ' + escapeHtml(a.error) : '')

          barsHtml += '<div class="action-bar ' + cls + '" ' +
            'style="position:absolute; left:' + offsetPct + '%; width:' + widthPct + '%;" ' +
            'data-tooltip="' + escapeHtml(tooltip) + '">' +
            '<span class="name">' + escapeHtml(a.action) + '</span>' +
            (a.duration ? '<span class="duration">' + formatMs(a.duration) + '</span>' : '') +
            '</div>'
        }

        // Assertion markers for this actor
        const actorAssertions = scene.assertions.filter(a => a.actor === actor)
        for (const a of actorAssertions) {
          const offsetPct = ((a.timestamp - minTime) / timeSpan) * 100
          const cls = a.result ? 'pass' : 'fail'
          const icon = a.result ? '\\u2713' : '\\u2717'
          barsHtml += '<div class="assertion-marker ' + cls + '" ' +
            'style="position:absolute; left:' + offsetPct + '%; top:50%; transform:translateY(-50%);" ' +
            'title="' + escapeHtml(a.description) + '">' + icon + '</div>'
        }

        lanesHtml += '<div class="lane">' +
          '<div class="lane-label">' + escapeHtml(actor) + '</div>' +
          '<div class="lane-track" style="position:relative;">' + barsHtml + '</div>' +
          '</div>'
      }

      el.innerHTML =
        '<div class="scene-header">' +
          '<span class="icon" style="color:' + statusColor + '">' + statusIcon + '</span>' +
          '<span class="name">' + escapeHtml(scene.name) + '</span>' +
          '<span class="file">' + escapeHtml(scene.file || '') + '</span>' +
          '<span class="duration">' + durationStr + '</span>' +
        '</div>' +
        '<div class="swim-lanes">' +
          '<div class="time-ruler">' +
            '<div class="lane-label" style="font-size:10px;color:var(--text2)">time</div>' +
            '<div class="ruler-track">' + rulerHtml + '</div>' +
          '</div>' +
          lanesHtml +
        '</div>'
    }

    function formatMs(ms) {
      if (ms < 1000) return ms + 'ms'
      return (ms / 1000).toFixed(1) + 's'
    }

    function escapeHtml(str) {
      if (!str) return ''
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }
  </script>
</body>
</html>`
}
