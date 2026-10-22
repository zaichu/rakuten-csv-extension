/**
 * ダウンロードされたファイルの捕捉と読み取り
 *
 * 楽天証券のCSVはURLを再取得してもHTMLが返るため、ブラウザが保存した
 * ファイルを直接読む。読んだファイルは直ちに削除する。
 */

import { decodeCsvBytes } from '../utils';

/** 読み込むCSVの最大サイズ(20MB) */
export const MAX_CSV_FILE_SIZE = 20 * 1024 * 1024;

/** ファイルへのアクセスが許可されていないときの失敗コード */
export const FILE_ACCESS_DISABLED_CODE = 'file-access-disabled';

/**
 * ダウンロード開始の待ち受け
 */
export interface DownloadCapture {
  /** 取得対象のタブID */
  readonly tabId: number;
  /** 捕捉したダウンロードのID */
  readonly downloadId: Promise<number | undefined>;
  /** 待ち受けを開始する */
  readonly arm: () => void;
  /** 待ちを中断する */
  readonly cancel: () => void;
}

/**
 * ダウンロード開始を待ち、ダウンロードのIDを捕捉する
 *
 * クリック直前に待ち受けを開始しないことで、同時に別のダウンロードが
 * 始まっても取り違えないようにする
 */
export function createDownloadCapture(tabId: number, startTimeoutMs: number): DownloadCapture {
  let resolveDownloadId: (id: number | undefined) => void = () => {};
  const downloadId = new Promise<number | undefined>((resolve) => {
    resolveDownloadId = resolve;
  });
  let armed = false;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = (id: number | undefined): void => {
    if (finished) {
      return;
    }
    finished = true;
    if (armed) {
      chrome.downloads.onCreated.removeListener(listener);
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    resolveDownloadId(id);
  };

  const listener = (item: chrome.downloads.DownloadItem): void => {
    if (!isCapturableDownloadUrl(item.url)) {
      return;
    }
    finish(item.id);
  };

  return {
    tabId,
    downloadId,
    arm: () => {
      if (armed || finished) {
        return;
      }
      armed = true;
      chrome.downloads.onCreated.addListener(listener);
      timer = setTimeout(() => finish(undefined), startTimeoutMs);
    },
    cancel: () => finish(undefined),
  };
}

/**
 * 捕捉対象とするダウンロードURLか
 *
 * 楽天証券のドメインと、ページ内で生成されるblob/data URLを受け付ける
 */
export function isCapturableDownloadUrl(url: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return true;
  }
  return isRakutenDomainUrl(url);
}

function isRakutenDomainUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    return host === 'rakuten-sec.co.jp' || host.endsWith('.rakuten-sec.co.jp');
  } catch {
    return false;
  }
}

/**
 * ダウンロードの完了を待ち、その内容を取得する
 *
 * 完了イベントを取りこぼした場合に備えて、現在の状態も確認する
 */
export async function waitForCompletedDownload(
  downloadId: number,
  timeoutMs: number
): Promise<chrome.downloads.DownloadItem | undefined> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (item: chrome.downloads.DownloadItem | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.downloads.onChanged.removeListener(listener);
      clearTimeout(timer);
      resolve(item);
    };

    const listener = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== downloadId) {
        return;
      }
      const state = delta.state?.current;
      if (state === 'complete') {
        void findDownload(downloadId).then((item) => finish(item));
        return;
      }
      if (state === 'interrupted') {
        finish(undefined);
      }
    };

    chrome.downloads.onChanged.addListener(listener);

    // 待ち受けを始める前に完了していた場合があるので、現在の状態も確認する
    void findDownload(downloadId).then((item) => {
      if (item?.state === 'complete') {
        finish(item);
        return;
      }
      if (item?.state === 'interrupted') {
        finish(undefined);
      }
    });

    const timer = setTimeout(() => finish(undefined), timeoutMs);
  });
}

async function findDownload(downloadId: number): Promise<chrome.downloads.DownloadItem | undefined> {
  try {
    const items = await chrome.downloads.search({ id: downloadId });
    return items[0];
  } catch {
    return undefined;
  }
}

/**
 * ファイル読み取りの口
 *
 * 差し替え可能にして、単体テストでは実ファイルを扱わずに検証する
 */
export interface DownloadedFileReader {
  /** ファイルのURLへのアクセスが許可されているか */
  isFileAccessAllowed(): Promise<boolean>;
  /** ファイルを読み込む */
  read(path: string): Promise<Uint8Array>;
  /** ダウンロードしたファイルを削除する */
  removeFile(downloadId: number): Promise<boolean>;
  /** ダウンロード履歴を削除する */
  eraseHistory(downloadId: number): Promise<void>;
}

/**
 * chrome APIでファイルを読む実装
 */
export function createDownloadedFileReader(): DownloadedFileReader {
  return {
    isFileAccessAllowed: async () => {
      try {
        return await chrome.extension.isAllowedFileSchemeAccess();
      } catch {
        return false;
      }
    },
    read: async (path: string) => {
      const response = await fetch(toFileUrl(path));
      if (!response.ok) {
        throw new Error('ファイルを読み取れませんでした');
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    removeFile: async (downloadId: number) => {
      try {
        await chrome.downloads.removeFile(downloadId);
        return true;
      } catch {
        return false;
      }
    },
    eraseHistory: async (downloadId: number) => {
      try {
        await chrome.downloads.erase({ id: downloadId });
      } catch {
        // 履歴の削除に失敗しても取得は成功として扱う
      }
    },
  };
}

/**
 * ダウンロード元が楽天証券か
 *
 * blob URLは生成元のページ(楽天証券)宛てなので、その中身のURLで判定する
 */
export function isRakutenDownloadSource(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const target = url.startsWith('blob:') ? url.slice('blob:'.length) : url;
  try {
    const { hostname } = new URL(target);
    const host = hostname.toLowerCase();
    return host === 'rakuten-sec.co.jp' || host.endsWith('.rakuten-sec.co.jp');
  } catch {
    return false;
  }
}

/**
 * 絶対パスからfile URLを作る
 */
export function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').map((segment, index) => {
    // Windowsのドライブ文字はそのまま残す
    if (index === 0 && /^[a-zA-Z]:$/.test(segment)) {
      return segment;
    }
    return encodeURIComponent(segment);
  });
  return `file:///${segments.join('/')}`;
}

/**
 * 読み込んでよいダウンロードか
 */
export function validateDownloadedCsv(item: chrome.downloads.DownloadItem): { ok: boolean; reason?: string } {
  if (!isRakutenDownloadSource(item.url) && !isRakutenDownloadSource(item.finalUrl)) {
    return { ok: false, reason: 'ダウンロード元が楽天証券のファイルではありません' };
  }
  if (!item.filename.toLowerCase().endsWith('.csv')) {
    return { ok: false, reason: '拡張子がCSVのファイルではありません' };
  }
  if (item.fileSize === 0) {
    return { ok: false, reason: 'ファイルが空です' };
  }
  if (item.fileSize < 0) {
    return { ok: false, reason: 'ファイルサイズを判定できません' };
  }
  if (item.fileSize > MAX_CSV_FILE_SIZE) {
    return { ok: false, reason: 'ファイルが大きすぎます' };
  }
  return { ok: true };
}

/**
 * 中身がHTMLかどうか
 *
 * ログイン画面のHTMLをCSVとして返すと誤ったデータを取り込むため、判別する
 */
export function isHtmlContent(content: string): boolean {
  return content.trimStart().startsWith('<');
}

/**
 * ダウンロードされたCSVの読み取り結果
 */
export type ReadDownloadedCsvResult =
  | { readonly success: true; readonly content: string; readonly fileRemoved: boolean }
  | { readonly success: false; readonly reason: string; readonly code?: string };

/**
 * ダウンロードされたCSVを読み取る
 *
 * 検査(ダウンロード元・拡張子・サイズ)をすべて通ったファイルだけを読む。
 * 読み終えたらファイルを削除し、履歴からも消す。削除に失敗しても取得は
 * 成功として扱い、fileRemoved で結果を伝える。
 */
export async function readDownloadedCsv(
  reader: DownloadedFileReader,
  item: chrome.downloads.DownloadItem
): Promise<ReadDownloadedCsvResult> {
  const validation = validateDownloadedCsv(item);
  if (!validation.ok) {
    return { success: false, reason: validation.reason ?? 'CSVファイルを読み取れませんでした' };
  }

  if (!(await reader.isFileAccessAllowed())) {
    await removeDownloadedFile(reader, item.id);
    return {
      success: false,
      reason: 'ファイルの URL へのアクセスが許可されていません',
      code: FILE_ACCESS_DISABLED_CODE,
    };
  }

  let content: string;
  try {
    const bytes = await reader.read(item.filename);
    if (bytes.byteLength > MAX_CSV_FILE_SIZE) {
      await removeDownloadedFile(reader, item.id);
      return { success: false, reason: 'ファイルが大きすぎます' };
    }
    content = decodeCsvBytes(bytes);
  } catch {
    await removeDownloadedFile(reader, item.id);
    return { success: false, reason: 'CSVファイルの読み取りに失敗しました' };
  }

  if (isHtmlContent(content)) {
    await removeDownloadedFile(reader, item.id);
    return {
      success: false,
      reason: 'CSVの代わりにHTMLが返されました（ログインが必要な可能性があります）',
    };
  }

  const fileRemoved = await removeDownloadedFile(reader, item.id);
  return { success: true, content, fileRemoved };
}

/**
 * ダウンロードしたファイルを削除し、履歴も消す
 */
async function removeDownloadedFile(reader: DownloadedFileReader, downloadId: number): Promise<boolean> {
  const removed = await reader.removeFile(downloadId);
  await reader.eraseHistory(downloadId);
  return removed;
}
