/**
 * Filesystem viewer middleware
 *
 * Serves project file and import graph data for the force-directed
 * filesystem viewer in the checks panel.
 *
 * Endpoint: GET /__scenetest/fs
 * Returns: { files: FileNode[], edges: Edge[] }
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve, relative, extname, dirname, join } from 'path'
import type { Connect } from 'vite'

export interface FsNode {
  /** Relative path from project root */
  id: string
  /** File name (last segment) */
  name: string
  /** Directory path */
  dir: string
  /** File extension */
  ext: string
  /** File size in bytes */
  size: number
  /** Group index (derived from top-level directory) */
  group: number
}

export interface FsEdge {
  /** Source file (importer) */
  source: string
  /** Target file (imported) */
  target: string
}

export interface FsGraphData {
  files: FsNode[]
  edges: FsEdge[]
  groups: string[]
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less',
  '.json',
])

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '.nuxt', '.output', 'coverage', '.turbo', '.cache',
])

/**
 * Recursively walk a directory and collect source files
 */
function walkDir(dir: string, root: string, files: FsNode[], groupMap: Map<string, number>): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    if (IGNORED_DIRS.has(entry)) continue

    const fullPath = resolve(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      walkDir(fullPath, root, files, groupMap)
    } else if (stat.isFile()) {
      const ext = extname(entry)
      if (!SOURCE_EXTENSIONS.has(ext)) continue

      const relPath = relative(root, fullPath)
      const dirPath = dirname(relPath)

      // Determine group from top-level directory
      const topDir = relPath.split('/')[0]
      if (!groupMap.has(topDir)) {
        groupMap.set(topDir, groupMap.size)
      }

      files.push({
        id: relPath,
        name: entry,
        dir: dirPath,
        ext,
        size: stat.size,
        group: groupMap.get(topDir)!,
      })
    }
  }
}

/**
 * Extract import paths from a source file using regex.
 * This is intentionally simple — no AST parsing needed for a visualization.
 */
function extractImports(filePath: string): string[] {
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  const imports: string[] = []

  // Match: import ... from '...'
  // Match: import '...'
  // Match: require('...')
  // Match: import('...')
  const importRegex = /(?:import\s+(?:[\s\S]*?)\s+from\s+|import\s*\(?\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

  let match
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]
    // Only include relative imports (not package imports)
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      imports.push(importPath)
    }
  }

  return imports
}

/**
 * Resolve a relative import path to a file in our file set
 */
function resolveImport(importPath: string, fromFile: string, fileSet: Set<string>, root: string): string | null {
  const fromDir = dirname(resolve(root, fromFile))
  let resolved = resolve(fromDir, importPath)
  let relResolved = relative(root, resolved)

  // Try exact match
  if (fileSet.has(relResolved)) return relResolved

  // Try adding extensions
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte']) {
    if (fileSet.has(relResolved + ext)) return relResolved + ext
  }

  // Try /index variants
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const indexPath = join(relResolved, 'index' + ext)
    if (fileSet.has(indexPath)) return indexPath
  }

  return null
}

/**
 * Build the complete file graph for a project root
 */
function buildFileGraph(root: string): FsGraphData {
  const files: FsNode[] = []
  const groupMap = new Map<string, number>()

  // Find the src directory (common convention)
  const srcDir = resolve(root, 'src')
  let scanRoot: string
  try {
    statSync(srcDir)
    scanRoot = srcDir
  } catch {
    scanRoot = root
  }

  walkDir(scanRoot, scanRoot, files, groupMap)

  // Build a set of all file IDs for quick lookup
  const fileSet = new Set(files.map(f => f.id))

  // Extract edges (import relationships)
  const edges: FsEdge[] = []
  const edgeSet = new Set<string>()

  for (const file of files) {
    const fullPath = resolve(scanRoot, file.id)
    const imports = extractImports(fullPath)

    for (const imp of imports) {
      const target = resolveImport(imp, file.id, fileSet, scanRoot)
      if (target && target !== file.id) {
        const edgeKey = `${file.id}->${target}`
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey)
          edges.push({ source: file.id, target })
        }
      }
    }
  }

  return {
    files,
    edges,
    groups: Array.from(groupMap.keys()),
  }
}

// Cache the graph data (rebuilds on each request would be expensive)
let cachedGraph: FsGraphData | null = null
let cachedRoot: string | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5000 // Refresh every 5 seconds at most

/**
 * Create the filesystem viewer middleware
 */
export function createFsViewerMiddleware(root: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url !== '/__scenetest/fs') {
      return next()
    }

    // Rebuild if stale or root changed
    const now = Date.now()
    if (!cachedGraph || cachedRoot !== root || now - cacheTimestamp > CACHE_TTL_MS) {
      cachedGraph = buildFileGraph(root)
      cachedRoot = root
      cacheTimestamp = now
    }

    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(cachedGraph))
  }
}
