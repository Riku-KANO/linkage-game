import type { DesignDoc } from './types';
import type { DesignReadResult } from './migrate';
import {
  DESIGN_FILE_MIME,
  MAX_DESIGN_FILE_LENGTH,
  designFileName,
  designToJSONText,
  parseDesignFile,
} from './file';

/**
 * 設計ファイルのブラウザ側の小さな補助(Blob とリンクでダウンロード、input type=file で選択)。
 * 中身のロジックは file.ts(Node でテストする)。ここは単体テストしない。
 */

/** 設計を .ashikumi.json としてダウンロードさせる */
export function downloadDesign(design: DesignDoc): void {
  const text = designToJSONText(design, { savedAt: new Date().toISOString() });
  const url = URL.createObjectURL(new Blob([text], { type: DESIGN_FILE_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = designFileName(design);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // クリック直後に無効にすると一部のブラウザでダウンロードが始まらない
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File(ドラッグ&ドロップで受け取ったものなど)を設計として読む */
export async function readDesignFile(file: Blob): Promise<DesignReadResult> {
  // 文字数の上限は UTF-8 で最大 3 バイト/字として大まかにバイトに換算する
  if (file.size > MAX_DESIGN_FILE_LENGTH * 3) {
    return { ok: false, reason: 'corrupt', errors: ['ファイルが大きすぎます'] };
  }
  try {
    return parseDesignFile(await file.text());
  } catch {
    return { ok: false, reason: 'corrupt', errors: ['ファイルを読めません'] };
  }
}

/** ファイル選択ダイアログを開いて設計を読む。キャンセルされたら null */
export function pickDesignFile(): Promise<DesignReadResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.json,${DESIGN_FILE_MIME}`;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else void readDesignFile(file).then(resolve);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
