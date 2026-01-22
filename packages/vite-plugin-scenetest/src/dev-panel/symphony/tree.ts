/**
 * Component Tree Builder
 *
 * Builds a tree structure from assertion stack traces,
 * showing the component hierarchy where events occurred.
 */

import type { AssertionResult } from '../types.js'
import type { TreeNode, StackFrame } from './types.js'

/**
 * Parse a stack trace into structured frames
 */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return []

  const frames: StackFrame[] = []
  const lines = stack.split('\n')

  for (const line of lines) {
    // Match patterns like:
    // "at ComponentName (http://localhost:5173/src/App.tsx:42:7)"
    // "at http://localhost:5173/src/App.tsx:42:7"
    // "at Object.handleClick (http://localhost:5173/src/Button.tsx:15:3)"
    const match = line.match(
      /at\s+(?:(?:Object\.)?(\S+)\s+\()?(?:https?:\/\/[^/]+)?([^:)]+):(\d+)(?::(\d+))?/
    )

    if (match) {
      frames.push({
        functionName: match[1] || 'anonymous',
        file: match[2],
        line: parseInt(match[3], 10),
        column: match[4] ? parseInt(match[4], 10) : undefined,
      })
    }
  }

  return frames
}

/**
 * Extract a readable component/function name from a stack frame
 */
export function extractName(frame: StackFrame): string {
  // Clean up common patterns
  let name = frame.functionName

  // Remove Object. prefix
  if (name.startsWith('Object.')) {
    name = name.slice(7)
  }

  // Handle anonymous functions - use file name instead
  if (name === 'anonymous' || name === '<anonymous>') {
    const fileParts = frame.file.split('/')
    const fileName = fileParts[fileParts.length - 1]
    name = fileName.replace(/\.(tsx?|jsx?)$/, '')
  }

  return name
}

/**
 * Create a unique ID for a tree node
 */
function createNodeId(frame: StackFrame): string {
  return `${frame.file}:${frame.functionName}:${frame.line}`
}

/**
 * Build the component tree from all assertions
 */
export function buildTree(assertions: AssertionResult[]): {
  root: TreeNode
  nodeMap: Map<string, TreeNode>
} {
  const nodeMap = new Map<string, TreeNode>()

  // Root node represents the application
  const root: TreeNode = {
    id: 'root',
    name: 'App',
    children: [],
    depth: 0,
  }
  nodeMap.set('root', root)

  for (const assertion of assertions) {
    const frames = parseStack(assertion.stack)
    if (frames.length === 0) continue

    // Reverse frames so we go from root -> leaf
    const reversedFrames = [...frames].reverse()

    let currentNode = root
    let depth = 1

    for (const frame of reversedFrames) {
      const nodeId = createNodeId(frame)

      // Check if this node already exists
      let node = nodeMap.get(nodeId)

      if (!node) {
        node = {
          id: nodeId,
          name: extractName(frame),
          file: frame.file,
          line: frame.line,
          children: [],
          parent: currentNode,
          depth,
        }
        nodeMap.set(nodeId, node)

        // Only add as child if not already present
        if (!currentNode.children.find((c) => c.id === nodeId)) {
          currentNode.children.push(node)
        }
      }

      currentNode = node
      depth++
    }
  }

  return { root, nodeMap }
}

/**
 * Find the tree node that corresponds to an assertion
 */
export function findNodeForAssertion(
  assertion: AssertionResult,
  nodeMap: Map<string, TreeNode>
): TreeNode | null {
  const frames = parseStack(assertion.stack)
  if (frames.length === 0) return null

  // The first frame is where pass/fail was called
  const topFrame = frames[0]
  const nodeId = createNodeId(topFrame)

  return nodeMap.get(nodeId) || null
}

/**
 * Get all ancestor nodes for a given node (path to root)
 */
export function getAncestors(node: TreeNode): TreeNode[] {
  const ancestors: TreeNode[] = []
  let current = node.parent

  while (current) {
    ancestors.push(current)
    current = current.parent
  }

  return ancestors
}

/**
 * Calculate the maximum depth of the tree
 */
export function getTreeDepth(root: TreeNode): number {
  let maxDepth = 0

  function traverse(node: TreeNode, depth: number) {
    maxDepth = Math.max(maxDepth, depth)
    for (const child of node.children) {
      traverse(child, depth + 1)
    }
  }

  traverse(root, 0)
  return maxDepth
}

/**
 * Get all leaf nodes (nodes with no children)
 */
export function getLeafNodes(root: TreeNode): TreeNode[] {
  const leaves: TreeNode[] = []

  function traverse(node: TreeNode) {
    if (node.children.length === 0) {
      leaves.push(node)
    } else {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  traverse(root)
  return leaves
}

/**
 * Flatten the tree into an array for iteration
 */
export function flattenTree(root: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = []

  function traverse(node: TreeNode) {
    nodes.push(node)
    for (const child of node.children) {
      traverse(child)
    }
  }

  traverse(root)
  return nodes
}
