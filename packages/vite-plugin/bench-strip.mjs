// Quick micro-benchmark: babel vs oxc stripper on a representative file.
// Run from packages/vite-plugin: `pnpm build && node bench-strip.mjs`
import { stripScenetest } from './dist/strip.js'
import { stripScenetestOxc } from './dist/strip-oxc.js'

// Synthesize a file that mixes typical React + scenetest patterns.
const COMPONENT = `
function Comp_N(props: Props) {
  const [count, setCount] = useState(0)
  should('Comp_N rendered', true)
  useCheck(() => {
    should('count positive', count >= 0)
    if (count > 10) failed('count too high')
  }, [count])
  return (
    <div className="card">
      <h2>{props.title}</h2>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
      {count > 0 && <span>{should('shown', true)}</span>}
    </div>
  )
}
`.trim()

function makeFile(numComponents) {
  const body = Array.from({ length: numComponents }, (_, i) =>
    COMPONENT.replaceAll('Comp_N', `Comp_${i}`)
  ).join('\n\n')
  return `import { useState, useEffect } from 'react'
import { should, failed, useCheck } from '@scenetest/checks-react'

interface Props { title: string }

${body}
`
}

function bench(name, fn, iterations) {
  // warmup
  for (let i = 0; i < 5; i++) fn()
  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) fn()
  const end = process.hrtime.bigint()
  const totalMs = Number(end - start) / 1e6
  const perOp = totalMs / iterations
  console.log(`${name.padEnd(20)} ${perOp.toFixed(3)} ms/op (${iterations} iter, ${totalMs.toFixed(1)} ms total)`)
  return perOp
}

for (const size of [1, 10, 50]) {
  const code = makeFile(size)
  const sizeKb = (code.length / 1024).toFixed(1)
  console.log(`\n--- ${size} components (${sizeKb} KB) ---`)
  const iter = size <= 10 ? 500 : 100
  const babel = bench('babel', () => stripScenetest(code, { filename: 'test.tsx', sourceMap: false }), iter)
  const oxc = bench('oxc', () => stripScenetestOxc(code, { filename: 'test.tsx', sourceMap: false }), iter)
  const speedup = (babel / oxc).toFixed(2)
  console.log(`speedup: ${speedup}x`)
}
