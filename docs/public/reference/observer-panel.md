# Observer Panel

The observer panel is a floating panel in your dev server that shows every `should()` and `failed()` assertion as it fires. The Vite plugin injects it in dev and strips it from production builds.

It reads assertion results directly from your running app, so it works whether you drive the app by hand or run scenes against it.

## Opening the panel

The panel appears in the corner of the page once your dev server starts. It shows a pass count and a fail count. Click the panel to expand the assertion list.

To disable it, set `devPanel: false` in the plugin options:

```js
scenetest({ devPanel: false })
```

## View modes

The panel has three view modes.

- **Grouped** — assertions that fire within 50 ms of each other collapse into one group. A group usually maps to one render or one user action.
- **By location** — assertions group by the source line that declared them. Use this to see how one check behaves across many runs.
- **Sequence** — assertions appear in the order they fired, on a timeline track.

## History and flaky detection

The panel keeps a history of every assertion location across the session. Each entry shows a `(N prior, M after)` stat, which counts the passes and failures recorded before and after the entry you are looking at.

If an assertion has both passed and failed during the session, the panel marks it flaky. A flaky assertion usually means the check races the state it reads, rather than that the app is broken.

## Assertion context

Every assertion carries the context object you passed to `should()`. The panel shows it in a tooltip. The fullscreen viewer shows it inline instead, because there is room for it.

## Click to editor

Click the file location on any assertion to open that line in your editor. This uses Vite's `/__open-in-editor` endpoint, so it needs no extra setup.

## Fullscreen viewer

Click the fullscreen button to open the assertion list as a full-page view. The fullscreen viewer shows the same three view modes with more room per entry.

## Audio feedback

The panel can play a tone on each pass and each failure. Audio starts muted, because browsers block audio until the user interacts with the page. Use the mute button and the volume slider in the panel to control it.

## Where it comes from

The panel ships in `@scenetest/checks/panel`. It is dependency-free DOM code that hooks the `window.__scenetest_report` global, so it runs under any bundler. The Vite plugin injects it for you in dev, and the docs site imports it directly.
