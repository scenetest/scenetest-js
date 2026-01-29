# VS Code Extension

We wanted the text DSL to *feel* like writing TypeScript specs — selectors highlighted like strings or HTML attribute values, actions like function calls, actor names like variables, interpolations like `${template literals}`. So we built a syntax highlighting extension.

The extension isn't on the VS Code Marketplace yet. For now, install from source:

```bash
git clone https://github.com/scenecheck/scenecheck-js.git
cd scenecheck-js/packages/vscode-scenecheck
npx @vscode/vsce package
code --install-extension vscode-scenecheck-0.1.0.vsix
```
