import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { playSfx } from '@/audio/sfx';
import { t } from '@/i18n';
import { useReducedMotion } from '@/ui/mech';
import { cx, IconButton } from './common';
import { HudIcon, PartIcon, type HudIconName } from './icons';
import { MiniGear } from './MiniGear';
import {
  countdownLeft,
  noticeDuration,
  pauseCountdown,
  resumeCountdown,
  startCountdown,
  type Countdown,
  type HudNotice,
} from './notices';
import './hud.css';

export interface NoticeStackProps {
  /** 出している通知(古い順)。列は呼び出し側が持つ(pushNotice・dismissNotice) */
  notices: readonly HudNotice[];
  /** 時間が来た・閉じるを押した通知を列から外す */
  onDismiss: (id: string) => void;
  /** 解放とエラーの効果音(既定 true) */
  sound?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/** 消えるときの動きの長さ(ms)。CSS の hud-notice-out と合わせる */
export const NOTICE_EXIT_MS = 220;

const SEVERITY_ICON: Record<HudNotice['severity'], HudIconName> = {
  info: 'info',
  success: 'check',
  warn: 'warn',
  error: 'error',
};

/**
 * 通知の札の列(HUD-4)。時間が来ると自動で消え、マウスを乗せている間・フォーカスがある間は止まる。
 * 列は読み上げの領域(polite)で、エラーは role="alert"。章・部品の解放は真鍮の札に歯車が回って
 * 錠が外れる飾りつき。置き場所(右上など)は呼び出し側が決める。
 */
export function NoticeStack({
  notices,
  onDismiss,
  sound = true,
  reducedMotion,
  className,
}: NoticeStackProps) {
  const rm = useReducedMotion(reducedMotion);
  return (
    <section
      className={cx('hud-notices', rm && 'hud-rm', className)}
      aria-label={t('hud.notice.region')}
    >
      <ol className="hud-notices__list" aria-live="polite" aria-relevant="additions text">
        {notices.map((n) => (
          <NoticeCard key={n.id} notice={n} onDismiss={onDismiss} rm={rm} sound={sound} />
        ))}
      </ol>
    </section>
  );
}

function NoticeCard({
  notice,
  onDismiss,
  rm,
  sound,
}: {
  notice: HudNotice;
  onDismiss: (id: string) => void;
  rm: boolean;
  sound: boolean;
}) {
  const duration = noticeDuration(notice);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const countdown = useRef<Countdown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const gone = useRef(false);
  const latest = useRef({ onDismiss, rm, id: notice.id });
  useLayoutEffect(() => {
    latest.current = { onDismiss, rm, id: notice.id };
  });

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  const leave = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    clear();
    const { onDismiss: dismiss, rm: instant, id } = latest.current;
    if (instant) {
      dismiss(id);
      return;
    }
    setLeaving(true);
    timer.current = setTimeout(() => dismiss(id), NOTICE_EXIT_MS);
  }, []);

  const schedule = useCallback(() => {
    clear();
    const c = countdown.current;
    if (!c || c.startedAt === null || gone.current) return;
    timer.current = setTimeout(leave, countdownLeft(c, performance.now()));
  }, [leave]);

  // 表示した瞬間から数え始める
  useEffect(() => {
    gone.current = false;
    if (duration !== null) {
      countdown.current = startCountdown(duration, performance.now());
      if (hovered.current || focused.current)
        countdown.current = pauseCountdown(countdown.current, performance.now());
      schedule();
    }
    return clear;
  }, [duration, schedule]);

  // 解放は錠が外れる「カチッ」、エラーは控えめな警告音(1 回だけ)
  const played = useRef(false);
  useEffect(() => {
    if (played.current || !sound) return;
    played.current = true;
    if (notice.unlock) playSfx('snap');
    else if (notice.severity === 'error') playSfx('error', { volume: 0.5 });
  }, [sound, notice.unlock, notice.severity]);

  const updatePause = () => {
    const stop = hovered.current || focused.current;
    setPaused(stop);
    const c = countdown.current;
    if (!c || gone.current) return;
    const now = performance.now();
    countdown.current = stop ? pauseCountdown(c, now) : resumeCountdown(c, now);
    schedule();
  };

  const unlock = notice.unlock;
  const eyebrow = unlock
    ? `${t('hud.notice.unlock')} · ${t(`hud.notice.unlock.${unlock}`)}`
    : t(`hud.notice.severity.${notice.severity}`);

  return (
    <li
      className="hud-notice"
      data-severity={notice.severity}
      data-unlock={unlock}
      data-leaving={leaving || undefined}
      data-paused={paused || undefined}
      role={notice.severity === 'error' ? 'alert' : undefined}
      onPointerEnter={() => {
        hovered.current = true;
        updatePause();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        updatePause();
      }}
      onFocus={() => {
        focused.current = true;
        updatePause();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        focused.current = false;
        updatePause();
      }}
    >
      {unlock ? (
        <span className="hud-notice__medallion" aria-hidden>
          <MiniGear size={38} className="hud-notice__gear" />
          <span className="hud-notice__emblem">
            {notice.part ? (
              <PartIcon part={notice.part} size={18} />
            ) : (
              <HudIcon name="lock" size={17} />
            )}
          </span>
        </span>
      ) : (
        <span className="hud-notice__icon" aria-hidden>
          <HudIcon name={SEVERITY_ICON[notice.severity]} size={16} />
        </span>
      )}
      <span className="hud-notice__body">
        <span className="hud-notice__eyebrow">{eyebrow}</span>
        <span className="hud-notice__text">{t(notice.key, notice.params)}</span>
      </span>
      <IconButton
        icon="close"
        label={t('hud.notice.dismiss')}
        onClick={leave}
        className="hud-notice__close"
      />
      {duration !== null && !rm && (
        <i
          className="hud-notice__timer"
          aria-hidden
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </li>
  );
}
