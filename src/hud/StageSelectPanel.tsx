import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { playSfx } from '@/audio/sfx';
import { getStage, stageTextParams } from '@/game';
import type { Progress, StageId } from '@/game/types';
import { t } from '@/i18n';
import { LinkagePanel, LinkButton, useReducedMotion } from '@/ui/mech';
import { cx, IconButton, useControllable } from './common';
import { formatMeters, formatSeconds, goalDistance } from './format';
import { HudIcon } from './icons';
import { MedalPips } from './MedalPips';
import { MiniGear } from './MiniGear';
import { gridMove } from './nav';
import {
  buildStageSelect,
  nextPlayableStage,
  stageAriaLabel,
  stageNumber,
  type StageCell,
} from './stageSelect';
import './hud.css';

export interface StageSelectPanelProps {
  /** クリア状況(game の Progress) */
  progress: Progress;
  /** フォーカスしているステージ(制御)。省略時は内部で持ち、最初は「次」のステージ */
  focusedStageId?: StageId | null;
  /** フォーカスが移ったとき(3D のジオラマで機械をそこへ歩かせるのに使う) */
  onFocusStage?: (id: StageId) => void;
  /** ステージを始める(解放済みのステージで Enter・ダブルクリック・「遊ぶ」) */
  onSelectStage: (id: StageId) => void;
  /** 戻る(Esc・閉じるボタン)。省略時は閉じるボタンを出さない */
  onClose?: () => void;
  /** 開いているか(伸縮リンクで開閉する)。既定 true */
  open?: boolean;
  /** 開いたらフォーカスしているステージへキーボードのフォーカスを移す(既定 true) */
  autoFocus?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * ステージ選択(HUD-2)。章ごとにステージの札が並び、解放・クリア・軸ごとの最高メダルを示す。
 * 次に遊ぶステージは真鍮の縁で光る。矢印キーで札を移り、Enter で始め、Esc で戻る。
 * 下の欄にフォーカス中のステージの課題と最高記録を出す(高さは固定で、移ってもずれない)。
 */
export function StageSelectPanel({
  progress,
  focusedStageId,
  onFocusStage,
  onSelectStage,
  onClose,
  open = true,
  autoFocus = true,
  reducedMotion,
  className,
}: StageSelectPanelProps) {
  const rm = useReducedMotion(reducedMotion);
  const helpId = useId();
  const rows = useMemo(() => buildStageSelect(progress), [progress]);
  const playRows = rows.filter((r) => r.stages.length > 0);
  const soonRows = rows.filter((r) => r.stages.length === 0);
  const cells = playRows.flatMap((r) => r.stages);
  const fallback = nextPlayableStage(rows) ?? cells[0]?.id ?? null;
  const [focusedRaw, setFocused] = useControllable<StageId | null>(
    focusedStageId,
    fallback,
    undefined,
  );
  const focused = cells.find((c) => c.id === focusedRaw) ?? cells.find((c) => c.id === fallback);
  const tiles = useRef(new Map<StageId, HTMLButtonElement>());

  const moveTo = (id: StageId, focusDom = true) => {
    if (id !== focused?.id) {
      setFocused(id);
      onFocusStage?.(id);
    }
    if (focusDom) tiles.current.get(id)?.focus({ preventScroll: true });
  };

  const activate = (cell: StageCell) => {
    if (!cell.unlocked) {
      playSfx('error', { volume: 0.45 });
      const el = tiles.current.get(cell.id);
      if (el && !rm) {
        el.removeAttribute('data-shake');
        void el.offsetWidth;
        el.setAttribute('data-shake', '');
      }
      return;
    }
    onSelectStage(cell.id);
  };

  // 開いたら札にフォーカスを移す(キーボードですぐ選べる)
  useEffect(() => {
    if (!open || !autoFocus || !focused) return;
    tiles.current.get(focused.id)?.focus({ preventScroll: true });
    // 開いたときだけ(フォーカスの移動は moveTo が受け持つ)
  }, [open, autoFocus]);

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!focused) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(focused);
      return;
    }
    const row = playRows.findIndex((r) => r.chapter === focused.chapter);
    const col = playRows[row]?.stages.findIndex((s) => s.id === focused.id) ?? -1;
    if (row < 0 || col < 0) return;
    const next = gridMove(
      { row, col },
      e.key,
      playRows.map((r) => r.stages.length),
    );
    if (!next) return;
    e.preventDefault();
    const id = playRows[next.row]?.stages[next.col]?.id;
    if (id) moveTo(id);
  };

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && onClose) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <LinkagePanel
      className={cx('hud-select', rm && 'hud-rm', className)}
      open={open}
      reducedMotion={rm}
      role="region"
      aria-label={t('hud.stage.region')}
      onKeyDown={onPanelKey}
    >
      <header className="hud-select__head">
        <h2 className="hud-select__title">{t('hud.stage.title')}</h2>
        <p id={helpId} className="hud-select__help">
          {t('hud.stage.help')}
        </p>
        {onClose && <IconButton icon="close" label={t('hud.close')} onClick={onClose} />}
      </header>

      <div className="hud-select__grid" onKeyDown={onGridKey} aria-describedby={helpId}>
        {playRows.map((r) => {
          const headId = `${helpId}-c${r.chapter}`;
          return (
            <section
              key={r.chapter}
              className="hud-chapter"
              data-locked={!r.unlocked || undefined}
              role="group"
              aria-labelledby={headId}
            >
              <h3 id={headId} className="hud-chapter__head">
                <span className="hud-chapter__num">
                  {t('hud.stage.chapter', { chapter: r.chapter })}
                </span>{' '}
                <span className="hud-chapter__title">{t(r.titleKey)}</span>{' '}
                {r.cleared && (
                  <span className="hud-chapter__badge">
                    <HudIcon name="check" size={11} />
                    {t('hud.stage.chapterCleared')}
                  </span>
                )}
                {!r.unlocked && (
                  <span className="hud-chapter__locked">
                    <HudIcon name="lock" size={12} />
                    {t('hud.stage.chapterLocked')}
                  </span>
                )}
              </h3>
              <div className="hud-chapter__tiles">
                {r.stages.map((s) => (
                  <StageTile
                    key={s.id}
                    cell={s}
                    focused={s.id === focused?.id}
                    describedBy={s.id === focused?.id ? `${helpId}-desc` : undefined}
                    spin={!rm}
                    ref={(el) => {
                      if (el) tiles.current.set(s.id, el);
                      else tiles.current.delete(s.id);
                    }}
                    onClick={() => moveTo(s.id)}
                    onDoubleClick={() => activate(s)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {soonRows.length > 0 && (
        <ul className="hud-select__soon">
          {soonRows.map((r) => (
            <li key={r.chapter}>
              <span className="hud-chapter__num">
                {t('hud.stage.chapter', { chapter: r.chapter })}
              </span>
              <span>{t(r.titleKey)}</span>
              <em>{t('hud.stage.comingSoon')}</em>
            </li>
          ))}
        </ul>
      )}

      {focused && (
        <StageDetail
          cell={focused}
          descId={`${helpId}-desc`}
          rm={rm}
          onPlay={() => activate(focused)}
        />
      )}
    </LinkagePanel>
  );
}

function StageTile({
  cell,
  focused,
  describedBy,
  spin,
  ref,
  onClick,
  onDoubleClick,
}: {
  cell: StageCell;
  focused: boolean;
  describedBy?: string;
  spin: boolean;
  ref: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const state = !cell.unlocked
    ? 'locked'
    : cell.cleared
      ? 'cleared'
      : cell.isNext
        ? 'next'
        : 'open';
  return (
    <button
      ref={ref}
      type="button"
      className="hud-tile"
      data-state={state}
      data-focused={focused || undefined}
      tabIndex={focused ? 0 : -1}
      aria-label={stageAriaLabel(cell)}
      aria-describedby={describedBy}
      aria-disabled={!cell.unlocked || undefined}
      aria-current={focused ? 'true' : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="hud-tile__top" aria-hidden>
        <span className="hud-tag hud-tag--sm">{stageNumber(cell)}</span>
        {state === 'cleared' && (
          <span className="hud-tile__stamp">
            <HudIcon name="check" size={12} />
          </span>
        )}
        {state === 'locked' && (
          <span className="hud-tile__lock">
            <HudIcon name="lock" size={13} />
          </span>
        )}
      </span>
      <span className="hud-tile__title" aria-hidden>
        {t(cell.titleKey)}
      </span>
      <span className="hud-tile__foot" aria-hidden>
        {state === 'cleared' && <MedalPips medals={cell.medals} />}
        {state === 'next' && (
          <span className="hud-tile__next">
            <MiniGear spin={spin} size={12} />
            {t('hud.stage.next')}
          </span>
        )}
        {state === 'locked' && <span className="hud-tile__locked">{t('hud.stage.locked')}</span>}
      </span>
    </button>
  );
}

function StageDetail({
  cell,
  descId,
  rm,
  onPlay,
}: {
  cell: StageCell;
  descId: string;
  rm: boolean;
  onPlay: () => void;
}) {
  const stage = getStage(cell.id);
  if (!stage) return null;
  const best = cell.best;
  return (
    <section className="hud-detail">
      <div className="hud-detail__main">
        <h3 className="hud-detail__title">
          <span className="hud-tag">{stageNumber(cell)}</span>
          {t(cell.titleKey)}
        </h3>
        <p id={descId} className="hud-detail__desc">
          {t(cell.descKey, stageTextParams(stage))}
        </p>
        <p className="hud-detail__facts">
          <span>
            {t('hud.header.goal')}{' '}
            {t('hud.header.goalValue', { value: round1(goalDistance(stage)) })}
          </span>
          <span>
            {t('hud.header.timeLimit')} {t('hud.header.timeLimitValue', { value: stage.timeLimit })}
          </span>
          <span>
            {t('hud.header.budget')}{' '}
            {stage.budget === null ? t('hud.header.noBudget') : stage.budget}
          </span>
        </p>
        <p className="hud-detail__best">
          <span className="hud-detail__bestLabel">{t('hud.stage.best')}</span>
          {best?.cleared ? (
            <>
              <MedalPips medals={best.medals} size="md" />
              <span className="hud-detail__bestValues">
                {t('game.unit.time', { value: formatSeconds(best.time) })} ·{' '}
                {t('game.unit.parts', { value: best.parts })} · {t('game.axis.cost')}{' '}
                {Math.round(best.cost)} ·{' '}
                {t('game.unit.energy', { value: formatSeconds(best.energy) })}
              </span>
            </>
          ) : best ? (
            <span className="hud-detail__bestValues">
              {t('hud.stage.bestFailed', { value: formatMeters(Math.max(0, best.distance)) })}
            </span>
          ) : (
            <span className="hud-detail__bestValues hud-muted">{t('hud.stage.bestNone')}</span>
          )}
        </p>
      </div>
      <div className="hud-detail__action">
        <LinkButton
          variant={cell.unlocked ? 'primary' : 'secondary'}
          reducedMotion={rm}
          disabled={!cell.unlocked}
          onClick={onPlay}
        >
          {t(cell.cleared ? 'hud.stage.replay' : 'hud.stage.play')}
          <HudIcon name="next" size={13} />
        </LinkButton>
        {!cell.unlocked && (
          <span className="hud-detail__lockedHint">{t('hud.stage.lockedHint')}</span>
        )}
      </div>
    </section>
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;
