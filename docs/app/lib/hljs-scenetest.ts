/**
 * highlight.js language definition for Scenetest spec DSL.
 *
 * Mirrors the TextMate grammar in packages/vscode-scenetest/ so that
 * fenced code blocks tagged `scenetest` on the docs site get the same
 * highlighting as .spec.md files in VS Code.
 */
import type { HLJSApi, Language, Mode } from 'highlight.js'

export default function scenetestSpec(_hljs: HLJSApi): Language {
  const ACTIONS_RE =
    /(?:openTo|reload|goBack|goForward|switchDevice|seeInView|seeText|seeToast|notSee|see|scope|up|prev|ifClick|click|typeInto|check|select|pressKey|wait|emit|waitFor|warnIf|scrollToBottom|if)\b/

  const INTERPOLATION: Mode = {
    scope: 'template-variable',
    match: /\[[a-zA-Z][a-zA-Z0-9_-]*\.[a-zA-Z][a-zA-Z0-9_-]*\]/,
  }

  const SELECTOR: Mode = {
    scope: 'string',
    match: /[~@][a-zA-Z][a-zA-Z0-9_-]*/,
  }

  const NUMBER: Mode = {
    scope: 'number',
    match: /\b\d+\b/,
  }

  const LINK: Mode = {
    scope: 'link',
    match: /(?:https?:\/\/)\S+|\/[a-zA-Z0-9_\-/.]+/,
  }

  const LINE_TAIL: Mode[] = [INTERPOLATION, SELECTOR, NUMBER, LINK]

  return {
    name: 'Scenetest Spec',
    case_insensitive: false,
    contains: [
      // Headings: # Group name / ## Scene name
      {
        scope: 'section',
        match: /^#{1,2}\s+.+/,
      },
      // Comments: // text (with optional list prefix)
      {
        scope: 'comment',
        match: /^\s*(?:-\s*|\d+\.\s*)?\/\/.*/,
      },
      // HTML comment lines (<!-- ... -->)
      {
        scope: 'comment',
        match: /^\s*<!--[\s\S]*?-->/,
      },
      // Actor with inline action: user: openTo /login
      {
        begin: [
          /^\s*(?:-\s*|\d+\.\s*)?/,
          /[a-zA-Z][a-zA-Z0-9_-]*/,
          /:\s+/,
          ACTIONS_RE,
        ],
        beginScope: { 2: 'variable', 4: 'keyword' },
        end: /$/,
        contains: LINE_TAIL,
      },
      // Actor standalone: user:
      {
        match: [
          /^\s*(?:-\s*|\d+\.\s*)?/,
          /[a-zA-Z][a-zA-Z0-9_-]*/,
          /:\s*$/,
        ],
        scope: { 2: 'variable' },
      },
      // Macro invocation: login() or login() args
      {
        begin: [
          /^\s*(?:-\s*|\d+\.\s*)?/,
          /[a-zA-Z][a-zA-Z0-9_-]*/,
          /\(\)/,
        ],
        beginScope: { 2: 'title.function' },
        end: /$/,
        contains: [INTERPOLATION],
      },
      // Standalone action keyword (no actor prefix)
      {
        begin: [
          /^\s*(?:-\s*|\d+\.\s*)?/,
          ACTIONS_RE,
        ],
        beginScope: { 2: 'keyword' },
        end: /$/,
        contains: LINE_TAIL,
      },
      // Catch remaining tokens at top level
      INTERPOLATION,
      SELECTOR,
      NUMBER,
    ],
  }
}
