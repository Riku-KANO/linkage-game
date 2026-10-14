import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/**
 * 開発用の入口切り替え。?dev=<name> で各モジュールのプレイグラウンドを開く。
 * 既定はゲーム本体(App)。プレイグラウンドは各担当がファイルを差し替える。
 */
const routes: Record<string, () => Promise<{ default: ComponentType }>> = {
  app: () => import('@/app/App'),
  editor: () => import('@/dev/EditorPlayground'),
  sim: () => import('@/dev/SimPlayground'),
  scene: () => import('@/dev/ScenePlayground'),
  testrun: () => import('@/dev/TestrunPlayground'),
  result: () => import('@/dev/ResultPlayground'),
};

const name = new URLSearchParams(location.search).get('dev') ?? 'app';
const Page = lazy(routes[name] ?? routes.app!);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
);
