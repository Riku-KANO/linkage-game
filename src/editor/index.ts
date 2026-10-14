/**
 * 機構エディタ(E-02〜E-08)の公開 API。
 * 他のモジュールは MechanismEditor と useEditor(設計の唯一の正)だけを使えばよい。
 */
export { MechanismEditor, type MechanismEditorProps } from './MechanismEditor';
export { useEditor, type EditorState } from './store';
export type { WorldRect, Camera } from './viewport';
export type { Selection, Clipboard, Locked } from './ops';
export type { ToolId } from './keyboard';
export { MotionEngine } from './motion';
