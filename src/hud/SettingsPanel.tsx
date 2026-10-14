import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { t } from '@/i18n';
import { LinkagePanel, LinkButton, useReducedMotion } from '@/ui/mech';
import { cx, IconButton } from './common';
import { HudIcon } from './icons';
import './hud.css';

/** 設定パネルが扱う値(アプリの設定 AppSettings にミュートを足したもの) */
export interface HudSettings {
  /** 主音量 0..1 */
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
  lowPerf: boolean;
}

export interface SettingsPanelProps {
  settings: HudSettings;
  /** 値を変えた(変えた項目だけ) */
  onChange: (patch: Partial<HudSettings>) => void;
  /** OS の「視差効果を減らす」が有効(動きを減らすは常に効いている旨を添える) */
  osReducedMotion?: boolean;
  /** 設計を JSON ファイルに書き出す(U-03)。省略時はボタンを出さない */
  onExportDesign?: () => void;
  /** 選んだ JSON ファイルを読み込む(U-03)。省略時はボタンを出さない */
  onImportDesign?: (file: File) => void;
  /** 進行をリセットする(2 段階で確かめてから呼ぶ) */
  onResetProgress: () => void;
  /** 閉じる(Esc・閉じるボタン)。省略時は閉じるボタンを出さない */
  onClose?: () => void;
  /** クレジットに添える版(例:v0.1.0) */
  version?: string;
  /** 開いているか(伸縮リンクで開閉する)。既定 true */
  open?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/** 確かめの表示を自動で戻すまで(ms) */
export const RESET_CONFIRM_MS = 8000;

/**
 * 設定(HUD-3):音量・ミュート、動きを減らす・低性能モード、設計の書き出し・読み込み、
 * 進行のリセット(2 段階)、クレジット。値は props で受け取り、変更はコールバックで返す。
 * 切り替えは小さなレバーのスイッチ。工具箱の扉が開くのと同時に出す(T-08)。
 */
export function SettingsPanel({
  settings,
  onChange,
  osReducedMotion = false,
  onExportDesign,
  onImportDesign,
  onResetProgress,
  onClose,
  version = '',
  open = true,
  reducedMotion,
  className,
}: SettingsPanelProps) {
  const rm = useReducedMotion(reducedMotion);
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const volumePct = Math.round(clamp01(settings.volume) * 100);

  // 確かめに入ったら「やめる」にフォーカス(誤って消さない)。しばらく放っておけば戻す
  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => setConfirming(false), RESET_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const cancelReset = () => {
    setConfirming(false);
    // 確かめの行が消えるので、リセットのボタンへフォーカスを戻す
    requestAnimationFrameSafe(() => resetRef.current?.focus({ preventScroll: true }));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    if (confirming) {
      e.preventDefault();
      cancelReset();
    } else if (onClose) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <LinkagePanel
      className={cx('hud-settings', rm && 'hud-rm', className)}
      open={open}
      reducedMotion={rm}
      role="region"
      aria-label={t('hud.settings.region')}
      onKeyDown={onKey}
    >
      <header className="hud-settings__head">
        <h2 className="hud-settings__title">{t('hud.settings.title')}</h2>
        {onClose && <IconButton icon="close" label={t('hud.close')} onClick={onClose} />}
      </header>

      <Group title={t('hud.settings.sound')}>
        <div className="hud-row">
          <label className="hud-row__label" htmlFor={`${id}-vol`}>
            {t('hud.settings.volume')}
          </label>
          <input
            id={`${id}-vol`}
            className="hud-fader"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePct}
            data-muted={settings.muted || undefined}
            aria-valuetext={t('hud.settings.volumeValue', { value: volumePct })}
            style={{ '--hud-fill': `${volumePct}%` } as CSSProperties}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
          />
          <span className="hud-row__value">
            {t('hud.settings.volumeValue', { value: volumePct })}
          </span>
        </div>
        <div className="hud-row hud-row--switch">
          <span className="hud-row__label" id={`${id}-mute`}>
            <HudIcon name={settings.muted ? 'mute' : 'speaker'} size={15} />
            {t('hud.settings.mute')}
          </span>
          <Switch
            labelledBy={`${id}-mute`}
            checked={settings.muted}
            onChange={(v) => onChange({ muted: v })}
          />
        </div>
      </Group>

      <Group title={t('hud.settings.display')}>
        <div className="hud-row hud-row--desc">
          <span className="hud-row__label" id={`${id}-rm`}>
            {t('hud.settings.reducedMotion')}
          </span>
          <Switch
            labelledBy={`${id}-rm`}
            describedBy={`${id}-rm-desc`}
            checked={settings.reducedMotion || osReducedMotion}
            disabled={osReducedMotion}
            onChange={(v) => onChange({ reducedMotion: v })}
          />
          <p className="hud-row__desc" id={`${id}-rm-desc`}>
            {t(
              osReducedMotion ? 'hud.settings.reducedMotion.os' : 'hud.settings.reducedMotion.desc',
            )}
          </p>
        </div>
        <div className="hud-row hud-row--desc">
          <span className="hud-row__label" id={`${id}-lp`}>
            {t('hud.settings.lowPerf')}
          </span>
          <Switch
            labelledBy={`${id}-lp`}
            describedBy={`${id}-lp-desc`}
            checked={settings.lowPerf}
            onChange={(v) => onChange({ lowPerf: v })}
          />
          <p className="hud-row__desc" id={`${id}-lp-desc`}>
            {t('hud.settings.lowPerf.desc')}
          </p>
        </div>
      </Group>

      {(onExportDesign || onImportDesign) && (
        <Group title={t('hud.settings.data')}>
          <div className="hud-row hud-row--buttons">
            {onExportDesign && (
              <LinkButton size="sm" reducedMotion={rm} onClick={onExportDesign}>
                <HudIcon name="export" size={14} />
                {t('hud.settings.export')}
              </LinkButton>
            )}
            {onImportDesign && (
              <>
                <LinkButton
                  size="sm"
                  reducedMotion={rm}
                  aria-describedby={`${id}-file`}
                  onClick={() => fileRef.current?.click()}
                >
                  <HudIcon name="import" size={14} />
                  {t('hud.settings.import')}
                </LinkButton>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  tabIndex={-1}
                  data-testid="hud-import-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // 同じファイルを続けて選べるように空に戻す
                    e.target.value = '';
                    if (file) onImportDesign(file);
                  }}
                />
              </>
            )}
            <span className="hud-row__hint" id={`${id}-file`}>
              {t('hud.settings.fileHint')}
            </span>
          </div>
        </Group>
      )}

      <Group title={t('hud.settings.progress')}>
        <div className="hud-reset" data-confirming={confirming || undefined}>
          {confirming ? (
            <>
              <p className="hud-reset__warn" role="alert">
                <HudIcon name="warn" size={15} />
                {t('hud.settings.resetConfirm')}
              </p>
              <div className="hud-reset__buttons">
                <LinkButton ref={cancelRef} size="sm" reducedMotion={rm} onClick={cancelReset}>
                  {t('hud.settings.resetNo')}
                </LinkButton>
                <LinkButton
                  size="sm"
                  variant="primary"
                  className="hud-danger"
                  reducedMotion={rm}
                  onClick={() => {
                    setConfirming(false);
                    onResetProgress();
                  }}
                >
                  {t('hud.settings.resetYes')}
                </LinkButton>
              </div>
            </>
          ) : (
            <LinkButton
              ref={resetRef}
              size="sm"
              variant="quiet"
              reducedMotion={rm}
              onClick={() => setConfirming(true)}
            >
              <HudIcon name="reset" size={14} />
              {t('hud.settings.reset')}
            </LinkButton>
          )}
        </div>
      </Group>

      <p className="hud-credits">{t('hud.settings.credits', { version })}</p>
    </LinkagePanel>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="hud-group" aria-labelledby={id}>
      <h3 className="hud-group__title" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** レバーのスイッチ(role="switch")。オンで小さなレバーが右へ倒れる */
export function Switch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="hud-switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="hud-switch__lever" aria-hidden>
        <i />
      </span>
      <span className="hud-switch__text" aria-hidden>
        {t(checked ? 'hud.settings.on' : 'hud.settings.off')}
      </span>
    </button>
  );
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function requestAnimationFrameSafe(cb: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);
  else setTimeout(cb, 0);
}
