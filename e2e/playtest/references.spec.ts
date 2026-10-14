import { expect, test } from '@playwright/test';
import { designToJSONText } from '@/core/model/file';
import { STAGES } from '@/game/stages';
import { watchErrors } from '../helpers';
import * as h from './helpers';

/**
 * PLAY-2:全ステージの参考解(作者の解答)を、プレイヤーと同じ「JSON を読み込む」で設計に入れ、
 * 試走してクリアできること・到達時間のメダルが銀以上であることを確かめる回帰テスト。
 * sim は決定論なので、ブラウザの試走はヘッドレスの校正(pnpm calibrate)と同じ結果になるはず。
 * 結果の数値は、試走のあとに保存される進行(最高記録)から読む。
 * 実測(2026-10):全 10 ステージで 4 軸とも金、時間は校正表と同じ(1-1 1.79 秒 … 2-4 6.92 秒)。
 */

const GOOD = ['gold', 'silver'];

for (const stage of STAGES) {
  test(`参考解で ${stage.chapter}-${stage.order}(${stage.id})をクリアする`, async ({ page }) => {
    const w = watchErrors(page);
    // ほかのステージをクリア済みにして、このステージを開けるようにする(このステージの記録は空)
    await h.seedCleared(
      page,
      STAGES.filter((s) => s.id !== stage.id).map((s) => s.id),
    );
    await page.goto('/?dev=flow');
    await page.getByRole('button', { name: new RegExp(`${stage.chapter}-${stage.order}`) }).click();

    // 「JSON を読み込む」→ ファイル選択で参考解を渡す
    const reference = stage.reference!;
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'JSON を読み込む' }).click();
    await (
      await chooser
    ).setFiles({
      name: `${stage.id}.ashikumi.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(designToJSONText(reference)),
    });
    await expect(page.getByText(reference.name).first()).toBeVisible();
    await expect(h.dofBadge(page)).toContainText('自由度 1');

    // 試走 → 結果
    await page.getByRole('button', { name: '試走', exact: true }).click();
    await h.skipToResult(page);
    await expect(page.getByText('クリア!').first()).toBeVisible();

    const best = await page.evaluate(
      (id) => JSON.parse(localStorage.getItem('ashikumi/v1/progress') ?? '{}').best?.[id],
      stage.id,
    );
    expect(best?.cleared).toBe(true);
    expect(best.time).toBeLessThanOrEqual(stage.timeLimit);
    expect(GOOD, `time ${best.time}s → ${best.medals.time}`).toContain(best.medals.time);
    // 参考解はほかの軸(部品数・コスト・エネルギー)でもメダルに届く(校正の基準が外れていない)
    for (const axis of ['parts', 'cost', 'energy']) {
      expect(best.medals[axis], axis).not.toBeNull();
    }
    test.info().annotations.push({
      type: 'record',
      description: `${stage.id}: ${best.time.toFixed(2)}s time=${best.medals.time} parts=${best.medals.parts} cost=${best.medals.cost} energy=${best.medals.energy}`,
    });
    w.expectClean();
  });
}
