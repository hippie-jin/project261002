// T098 게이트 문구 일관성 검사 — '(G0)'~'(G8)' 문구는 src/gates/copy.ts 에만 있어야 한다(SD_02 §11 규칙 ④)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const root = new URL('../src/', import.meta.url).pathname
const bad = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(vue|ts)$/.test(f) && !p.endsWith('gates/copy.ts')) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim()
        if (t.startsWith('<!--') || t.startsWith('//') || t.startsWith('*')) return
        // 게이트 문구는 '…요 (G3)' 형태의 문장 — 관리 화면의 필드 이름('… 수 (G3)')은 제외
        if (/요 \(G[0-8]\)/.test(line)) bad.push(`${p.replace(root, 'src/')}:${i + 1}: ${line.trim()}`)
      })
    }
  }
}
walk(root)
if (bad.length) {
  console.error('게이트 문구 하드코딩:\n' + bad.join('\n'))
  process.exit(1)
}
console.log('PASS 게이트 문구는 gates/copy.ts 한 곳에서만 정의된다')
