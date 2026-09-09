/**
 * 楽天証券タブの状態管理
 *
 * backgroundService.ts から分離した責務のひとつ。
 * rakutenTabs / activeTabId / lastActiveTime の保持と更新だけを担い、
 * イベント配線やステップ実行とは完全に独立している。
 */

import type { ExtensionState } from '../types';

export class TabStateManager {
  private state: ExtensionState = {
    rakutenTabs: new Set<number>(),
    lastActiveTime: Date.now()
  };

  /**
   * 現在の状態を取得（デバッグ用）
   */
  getState(): ExtensionState {
    return { ...this.state };
  }

  /**
   * 楽天証券タブの登録有無を判定
   */
  hasRakutenTab(tabId: number): boolean {
    return this.state.rakutenTabs.has(tabId);
  }

  /**
   * アクティブタブIDを取得
   */
  getActiveTabId(): number | undefined {
    return this.state.activeTabId;
  }

  /**
   * 楽天証券タブを追加
   */
  addRakutenTab(tabId: number): void {
    this.state = {
      ...this.state,
      rakutenTabs: new Set([...this.state.rakutenTabs, tabId]),
      lastActiveTime: Date.now()
    };
  }

  /**
   * 楽天証券タブを削除
   */
  removeRakutenTab(tabId: number): void {
    const newRakutenTabs = new Set(this.state.rakutenTabs);
    newRakutenTabs.delete(tabId);

    this.state = {
      ...this.state,
      rakutenTabs: newRakutenTabs,
      activeTabId: this.state.activeTabId === tabId ? undefined : this.state.activeTabId,
      lastActiveTime: Date.now()
    };
  }

  /**
   * アクティブタブを設定
   */
  setActiveTab(tabId: number): void {
    this.state = {
      ...this.state,
      activeTabId: tabId,
      lastActiveTime: Date.now()
    };
  }
}
