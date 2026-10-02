/**
 * SQL 파일을 문장 단위로 나눈다. mysql2 는 클라이언트 지시어 DELIMITER 를 모르므로 여기서 해석한다(research R2).
 * 작은따옴표·큰따옴표·백틱 문자열과 -- / # / 블록 주석 안의 구분자는 무시한다.
 */
export function splitSql(source: string): string[] {
  const out: string[] = []
  let delimiter = ';'
  let buf = ''
  let i = 0
  const n = source.length
  let atLineStart = true

  const flush = () => {
    const s = buf.trim()
    if (s) out.push(s)
    buf = ''
  }

  while (i < n) {
    // 줄 시작의 DELIMITER 지시어
    if (atLineStart) {
      const rest = source.slice(i)
      const m = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i.exec(rest)
      if (m) {
        flush()
        delimiter = m[1]
        i += m[0].length
        atLineStart = true
        continue
      }
    }
    const ch = source[i]
    // 한 줄 주석
    if ((ch === '-' && source[i + 1] === '-' && /\s/.test(source[i + 2] ?? ' ')) || ch === '#') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? n : end
      continue
    }
    // 블록 주석
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    // 문자열
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < n) {
        if (source[j] === '\\' && ch !== '`') {
          j += 2
          continue
        }
        if (source[j] === ch) {
          if (source[j + 1] === ch) {
            j += 2
            continue
          }
          break
        }
        j++
      }
      buf += source.slice(i, j + 1)
      i = j + 1
      atLineStart = false
      continue
    }
    // 구분자
    if (source.startsWith(delimiter, i)) {
      flush()
      i += delimiter.length
      atLineStart = false
      continue
    }
    buf += ch
    atLineStart = ch === '\n'
    i++
  }
  flush()
  return out
}
