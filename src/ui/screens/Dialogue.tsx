import { useEffect, useMemo, useState } from 'preact/hooks';
import { choices, choose, nodeText, startDialogue, type DialogueSession } from '@/systems/dialogue';
import { useStore } from '../context';

/** Branching conversation. Number keys pick choices. Stops the clock. */
export function Dialogue({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const ctx = store.ctx;
  const npcId = entry.props?.npcId as string | undefined;
  const dialogueId = entry.props?.dialogueId as string | undefined;
  const session = useMemo<DialogueSession | null>(
    () => startDialogue(ctx, { npcId, dialogueId }),
    [npcId, dialogueId],
  );
  const [, setTick] = useState(0);
  const close = () => store.close('dialogue');
  const pick = (index: number) => {
    if (!session) return close();
    const more = choose(ctx, session, index);
    if (!more) close();
    else setTick((t) => t + 1);
    store.notify();
  };
  const opts = session ? choices(ctx, session) : [];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) {
        e.preventDefault();
        const c = opts[n - 1]!;
        if (c.enabled) pick(c.index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!session) return null;
  const t = nodeText(ctx, session);
  const npc = npcId ? store.content.npcs[npcId] : undefined;
  return (
    <div class="screen dialogue-screen" data-screen="dialogue">
      <div class="dialogue-box">
        <div class="dialogue-speaker">
          <span class="speaker-dot" style={{ background: npc?.color ?? '#888' }} />
          {t.speaker}
          {npc?.role ? <span class="muted small"> · {npc.role}</span> : null}
        </div>
        <div class="dialogue-text">
          {t.text.split('\n').map((line, i) => (line ? <p key={i}>{line}</p> : null))}
        </div>
        <div class="dialogue-choices">
          {opts.map((c, i) => (
            <button
              key={`${session.nodeId}-${c.index}`}
              class="choice"
              data-choice={i}
              disabled={!c.enabled}
              onClick={() => pick(c.index)}
            >
              <span class="choice-num">{i + 1}</span>
              {c.text}
              {c.reason ? <span class="choice-req"> [{c.reason}]</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
