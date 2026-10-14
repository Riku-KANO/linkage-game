import { t } from '@/i18n';
import { HudIcon } from '@/hud/icons';
import { LinkagePanel, LinkButton } from '@/ui/mech';
import { useSession } from '../flow';
import { useApp } from '../store';
import './screens.css';

const back = () => useApp.getState().back();

/**
 * 機構図鑑(T-08 で棚へ寄った後)。中身(U-06)は MVP の外なので「準備中」の小さなパネルだけ。
 * 登録した数は進行(progress.zukan)から出す(MVP では 0 のまま)。
 */
export function ZukanScreen() {
  const count = useSession((s) => s.progress.zukan.length);
  return (
    <div className="app-dock app-dock--left">
      <LinkagePanel
        className="app-card"
        role="region"
        aria-label={t('home.zukan.title')}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          back();
        }}
      >
        <header className="app-card__head">
          <h2 className="app-card__title">{t('home.zukan.title')}</h2>
          <span className="app-card__tag">{t('home.zukan.soon')}</span>
        </header>
        <p className="app-card__body">{t('home.zukan.body')}</p>
        <p className="app-card__meta">{t('home.zukan.count', { count })}</p>
        <div className="app-card__actions">
          <LinkButton size="sm" onClick={back} autoFocus>
            <HudIcon name="back" size={13} />
            {t('common.back')}
          </LinkButton>
        </div>
      </LinkagePanel>
    </div>
  );
}
