// 업데이트 설정 관리 유틸리티
import type { UpdateSettings } from '../types/updateSettings';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface ShouldCheckForUpdatesOptions {
  settings: Pick<
    UpdateSettings,
    | 'autoCheck'
    | 'checkInterval'
    | 'respectOfflineStatus'
    | 'lastPostponedAt'
    | 'lastCheckedAt'
    | 'postponeInterval'
  >;
  now?: number;
  online?: boolean;
}

export function shouldCheckForUpdates(options: ShouldCheckForUpdatesOptions): boolean {
  const { settings } = options;
  const now = options.now ?? Date.now();
  const online = options.online ?? navigator.onLine;

  // 자동 체크가 비활성화된 경우
  if (!settings.autoCheck) {
    return false;
  }

  // never로 설정된 경우
  if (settings.checkInterval === 'never') {
    return false;
  }

  // 오프라인 상태를 존중하는 설정이고 현재 오프라인인 경우
  if (settings.respectOfflineStatus && !online) {
    return false;
  }

  // 연기된 업데이트가 있는지 확인
  if (settings.lastPostponedAt) {
    const timeSincePostpone = now - settings.lastPostponedAt;
    if (timeSincePostpone < settings.postponeInterval) {
      return false; // 아직 연기 기간
    }
  }

  if (settings.checkInterval === 'daily' && settings.lastCheckedAt != null) {
    return now - settings.lastCheckedAt >= DAY_MS;
  }

  if (settings.checkInterval === 'weekly' && settings.lastCheckedAt != null) {
    return now - settings.lastCheckedAt >= WEEK_MS;
  }

  return true;
}
