import { t } from '@/i18n';
import { Icon, type IconName } from './icons';
import { TOOL_KEYS, type ToolId } from './keyboard';

export const TOOLS: readonly ToolId[] = ['select', 'link', 'fixed', 'crank', 'foot', 'delete'];

const TOOL_ICONS: Record<ToolId, IconName> = {
  select: 'select',
  link: 'link',
  fixed: 'fixed',
  crank: 'crank',
  foot: 'foot',
  delete: 'delete',
};

export interface ToolbarProps {
  tool: ToolId;
  isEnabled: (tool: ToolId) => boolean;
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  hasSelection: boolean;
  isMac: boolean;
  onTool: (tool: ToolId) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPaste: () => void;
  onMirror: () => void;
  onDelete: () => void;
  onFit: () => void;
}

/** 道具と編集操作のボタン(ED-2, ED-7)。ボタンには対応するキーを添える */
export function Toolbar(p: ToolbarProps) {
  const mod = p.isMac ? '⌘' : 'Ctrl+';
  return (
    <div className="ed-toolbar" role="toolbar" aria-label={t('editor.toolbar')}>
      {!p.readOnly &&
        TOOLS.map((tool) => {
          const enabled = p.isEnabled(tool);
          const label = t(`editor.tool.${tool}`);
          return (
            <button
              key={tool}
              type="button"
              className="ed-btn"
              aria-pressed={p.tool === tool}
              disabled={!enabled}
              title={enabled ? `${label}(${TOOL_KEYS[tool]})` : t('editor.tool.disabled')}
              onClick={() => p.onTool(tool)}
            >
              <Icon name={TOOL_ICONS[tool]} />
              <span className="ed-btn-label">{label}</span>
              <span className="ed-kbd" aria-hidden="true">
                {TOOL_KEYS[tool]}
              </span>
            </button>
          );
        })}
      {!p.readOnly && <span className="ed-sep" aria-hidden="true" />}
      {!p.readOnly && (
        <>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            disabled={!p.canUndo}
            title={`${t('editor.action.undo')}(${mod}Z)`}
            aria-label={t('editor.action.undo')}
            onClick={p.onUndo}
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            disabled={!p.canRedo}
            title={`${t('editor.action.redo')}(${p.isMac ? '⇧⌘Z' : 'Ctrl+Y'})`}
            aria-label={t('editor.action.redo')}
            onClick={p.onRedo}
          >
            <Icon name="redo" />
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            disabled={!p.canPaste}
            title={`${t('editor.action.paste')}(${mod}V)`}
            aria-label={t('editor.action.paste')}
            onClick={p.onPaste}
          >
            <Icon name="paste" />
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            title={`${t('editor.action.mirror')}(M)`}
            aria-label={t('editor.action.mirror')}
            onClick={p.onMirror}
          >
            <Icon name="mirror" />
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            disabled={!p.hasSelection}
            title={`${t('editor.action.delete')}(Delete)`}
            aria-label={t('editor.action.delete')}
            onClick={p.onDelete}
          >
            <Icon name="trash" />
          </button>
          <span className="ed-sep" aria-hidden="true" />
        </>
      )}
      <button
        type="button"
        className="ed-btn ed-btn-icon"
        title={`${t('editor.action.fit')}(0)`}
        aria-label={t('editor.action.fit')}
        onClick={p.onFit}
      >
        <Icon name="fit" />
      </button>
    </div>
  );
}
