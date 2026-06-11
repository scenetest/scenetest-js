/**
 * Dev-mode shell for the dashboard at `/__scenetest/dashboard`.
 *
 * The dashboard UI itself lives in `@scenetest/dashboard` as a mountable
 * widget (`mountDashboard`), shared with scenetest-cloud. This page is only a
 * host: an importmap that points the widget's bare imports at the plugin's
 * disk-served ESM (see the `/__scenetest/widget/*` and `/__scenetest/vendor/*`
 * middleware routes), a mount point, and a one-line bootstrap that wires the
 * widget to the dev transport (fetch + SSE against this same middleware).
 */
export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scenetest Dashboard</title>
  <style>
    html, body, #root { height: 100%; margin: 0; background: #0f1117; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "preact": "/__scenetest/vendor/preact.js",
      "preact/hooks": "/__scenetest/vendor/preact-hooks.js",
      "htm": "/__scenetest/vendor/htm.js",
      "@scenetest/protocol": "/__scenetest/widget/protocol/index.js",
      "@scenetest/dashboard": "/__scenetest/widget/dashboard/index.js"
    }
  }
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import { mountDashboard, createDevTransport } from '@scenetest/dashboard'
    mountDashboard(document.getElementById('root'), {
      transport: createDevTransport(),
    })
  </script>
</body>
</html>`
}
