import { t } from '@/i18n';
import { HudIcon } from '@/hud/icons';
import { LinkagePanel, LinkButton } from '@/ui/mech';
import { openSandboxDesign } from '../actions';
import { useApp } from '../store';
import './screens.css';

const back = () => useApp.getState().back();

/**
 * サンドボックスの画面(窓の外の荒野)。ホームのメニューからは直接設計画面へ移るので通常は通らないが、
 * 画面として来たとき(開発用の遷移など)のために、始めるボタンだけのパネルを置く。
 */
export function SandboxScreen() {
  return (
    <div className="app-dock app-dock--left">
      <LinkagePanel className="app-card" role="region" aria-label={t('home.sandbox.title')}>
        <header className="app-card__head">
          <h2 className="app-card__title">{t('home.sandbox.title')}</h2>
        </header>
        <p className="app-card__body">{t('home.sandbox.body')}</p>
        <div className="app-card__actions">
          <LinkButton size="sm" onClick={back}>
            <HudIcon name="back" size={13} />
            {t('common.back')}
          </LinkButton>
          <LinkButton size="sm" variant="primary" onClick={openSandboxDesign}>
            {t('home.sandbox.start')}
            <HudIcon name="next" size={13} />
          </LinkButton>
        </div>
      </LinkagePanel>
    </div>
  );
}
