# Scenetest VS Code Extension

Syntax highlighting for Scenetest scene specs (`.spec.md` files).

## Features

- **Syntax highlighting** for the text DSL format
- **Folding** by scene headings
- **Comment toggling** with `//`

### Highlighted Elements

| Element | Example | Color |
|---------|---------|-------|
| Scene headings | `# group`, `## scene name` | Heading |
| Actor declarations | `user:`, `admin:` | Variable |
| Actions | `see`, `click`, `typeInto` | Function |
| Selectors | `login-form`, `nav-menu` | String |
| Interpolation | `[user.email]` | Variable interpolation |
| Aliases | `~modal`, `~nav` | Constant |
| Aria-labels | `@Close`, `@Submit` | Constant |
| URLs | `/login`, `https://...` | Link |
| Numbers | `5000` | Number |
| Comments | `// log in flow` | Comment |
| Macros | `login()`, `setup()` | Function |
| Coordination | `emit`, `waitFor` | Keyword |
| Conditionals | `if` | Keyword |

## Installation

### From VSIX (local)

```bash
# Build the VSIX
cd packages/vscode-scenetest
npx @vscode/vsce package

# Install
code --install-extension vscode-scenetest-0.1.0.vsix
```

### From source (development)

1. Open the `packages/vscode-scenetest` folder in VS Code
2. Press F5 to launch Extension Development Host
3. Open a `.spec.md` file to see highlighting

## Example

```markdown
# User friend requests

## new user signs up and gets a friend request
new-user:
- openTo /
- see welcome-box
- click continue-button

primary-user:
- openTo /friends
- click main-navbar search
- typeInto search-input [new-user.username]
- see search-results-section
- click friend-request-button

new-user:
- seeToast friend-request
- see navbar notifications-badge
- click
- see notifications-menu-expanded new-friend-request
- click
```

## Roadmap

See the [Developer Experience design doc](/docs/public/design/developer-experience.md) for planned features:

- **Phase 2:** Language Server for scope tracking, hover info, go-to-definition
- **Phase 3:** Selector manifest generation and autocomplete
- **Phase 4:** ESLint integration for validation
