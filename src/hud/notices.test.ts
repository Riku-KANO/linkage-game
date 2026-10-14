import { describe, expect, it } from 'vitest';
import { t } from '@/i18n';
import {
  countdownLeft,
  dismissNotice,
  loadFailNotice,
  NOTICE_DURATION,
  noticeDuration,
  pauseCountdown,
  pushNotice,
  resumeCountdown,
  saveFailNotice,
  startCountdown,
  unlockNotices,
  UNLOCK_DURATION,
  type HudNotice,
} from './notices';

const n = (id: string, over: Partial<HudNotice> = {}): HudNotice => ({
  id,
  key: `k.${id}`,
  severity: 'info',
  ...over,
});

describe('noticeDuration', () => {
  it('指定 > 解放 > 重さの既定。エラーは消えない(null)', () => {
    expect(noticeDuration(n('a'))).toBe(NOTICE_DURATION.info);
    expect(noticeDuration(n('a', { severity: 'warn' }))).toBe(NOTICE_DURATION.warn);
    expect(noticeDuration(n('a', { severity: 'error' }))).toBeNull();
    expect(noticeDuration(n('a', { severity: 'success', unlock: 'chapter' }))).toBe(
      UNLOCK_DURATION,
    );
    expect(noticeDuration(n('a', { severity: 'error', durationMs: 3000 }))).toBe(3000);
    expect(noticeDuration(n('a', { durationMs: null }))).toBeNull();
  });
});

describe('pushNotice / dismissNotice', () => {
  it('後ろに足す。同じ文言の通知は古い方を消して新しくする', () => {
    let list = pushNotice([], n('a'));
    list = pushNotice(list, n('b'));
    list = pushNotice(list, { ...n('c'), key: 'k.a' });
    expect(list.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('パラメータが違えば別の通知', () => {
    let list = pushNotice([], n('a', { params: { part: 'リンク' } }));
    list = pushNotice(list, { ...n('b', { params: { part: 'ピン' } }), key: 'k.a' });
    expect(list).toHaveLength(2);
  });

  it('上限を超えたら、エラー以外の古いものから消す', () => {
    let list: HudNotice[] = [];
    list = pushNotice(list, n('err', { severity: 'error' }), 3);
    list = pushNotice(list, n('a'), 3);
    list = pushNotice(list, n('b'), 3);
    list = pushNotice(list, n('c'), 3);
    expect(list.map((x) => x.id)).toEqual(['err', 'b', 'c']);
  });

  it('dismissNotice', () => {
    const list = [n('a'), n('b')];
    expect(dismissNotice(list, 'a').map((x) => x.id)).toEqual(['b']);
    expect(dismissNotice(list, 'zzz')).toBe(list);
  });
});

describe('カウントダウン(ホバー中は止める)', () => {
  it('止めている間は減らず、再開すると残りから減る', () => {
    let c = startCountdown(4000, 1000);
    expect(countdownLeft(c, 2000)).toBe(3000);
    c = pauseCountdown(c, 2500);
    expect(countdownLeft(c, 9000)).toBe(2500);
    c = pauseCountdown(c, 9500); // 二重に止めても変わらない
    expect(countdownLeft(c, 9500)).toBe(2500);
    c = resumeCountdown(c, 10000);
    expect(countdownLeft(c, 11000)).toBe(1500);
    expect(countdownLeft(c, 20000)).toBe(0);
    c = resumeCountdown(c, 11000); // 動いている間に再開しても変わらない
    expect(countdownLeft(c, 11000)).toBe(1500);
  });
});

describe('通知を作る補助', () => {
  it('解放:章・部品・機能(ステージは出さない:章の中の順番の解放は静かに)', () => {
    const list = unlockNotices({
      stages: ['c2-s1'],
      chapters: [2],
      parts: ['gear'],
      features: ['legArray'],
    });
    expect(list.map((x) => x.unlock)).toEqual(['chapter', 'part', 'feature']);
    expect(list.every((x) => x.severity === 'success')).toBe(true);
    expect(t(list[0]!.key, list[0]!.params)).toBe('第 2 章「段差を越える」が解放されました');
    expect(t(list[1]!.key, list[1]!.params)).toBe('新しい部品:ギア');
    expect(list[1]!.part).toBe('gear');
    expect(t(list[2]!.key, list[2]!.params)).toBe('新しい機能:脚列の複製');
    expect(new Set(list.map((x) => x.id)).size).toBe(3);
  });

  it('ステージだけの解放はステージの通知にする(任意)', () => {
    const list = unlockNotices(
      { stages: ['c1-s2'], chapters: [], parts: [], features: [] },
      { stages: true },
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.unlock).toBe('stage');
    expect(t(list[0]!.key, list[0]!.params)).toBe('新しいステージ「回らないクランク」');
  });

  it('読み込み・保存の失敗', () => {
    const load = loadFailNotice('corrupt');
    expect(load.severity).toBe('error');
    expect(load.key).toBe('model.load.corrupt');
    const save = saveFailNotice('quota');
    expect(save.severity).toBe('warn');
    expect(save.key).toBe('model.save.quota');
    expect(load.id).not.toBe(save.id);
  });
});
