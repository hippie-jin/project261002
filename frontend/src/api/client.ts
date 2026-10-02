/**
 * API 클라이언트 (T029) — 응답을 화면이 다루기 쉬운 결과로 분류한다.
 * 오류 화면에는 기술 용어를 노출하지 않는다(FR-083). 게이트 차단(409)과 권한 없음(403)을 구분한다.
 */
export type GateCode = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8'

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; kind: 'gate'; gate: GateCode; releasedBy: 'self' | 'others'; detail: Record<string, unknown>; status: 409 }
  | { ok: false; kind: 'forbidden'; permission?: string; status: 403 }
  | { ok: false; kind: 'unauthorized'; status: 401 }
  | { ok: false; kind: 'validation'; fields: Record<string, string>; status: number }
  | { ok: false; kind: 'notfound'; status: 404 }
  | { ok: false; kind: 'locked'; status: 423 }
  | { ok: false; kind: 'offline'; status: 0 }
  | { ok: false; kind: 'error'; status: number; error?: string }

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'hrh',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    return { ok: false, kind: 'offline', status: 0 }
  }
  if (res.status === 204) return { ok: true, data: undefined as T, status: 204 }
  let body: any = null
  const text = await res.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (res.ok) return { ok: true, data: body as T, status: res.status }
  if (res.status === 409 && body?.error === 'gate')
    return { ok: false, kind: 'gate', gate: body.gate, releasedBy: body.releasedBy, detail: body.detail ?? {}, status: 409 }
  if (res.status === 403) return { ok: false, kind: 'forbidden', permission: body?.permission, status: 403 }
  if (res.status === 401) return { ok: false, kind: 'unauthorized', status: 401 }
  if (res.status === 404) return { ok: false, kind: 'notfound', status: 404 }
  if (res.status === 423) return { ok: false, kind: 'locked', status: 423 }
  if (res.status === 422) return { ok: false, kind: 'validation', fields: body?.fields ?? {}, status: 422 }
  if (res.status === 502 || res.status === 503 || res.status === 504) return { ok: false, kind: 'offline', status: 0 }
  return { ok: false, kind: 'error', status: res.status, error: body?.error }
}

/** 화면에 보여 줄 일반 오류 문구(SD_02 §12-3) */
export function errorText(res: unknown): string {
  const r = (res ?? {}) as { kind?: string }
  switch (r.kind) {
    case 'offline':
      return '연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.'
    case 'forbidden':
      return '이 화면을 볼 수 있는 권한이 없어요.'
    case 'unauthorized':
      return '다시 로그인해 주세요.'
    case 'validation':
      return '입력한 내용을 다시 확인해 주세요.'
    case 'locked':
      return '로그인 시도가 많아 잠시 잠겼어요. 15분 뒤 다시 시도해 주세요.'
    default:
      return '잠시 문제가 생겼어요. 다시 시도해 주세요.'
  }
}
