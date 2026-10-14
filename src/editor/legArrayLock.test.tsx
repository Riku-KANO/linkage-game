// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MechanismEditor } from './MechanismEditor';
import { hasKey } from '@/i18n';

describe('leg array lock (chapter 1)', () => {
  afterEach(cleanup);
  it('disables the leg array inputs and explains why when legArray is false', () => {
    render(<MechanismEditor legArray={false} autoPlay={false} />);
    expect(hasKey('editor.legs.locked')).toBe(true);
    expect(screen.getByText('脚列の設定は章 2 で使えるようになります')).toBeTruthy();
    for (const label of ['組数', '位相差(°)', '間隔(cm)']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
  });
  it('allows editing by default', () => {
    render(<MechanismEditor autoPlay={false} />);
    expect((screen.getByLabelText('組数') as HTMLInputElement).disabled).toBe(false);
  });
});
