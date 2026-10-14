import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('builds a four-bar from a blank sheet and it becomes DOF 1', async ({ page }) => {
  const w = watchErrors(page);
  await page.goto('/?dev=editor');
  await page.getByRole('combobox').first().selectOption('blank');
  await page.getByRole('button', { name: '読み直す' }).click();
  const svg = page.locator('svg.ed-svg');
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
  };
  const tool = (name: string) => page.getByRole('button', { name, exact: true }).click();
  await tool('リンク');
  // crank, coupler, rocker (real drags with intermediate pointer moves)
  await drag(at(200, 400), at(200, 340));
  await drag(at(200, 340), at(420, 280));
  await drag(at(420, 280), at(480, 400));
  await tool('固定点');
  await page.mouse.click(at(200, 400).x, at(200, 400).y);
  await page.mouse.click(at(480, 400).x, at(480, 400).y);
  await tool('クランク');
  await page.mouse.click(at(200, 370).x, at(200, 370).y);
  await expect(page.getByText('自由度 1・正常').first()).toBeVisible();
  w.expectClean();
});
