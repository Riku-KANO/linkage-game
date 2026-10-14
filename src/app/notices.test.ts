import { describe, expect, it } from 'vitest';
import { t } from '@/i18n';
import type { Notice } from './flow';
import { flowNoticeId, toHudNotice, visibleNotices } from './notices';

const n = (id: number, over: Partial<Notice> = {}): Notice => ({
  id,
  kind: 'save',
  severity: 'info',
  key: `k${id}`,
  ...over,
});

describe('toHudNotice', () => {
  it('copies the text and severity and stringifies the id', () => {
    const src = n(3, { severity: 'warn', key: 'model.save.quota', params: { a: 1 } });
    expect(toHudNotice(src)).toEqual({
      id: '3',
      key: 'model.save.quota',
      severity: 'warn',
      params: { a: 1 },
    });
    // 同じ通知には同じ札(React の再描画で作り直さない)
    expect(toHudNotice(src)).toBe(toHudNotice(src));
  });

  it('marks unlock notices with their kind and finds the part for the icon', () => {
    const chapter = n(1, {
      kind: 'unlock',
      severity: 'success',
      key: 'game.unlock.chapter',
      params: { chapter: 2, title: 'x' },
    });
    expect(toHudNotice(chapter).unlock).toBe('chapter');
    const part = n(2, {
      kind: 'unlock',
      severity: 'success',
      key: 'game.unlock.part',
      params: { part: t('game.part.crank') },
    });
    expect(toHudNotice(part)).toMatchObject({ unlock: 'part', part: 'crank' });
  });
});

describe('visibleNotices', () => {
  it('shows the newest ones up to the limit, oldest first', () => {
    const list = [1, 2, 3, 4, 5, 6].map((i) => n(i));
    expect(visibleNotices(list, 4).map((x) => x.id)).toEqual(['3', '4', '5', '6']);
  });

  it('always keeps errors (they stay until closed)', () => {
    const list = [n(1, { severity: 'error' }), n(2), n(3), n(4), n(5)];
    expect(visibleNotices(list, 3).map((x) => x.id)).toEqual(['1', '4', '5']);
  });
});

describe('flowNoticeId', () => {
  it('turns the card id back into the flow id', () => {
    expect(flowNoticeId('12')).toBe(12);
    expect(flowNoticeId('unlock3')).toBeNull();
  });
});
