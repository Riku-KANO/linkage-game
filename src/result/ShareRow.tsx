import { useEffect, useRef, useState } from 'react';
import { copyShareUrl, type DesignDoc, type Ghost } from '@/core/model';
import type { RunResult } from '@/game/types';
import { t } from '@/i18n';
import { LinkButton } from '@/ui/mech';
import { toShareRun } from './compare';

type ShareState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'copied' }
  | { kind: 'manual'; url: string }
  | { kind: 'error' };

/** 「コピーしました」を出しておく時間(ms) */
const COPIED_MS = 2600;

export interface ShareRowProps {
  design: DesignDoc;
  result: RunResult;
  ghost?: Ghost;
  reducedMotion: boolean;
}

/**
 * 共有リンクのコピー(RS-3、U-02)。設計・記録・ゴーストを URL のフラグメントに入れて
 * クリップボードへ。コピーできないブラウザでは URL を選択できる欄に出す。
 * 状態の表示は同じ大きさの枠の中で切り替える(レイアウトがずれない)。
 */
export function ShareRow({ design, result, ghost, reducedMotion }: ShareRowProps) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.kind !== 'copied') return;
    const id = setTimeout(() => setState({ kind: 'idle' }), COPIED_MS);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (state.kind !== 'manual') return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [state]);

  const onCopy = async () => {
    setState({ kind: 'busy' });
    try {
      const r = await copyShareUrl({ design, run: toShareRun(result), ghost });
      setState(r.copied ? { kind: 'copied' } : { kind: 'manual', url: r.url });
    } catch {
      setState({ kind: 'error' });
    }
  };

  return (
    <div className="rs-share">
      <LinkButton
        size="sm"
        variant="secondary"
        reducedMotion={reducedMotion}
        onClick={onCopy}
        disabled={state.kind === 'busy'}
      >
        <LinkIcon />
        {t('result.share.copy')}
      </LinkButton>
      <div className="rs-share__status" role="status" data-kind={state.kind}>
        {state.kind === 'busy' && (
          <span className="rs-share__note">{t('result.share.copying')}</span>
        )}
        {state.kind === 'copied' && (
          <span className="rs-share__ok">
            <CheckIcon />
            {t('result.share.copied')}
          </span>
        )}
        {state.kind === 'error' && <span className="rs-share__err">{t('result.share.error')}</span>}
        {state.kind === 'manual' && (
          <label className="rs-share__manual">
            <span className="rs-share__note">{t('result.share.manual')}</span>
            <input
              ref={inputRef}
              className="rs-share__url"
              readOnly
              value={state.url}
              aria-label={t('result.share.urlLabel')}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="rs-icon">
      <path
        d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="rs-icon">
      <path
        d="M3 8.5l3.2 3L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
