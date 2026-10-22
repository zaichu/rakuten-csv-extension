import { describe, it, expect } from 'vitest'
import { decodeCsvBytes } from './csvDecoder'

/**
 * 文字コード判定の挙動を固定する。
 * 既存の取り込み(shoken-webapp)と同じく、UTF-8として解釈できなければ Shift_JIS を使う。
 */

// "銘柄コード,数量,取得単価\n" の Shift_JIS 表現
const SHIFT_JIS_SAMPLE = new Uint8Array([
  0x96, 0xc1, 0x95, 0xbf, 0x83, 0x52, 0x81, 0x5b, 0x83, 0x68, 0x2c, 0x90, 0x94, 0x97, 0xca, 0x2c,
  0x8e, 0xe6, 0x93, 0xbe, 0x92, 0x50, 0x89, 0xbf, 0x0a,
])

describe('decodeCsvBytes', () => {
  it('UTF-8 のバイト列を文字列にする', () => {
    const bytes = new TextEncoder().encode('銘柄コード,数量\n')
    expect(decodeCsvBytes(bytes)).toBe('銘柄コード,数量\n')
  })

  it('UTF-8 として読めない場合は Shift_JIS として読む', () => {
    expect(decodeCsvBytes(SHIFT_JIS_SAMPLE)).toBe('銘柄コード,数量,取得単価\n')
  })

  it('空のバイト列は空文字になる', () => {
    expect(decodeCsvBytes(new Uint8Array())).toBe('')
  })
})
