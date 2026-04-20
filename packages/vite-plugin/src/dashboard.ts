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
      position: sticky;
      top: 0;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bg2);
      z-index: 100;
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

    /* ─── Replay buttons ─────────────────────────────── */
    .replay-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: transparent;
      color: var(--text2);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .replay-btn:hover {
      background: rgba(59, 130, 246, 0.15);
      border-color: var(--blue);
      color: var(--blue);
    }

    .replay-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .replay-btn:disabled:hover {
      background: transparent;
      border-color: var(--border);
      color: var(--text2);
    }

    .replay-btn .play-icon {
      font-size: 10px;
    }

    .replay-all-btn {
      margin-left: 12px;
    }

    .scene-replay-btn {
      margin-left: auto;
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: transparent;
      color: var(--text2);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      margin-left: 6px;
    }

    .copy-btn:hover {
      background: rgba(139, 92, 246, 0.15);
      border-color: var(--purple);
      color: var(--purple);
    }

    .copy-btn.copied {
      background: rgba(34, 197, 94, 0.15);
      border-color: var(--green);
      color: var(--green);
    }

    .copy-btn .copy-icon {
      font-size: 12px;
      line-height: 1;
    }

    /* ─── Follow-output toggle ──────────────────────── */
    .follow-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: transparent;
      color: var(--text2);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
    }

    .follow-toggle:hover {
      border-color: var(--cyan);
      color: var(--cyan);
    }

    .follow-toggle input {
      margin: 0;
      cursor: pointer;
      accent-color: var(--cyan);
    }

    .follow-toggle.active {
      border-color: var(--cyan);
      color: var(--cyan);
      background: rgba(6, 182, 212, 0.08);
    }

    .stop-btn, .pause-btn {
      display: none;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: transparent;
      color: var(--text2);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .stop-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: var(--red);
      color: var(--red);
    }

    .pause-btn:hover {
      background: rgba(245, 158, 11, 0.15);
      border-color: var(--amber);
      color: var(--amber);
    }

    .stop-btn .btn-icon, .pause-btn .btn-icon {
      font-size: 10px;
    }

    .running .stop-btn, .running .pause-btn {
      display: inline-flex;
    }

    /* ─── Progress bar ───────────────────────────────── */
    .progress-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--border);
      display: none;
    }

    .progress-bar.visible {
      display: block;
    }

    .progress-bar .progress-fill {
      height: 100%;
      background: var(--blue);
      transition: width 0.3s ease;
      width: 0%;
    }

    .progress-bar.done .progress-fill {
      background: var(--green);
    }

    .progress-bar.has-failures .progress-fill {
      background: var(--red);
    }

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

    /* ─── Scene errors ────────────────────────────────── */
    .scene-errors {
      border: 1px solid var(--border);
      border-top: none;
      background: rgba(239, 68, 68, 0.05);
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .scene-error-line {
      font-size: 12px;
      color: var(--red);
      display: flex;
      align-items: baseline;
      gap: 8px;
      line-height: 1.4;
    }

    .scene-error-line .error-icon {
      flex-shrink: 0;
      font-size: 10px;
    }

    .scene-error-line .error-action {
      color: var(--text2);
      flex-shrink: 0;
    }

    .scene-error-line .error-msg {
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }

    .scene-error-line.expanded .error-msg {
      display: block;
      -webkit-line-clamp: unset;
      line-clamp: unset;
      overflow: visible;
    }

    .scene-error-line .expand-hint {
      color: var(--text2);
      font-size: 10px;
      flex-shrink: 0;
      opacity: 0.6;
      margin-left: 4px;
    }

    /* ─── Swim lanes ──────────────────────────────────── */
    .swim-lanes {
      border: 1px solid var(--border);
      border-top: none;
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
      z-index: 50;
      color: var(--text);
      pointer-events: none;
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
    <button class="replay-btn replay-all-btn" id="replay-all" onclick="replayAll()">
      <span class="play-icon">&#9654;</span> Replay All
    </button>
    <button class="pause-btn" id="pause-btn" onclick="togglePause()">
      <span class="btn-icon" id="pause-icon">&#9646;&#9646;</span> <span id="pause-label">Pause</span>
    </button>
    <button class="stop-btn" id="stop-btn" onclick="stopRun()">
      <span class="btn-icon">&#9632;</span> Stop
    </button>
    <label class="follow-toggle active" id="follow-toggle" title="Auto-scroll to the newest scene. Scrolling up manually turns this off.">
      <input type="checkbox" id="follow-checkbox" checked>
      <span>Follow output</span>
    </label>
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
    <div class="progress-bar" id="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
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
      followOutput: true,
    }

    // ─── Follow-output toggle ────────────────────────
    var followToggleEl = document.getElementById('follow-toggle')
    var followCheckboxEl = document.getElementById('follow-checkbox')

    function setFollowOutput(enabled, opts) {
      state.followOutput = enabled
      followCheckboxEl.checked = enabled
      followToggleEl.classList.toggle('active', enabled)
      if (enabled && !(opts && opts.skipScroll)) {
        scrollToLatestScene()
      }
    }

    followToggleEl.addEventListener('click', function(e) {
      // The label's default click also toggles the checkbox; intercept both paths.
      if (e.target !== followCheckboxEl) {
        e.preventDefault()
        setFollowOutput(!state.followOutput)
      } else {
        // checkbox was clicked directly; sync state after browser toggles it
        setTimeout(function() { setFollowOutput(followCheckboxEl.checked) }, 0)
      }
    })

    function scrollToLatestScene() {
      if (state.scenes.length === 0) return
      var idx = state.scenes.length - 1
      var el = document.getElementById('scene-' + idx)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // User-initiated scroll disables follow. We only listen to events that
    // come from direct user input (wheel, touch, scroll-keys) — programmatic
    // scrollIntoView() does not fire these, so it won't accidentally toggle.
    function onUserScrollIntent() {
      if (state.followOutput) setFollowOutput(false, { skipScroll: true })
    }
    window.addEventListener('wheel', onUserScrollIntent, { passive: true })
    window.addEventListener('touchmove', onUserScrollIntent, { passive: true })
    window.addEventListener('keydown', function(e) {
      var scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']
      if (scrollKeys.indexOf(e.key) !== -1) onUserScrollIntent()
    })

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
          setRunning(true)
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
          // Auto-scroll to keep the running scene visible, only when the
          // user has follow-output enabled. Scrolling up manually turns it off.
          if (state.followOutput) {
            var sceneEl = document.getElementById('scene-' + (state.scenes.length - 1))
            if (sceneEl) sceneEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
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
          if (event.status === 'completed') state.passCount++
          else state.failCount++
          state.currentScene = null
          renderScene(scene)
          updateStats()
          break
        }

        case 'run:end':
          state.sceneCount = event.summary?.scenes || state.sceneCount
          if (event.summary) {
            state.passCount = event.summary.completed ?? state.passCount
            state.failCount = event.summary.failed ?? state.failCount
          }
          document.getElementById('elapsed').textContent = event.duration + 'ms'
          setRunning(false)
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

      // Progress bar
      var bar = document.getElementById('progress-bar')
      var fill = document.getElementById('progress-fill')
      if (state.sceneCount > 0) {
        bar.classList.add('visible')
        var pct = Math.round((completed / state.sceneCount) * 100)
        fill.style.width = pct + '%'
        bar.classList.toggle('done', completed === state.sceneCount && state.failCount === 0)
        bar.classList.toggle('has-failures', state.failCount > 0)
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

      const replayDisabled = state.scenes.some(s => s.status === 'running') ? ' disabled' : ''
      const replayFileAttr = scene.file ? ' data-file="' + escapeHtml(scene.file) + '"' : ''

      // Collect errors from failed actions and scene-level error
      var errors = []
      for (var _a of scene.actions.values()) {
        for (var _act of _a) {
          if (_act.error) {
            errors.push({ action: _act.action, target: _act.target, msg: _act.error })
          }
        }
      }
      if (scene.error && !errors.some(function(e) { return e.msg === scene.error })) {
        errors.push({ action: null, target: null, msg: scene.error })
      }

      var errorsHtml = ''
      if (errors.length > 0) {
        var lines = ''
        for (var _e of errors) {
          var actionLabel = _e.action
            ? '<span class="error-action">' + escapeHtml(_e.action + (_e.target ? '(' + _e.target + ')' : '')) + '</span> '
            : ''
          lines += '<div class="scene-error-line" onclick="toggleErrorExpand(this)" title="Click to expand/collapse">' +
            '<span class="error-icon">\\u2717</span> ' +
            actionLabel +
            '<span class="error-msg">' + escapeHtml(_e.msg) + '</span>' +
            '</div>'
        }
        errorsHtml = '<div class="scene-errors" style="border-radius: 0 0 8px 8px;">' + lines + '</div>'
      }

      var lanesRadius = errors.length > 0 ? '' : ' style="border-radius: 0 0 8px 8px;"'

      el.innerHTML =
        '<div class="scene-header">' +
          '<span class="icon" style="color:' + statusColor + '">' + statusIcon + '</span>' +
          '<span class="name">' + escapeHtml(scene.name) + '</span>' +
          '<span class="file">' + escapeHtml(scene.file || '') + '</span>' +
          '<span class="duration">' + durationStr + '</span>' +
          '<button class="replay-btn scene-replay-btn"' + replayFileAttr + replayDisabled +
            ' onclick="replayScene(this)">' +
            '<span class="play-icon">&#9654;</span> Replay' +
          '</button>' +
          '<button class="copy-btn scene-copy-btn" data-scene-idx="' + idx + '"' +
            ' onclick="copyScene(this)" title="Copy scene name, file, and errors">' +
            '<span class="copy-icon">&#128203;</span>' +
          '</button>' +
        '</div>' +
        '<div class="swim-lanes"' + lanesRadius + '>' +
          '<div class="time-ruler">' +
            '<div class="lane-label" style="font-size:10px;color:var(--text2)">time</div>' +
            '<div class="ruler-track">' + rulerHtml + '</div>' +
          '</div>' +
          lanesHtml +
        '</div>' +
        errorsHtml
    }

    function formatMs(ms) {
      if (ms < 1000) return ms + 'ms'
      return (ms / 1000).toFixed(1) + 's'
    }

    function escapeHtml(str) {
      if (!str) return ''
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    // ─── Run controls ─────────────────────────────────
    var isPaused = false

    function setRunning(running) {
      document.querySelectorAll('.replay-btn').forEach(function(btn) {
        btn.disabled = running
      })
      if (running) {
        document.querySelector('header').classList.add('running')
      } else {
        document.querySelector('header').classList.remove('running')
        isPaused = false
        updatePauseButton()
      }
    }

    function updatePauseButton() {
      document.getElementById('pause-icon').innerHTML = isPaused ? '&#9654;' : '&#9646;&#9646;'
      document.getElementById('pause-label').textContent = isPaused ? 'Resume' : 'Pause'
    }

    function replayAll() {
      setRunning(true)
      fetch('/__scenetest/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(function() {
        setRunning(false)
      })
    }

    function replayScene(btn) {
      var file = btn.getAttribute('data-file')
      if (!file) return
      setRunning(true)
      fetch('/__scenetest/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: file }),
      }).catch(function() {
        setRunning(false)
      })
    }

    function stopRun() {
      fetch('/__scenetest/stop', { method: 'POST' })
        .then(function() { setRunning(false) })
        .catch(function() { setRunning(false) })
    }

    function toggleErrorExpand(el) {
      el.classList.toggle('expanded')
    }

    function copyScene(btn) {
      var idx = parseInt(btn.getAttribute('data-scene-idx'), 10)
      var scene = state.scenes[idx]
      if (!scene) return

      var lines = []
      lines.push('Scene: ' + scene.name)
      if (scene.file) lines.push('File: ' + scene.file)
      if (scene.status) lines.push('Status: ' + scene.status)
      if (scene.duration != null) lines.push('Duration: ' + scene.duration + 'ms')

      var errs = []
      for (var actionsArr of scene.actions.values()) {
        for (var a of actionsArr) {
          if (a.error) {
            errs.push('  \\u2717 ' + a.action + (a.target ? '(' + a.target + ')' : '') + ' \\u2014 ' + a.error)
          }
        }
      }
      if (scene.error && !errs.some(function(l) { return l.indexOf(scene.error) !== -1 })) {
        errs.push('  \\u2717 ' + scene.error)
      }
      if (errs.length > 0) {
        lines.push('')
        lines.push('Errors:')
        for (var line of errs) lines.push(line)
      }

      var failedAssertions = scene.assertions.filter(function(a) { return !a.result })
      if (failedAssertions.length > 0) {
        lines.push('')
        lines.push('Failed assertions:')
        for (var fa of failedAssertions) {
          lines.push('  \\u2717 [' + fa.actor + '] ' + fa.description)
        }
      }

      var text = lines.join('\\n')
      var done = function() {
        btn.classList.add('copied')
        var icon = btn.querySelector('.copy-icon')
        var prev = icon.innerHTML
        icon.innerHTML = '&#10003;'
        setTimeout(function() {
          btn.classList.remove('copied')
          icon.innerHTML = prev
        }, 1200)
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function() {
          fallbackCopy(text, done)
        })
      } else {
        fallbackCopy(text, done)
      }
    }

    function fallbackCopy(text, done) {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch (_) {}
      document.body.removeChild(ta)
      done()
    }

    function togglePause() {
      fetch('/__scenetest/pause', { method: 'POST' })
        .then(function(r) { return r.json() })
        .then(function(data) {
          isPaused = data.paused
          updatePauseButton()
        })
        .catch(function() {})
    }
  </script>
</body>
</html>`
}
