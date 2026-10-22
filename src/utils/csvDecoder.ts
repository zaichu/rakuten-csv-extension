/**
 * CSVバイト列の文字コード変換
 *
 * 既存の取り込み(shoken-webapp)と同じ規則で、UTF-8として解釈できない場合は
 * Shift_JIS として解釈する
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}
