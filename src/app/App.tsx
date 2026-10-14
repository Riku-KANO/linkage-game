import { t } from '@/i18n';

/** ゲーム本体。工房(3D 空間)の中に全画面を置く。担当:scene → app 統合 */
export default function App() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <h1>{t('app.title')}</h1>
    </div>
  );
}
