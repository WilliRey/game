import type { ComponentChildren } from 'preact';
import type { ScreenId } from '@/core/store';
import { useStore } from '../context';

/** Standard dimmed modal panel with a title bar and close button. */
export function Modal({
  id,
  title,
  width = 720,
  children,
  footer,
  closable = true,
  dim = true,
  extra,
}: {
  id: ScreenId;
  title: string;
  width?: number;
  children: ComponentChildren;
  footer?: ComponentChildren;
  closable?: boolean;
  dim?: boolean;
  extra?: ComponentChildren;
}) {
  const store = useStore();
  return (
    <div class={`screen ${dim ? 'dim' : ''}`} data-screen={id} onContextMenu={(e) => e.preventDefault()}>
      <div class="panel" style={{ width: `${width}px` }} role="dialog" aria-label={title}>
        <div class="panel-header">
          <h2>{title}</h2>
          {extra}
          {closable ? (
            <button class="btn btn-small close-x" title="Close (Esc)" onClick={() => store.close(id)}>
              ✕
            </button>
          ) : null}
        </div>
        <div class="panel-body">{children}</div>
        {footer ? <div class="panel-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
