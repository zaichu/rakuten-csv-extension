import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDownloadCapture,
  isCapturableDownloadUrl,
  isHtmlContent,
  isRakutenDownloadSource,
  MAX_CSV_FILE_SIZE,
  readDownloadedCsv,
  toFileUrl,
  validateDownloadedCsv,
  waitForCompletedDownload,
  type DownloadedFileReader,
} from './downloadedFile'

/**
 * ダウンロードされたファイルの捕捉・検査・読み取りの挙動を固定する。
 * 取り違え防止(対象タブ以外からの通知)、検査(ダウンロード元・拡張子・サイズ)、
 * 読み取り(成功・HTML・読めない)、削除の成否、ファイルアクセス不可の返却を検証する。
 */

const TARGET_TAB_ID = 42
const OTHER_TAB_ID = 99
const DOWNLOAD_ID = 7

function createDownloadItem(overrides: Partial<chrome.downloads.DownloadItem> = {}): chrome.downloads.DownloadItem {
  return {
    id: DOWNLOAD_ID,
    url: 'https://www.rakuten-sec.co.jp/web/csv/assetbalance.csv',
    finalUrl: 'https://www.rakuten-sec.co.jp/web/csv/assetbalance.csv',
    filename: '/home/user/Downloads/rakuten_assetbalance.csv',
    fileSize: 128,
    state: 'complete',
    ...overrides,
  } as chrome.downloads.DownloadItem
}

function fireDownloadCreated(item: { id: number; url: string }): void {
  const addListener = chrome.downloads.onCreated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (created: chrome.downloads.DownloadItem) => void
    listener(item as unknown as chrome.downloads.DownloadItem)
  }
}

function fireDownloadChanged(delta: chrome.downloads.DownloadDelta): void {
  const addListener = chrome.downloads.onChanged.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (changed: chrome.downloads.DownloadDelta) => void
    listener(delta)
  }
}

type DownloadsSearchImpl = (query: { id?: number }) => Promise<chrome.downloads.DownloadItem[]>

function setDownloadsSearchImpl(item?: chrome.downloads.DownloadItem): void {
  const mock = chrome.downloads.search as unknown as {
    mockImplementation: (fn: DownloadsSearchImpl) => void
  }
  mock.mockImplementation(async (query) => {
    if (!item || (query.id !== undefined && query.id !== item.id)) {
      return []
    }
    return [item]
  })
}

type FileReaderStub = DownloadedFileReader & {
  readonly read: ReturnType<typeof vi.fn>
  readonly removeFile: ReturnType<typeof vi.fn>
  readonly eraseHistory: ReturnType<typeof vi.fn>
}

function createFileReader(
  options: {
    readonly fileAccessAllowed?: boolean
    readonly content?: Uint8Array
    readonly readError?: Error
    readonly removeFileResult?: boolean
  } = {}
): FileReaderStub {
  const content = options.content ?? new TextEncoder().encode('銘柄コード,数量\n')
  const read = vi.fn(async () => {
    if (options.readError) {
      throw options.readError
    }
    return content
  })
  const removeFile = vi.fn(async () => options.removeFileResult ?? true)
  const eraseHistory = vi.fn(async () => undefined)

  return {
    isFileAccessAllowed: vi.fn(async () => options.fileAccessAllowed ?? true),
    read,
    removeFile,
    eraseHistory,
  }
}

import { silenceConsole, resetTestDoubles } from '../tests/fixtures'
describe('downloadedFile', () => {
  beforeEach(() => {
    silenceConsole()
    setDownloadsSearchImpl()
  })

  afterEach(() => {
    resetTestDoubles()
  })

  describe('ダウンロード開始の待ち受け', () => {
    it('捕捉するダウンロードURLは楽天証券のドメインとblob/dataに限る', () => {
      expect(isCapturableDownloadUrl('https://www.rakuten-sec.co.jp/csv/a.csv')).toBe(true)
      expect(isCapturableDownloadUrl('https://member.rakuten-sec.co.jp/csv/a.csv')).toBe(true)
      expect(isCapturableDownloadUrl('blob:https://www.rakuten-sec.co.jp/1234')).toBe(true)
      expect(isCapturableDownloadUrl('data:text/csv;base64,aaaa')).toBe(true)
      expect(isCapturableDownloadUrl('https://example.com/a.csv')).toBe(false)
      expect(isCapturableDownloadUrl('https://rakuten-sec.co.jp.example.com/a.csv')).toBe(false)
      expect(isCapturableDownloadUrl('not a url')).toBe(false)
    })

    it('待ち受け開始後に始まったダウンロードのIDを捕捉する', async () => {
      const capture = createDownloadCapture(TARGET_TAB_ID, 50)
      capture.arm()

      fireDownloadCreated({ id: DOWNLOAD_ID, url: 'https://www.rakuten-sec.co.jp/csv/a.csv' })

      await expect(capture.downloadId).resolves.toBe(DOWNLOAD_ID)
    })

    it('待ち受け開始前のダウンロードは捕捉しない', async () => {
      const capture = createDownloadCapture(TARGET_TAB_ID, 30)

      fireDownloadCreated({ id: 1, url: 'https://www.rakuten-sec.co.jp/csv/other.csv' })
      capture.arm()

      await expect(capture.downloadId).resolves.toBeUndefined()
    })

    it('捕捉対象外のダウンロードは捕捉しない', async () => {
      const capture = createDownloadCapture(TARGET_TAB_ID, 30)
      capture.arm()

      fireDownloadCreated({ id: 1, url: 'https://example.com/other.csv' })

      await expect(capture.downloadId).resolves.toBeUndefined()
    })

    it('待ちを中断すると捕捉しない', async () => {
      const capture = createDownloadCapture(TARGET_TAB_ID, 30)
      capture.arm()
      capture.cancel()

      fireDownloadCreated({ id: DOWNLOAD_ID, url: 'https://www.rakuten-sec.co.jp/csv/a.csv' })

      await expect(capture.downloadId).resolves.toBeUndefined()
    })
  })

  describe('ダウンロードの完了待ち', () => {
    it('完了イベントで内容を取得する', async () => {
      const item = createDownloadItem()
      setDownloadsSearchImpl(item)

      const pending = waitForCompletedDownload(DOWNLOAD_ID, 1000)
      fireDownloadChanged({ id: DOWNLOAD_ID, state: { current: 'complete' } })

      await expect(pending).resolves.toEqual(item)
    })

    it('対象以外のダウンロードの完了イベントは無視する', async () => {
      const pending = waitForCompletedDownload(DOWNLOAD_ID, 30)

      fireDownloadChanged({ id: OTHER_TAB_ID, state: { current: 'complete' } })

      await expect(pending).resolves.toBeUndefined()
    })

    it('待機中に完了していた場合は取得する', async () => {
      const item = createDownloadItem()
      setDownloadsSearchImpl(item)

      await expect(waitForCompletedDownload(DOWNLOAD_ID, 1000)).resolves.toEqual(item)
    })

    it('中断された場合は取得しない', async () => {
      const pending = waitForCompletedDownload(DOWNLOAD_ID, 1000)
      fireDownloadChanged({ id: DOWNLOAD_ID, state: { current: 'interrupted' } })

      await expect(pending).resolves.toBeUndefined()
    })

    it('完了イベントが届かなくても状態の定期確認で完了を拾う', async () => {
      vi.useFakeTimers()
      try {
        let searchCalls = 0
        const mock = chrome.downloads.search as unknown as {
          mockImplementation: (fn: DownloadsSearchImpl) => void
        }
        mock.mockImplementation(async () => {
          searchCalls += 1
          return searchCalls === 1
            ? [{ ...createDownloadItem(), state: 'in_progress' } as chrome.downloads.DownloadItem]
            : [createDownloadItem()]
        })

        const pending = waitForCompletedDownload(DOWNLOAD_ID, 5000)
        await vi.advanceTimersByTimeAsync(1000)

        await expect(pending).resolves.toEqual(createDownloadItem())
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('ダウンロード元の検査', () => {
    it('楽天証券のURLは対象にする', () => {
      expect(isRakutenDownloadSource('https://www.rakuten-sec.co.jp/csv/a.csv')).toBe(true)
      expect(isRakutenDownloadSource('https://rakuten-sec.co.jp/csv/a.csv')).toBe(true)
      expect(isRakutenDownloadSource('blob:https://www.rakuten-sec.co.jp/1234')).toBe(true)
    })

    it('楽天証券以外のURLは対象にする', () => {
      expect(isRakutenDownloadSource('https://example.com/a.csv')).toBe(false)
      expect(isRakutenDownloadSource('https://rakuten-sec.co.jp.example.com/a.csv')).toBe(false)
      expect(isRakutenDownloadSource('data:text/csv;base64,aaaa')).toBe(false)
      expect(isRakutenDownloadSource(undefined)).toBe(false)
    })
  })

  describe('保存先の検査', () => {
    it('楽天証券のCSVは読み込んでよい', () => {
      expect(validateDownloadedCsv(createDownloadItem())).toEqual({ ok: true })
    })

    it('ダウンロード元が楽天証券以外なら読み込まない', () => {
      const result = validateDownloadedCsv(
        createDownloadItem({
          url: 'https://example.com/a.csv',
          finalUrl: 'https://example.com/a.csv',
        })
      )
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('ダウンロード元が楽天証券のファイルではありません')
    })

    it('拡張子がCSVでなければ読み込まない', () => {
      const result = validateDownloadedCsv(createDownloadItem({ filename: '/home/user/Downloads/a.txt' }))
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('拡張子がCSVのファイルではありません')
    })

    it('空のファイルは読み込まない', () => {
      const result = validateDownloadedCsv(createDownloadItem({ fileSize: 0 }))
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('ファイルが空です')
    })

    it('サイズが上限を超えるファイルは読み込まない', () => {
      const result = validateDownloadedCsv(createDownloadItem({ fileSize: MAX_CSV_FILE_SIZE + 1 }))
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('ファイルが大きすぎます')
    })
  })

  describe('file URLの組み立て', () => {
    it('Unixのパスをfile URLにする', () => {
      expect(toFileUrl('/home/user/Downloads/a.csv')).toBe('file:///home/user/Downloads/a.csv')
    })

    it('Windowsのパスをfile URLにする', () => {
      expect(toFileUrl('C:\\Users\\user\\Downloads\\a.csv')).toBe('file:///C:/Users/user/Downloads/a.csv')
    })

    it('空白や特殊文字をエンコードする', () => {
      expect(toFileUrl('/home/user/Downloads/a b#c.csv')).toBe(
        'file:///home/user/Downloads/a%20b%23c.csv'
      )
    })
  })

  describe('HTMLの判別', () => {
    it('先頭が<ならHTMLとする', () => {
      expect(isHtmlContent('<html><body>ログイン</body></html>')).toBe(true)
      expect(isHtmlContent('\n<html>')).toBe(true)
    })

    it('CSVはHTMLではない', () => {
      expect(isHtmlContent('銘柄コード,数量\n')).toBe(false)
    })
  })

  describe('CSVの読み取り', () => {
    it('読み終えたらファイルを削除して本文を返す', async () => {
      const reader = createFileReader()
      const item = createDownloadItem()

      const result = await readDownloadedCsv(reader, item)

      expect(result).toEqual({ success: true, content: '銘柄コード,数量\n', fileRemoved: true })
      expect(reader.removeFile).toHaveBeenCalledWith(DOWNLOAD_ID)
      expect(reader.eraseHistory).toHaveBeenCalledWith(DOWNLOAD_ID)
    })

    it('Shift_JISのファイルも文字コードを判定して返す', async () => {
      const shiftJisBytes = new Uint8Array([
        0x96, 0xc1, 0x95, 0xbf, 0x83, 0x52, 0x81, 0x5b, 0x83, 0x68, 0x2c, 0x90, 0x94, 0x97, 0xca, 0x0a,
      ])
      const reader = createFileReader({ content: shiftJisBytes })

      const result = await readDownloadedCsv(reader, createDownloadItem())

      expect(result).toEqual({ success: true, content: '銘柄コード,数量\n', fileRemoved: true })
    })

    it('削除に失敗しても取得は成功として扱う', async () => {
      const reader = createFileReader({ removeFileResult: false })

      const result = await readDownloadedCsv(reader, createDownloadItem())

      expect(result).toEqual({ success: true, content: '銘柄コード,数量\n', fileRemoved: false })
    })

    it('HTMLの中身は失敗として扱う', async () => {
      const reader = createFileReader({
        content: new TextEncoder().encode('<html><body>ログイン</body></html>'),
      })

      const result = await readDownloadedCsv(reader, createDownloadItem())

      expect(result).toEqual({
        success: false,
        reason: 'CSVの代わりにHTMLが返されました（ログインが必要な可能性があります）',
      })
      expect(reader.removeFile).toHaveBeenCalledWith(DOWNLOAD_ID)
    })

    it('読めない場合は失敗として扱う', async () => {
      const reader = createFileReader({ readError: new Error('read failed') })

      const result = await readDownloadedCsv(reader, createDownloadItem())

      expect(result).toEqual({ success: false, reason: 'CSVファイルの読み取りに失敗しました' })
      expect(reader.removeFile).toHaveBeenCalledWith(DOWNLOAD_ID)
    })

    it('ファイルアクセスが許可されていなければ理由とコードを返す', async () => {
      const reader = createFileReader({ fileAccessAllowed: false })

      const result = await readDownloadedCsv(reader, createDownloadItem())

      expect(result).toEqual({
        success: false,
        reason: 'ファイルの URL へのアクセスが許可されていません',
        code: 'file-access-disabled',
      })
      expect(reader.read).not.toHaveBeenCalled()
      expect(reader.removeFile).toHaveBeenCalledWith(DOWNLOAD_ID)
    })

    it('検査を通らないファイルは読まない', async () => {
      const reader = createFileReader()

      const result = await readDownloadedCsv(
        reader,
        createDownloadItem({
          url: 'https://example.com/a.csv',
          finalUrl: 'https://example.com/a.csv',
        })
      )

      expect(result).toEqual({
        success: false,
        reason: 'ダウンロード元が楽天証券のファイルではありません',
      })
      expect(reader.read).not.toHaveBeenCalled()
      expect(reader.removeFile).not.toHaveBeenCalled()
    })
  })
})
