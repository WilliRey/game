import { useState } from 'preact/hooks';
import { currentObjectives, questDef } from '@/systems/quests';
import { text } from '@/systems/story';
import { ScreenTabs } from '../components/Tabs';
import { useStore } from '../context';

type Tab = 'active' | 'done' | 'notes';

/** Active and completed quests (with the tracked objective) and every note you've read. */
export function Journal() {
  const store = useStore();
  const ctx = store.ctx;
  const s = store.state;
  const [tab, setTab] = useState<Tab>('active');
  const [noteId, setNoteId] = useState<string | null>(s.notesRead[s.notesRead.length - 1] ?? null);
  const quests = Object.values(s.quests);
  const active = quests
    .filter((q) => q.status === 'active')
    .sort(
      (a, b) =>
        (questDef(ctx, a.id)?.type === 'main' ? -1 : 0) - (questDef(ctx, b.id)?.type === 'main' ? -1 : 0),
    );
  const done = quests.filter((q) => q.status !== 'active');
  const note = noteId ? store.content.notes[noteId] : undefined;
  return (
    <div class="screen dim" data-screen="journal">
      <div class="panel" style={{ width: '960px', height: '600px' }}>
        <div class="panel-header">
          <ScreenTabs current="journal" />
          <button class="btn btn-small close-x" onClick={() => store.close('journal')}>
            ✕
          </button>
        </div>
        <div class="filter-row journal-tabs">
          <button class={`chip-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
            Active ({active.length})
          </button>
          <button class={`chip-btn ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
            Completed ({done.length})
          </button>
          <button class={`chip-btn ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
            Notes ({s.notesRead.length})
          </button>
        </div>
        <div class="panel-body journal-body">
          {tab === 'active' ? (
            active.length === 0 ? (
              <div class="dim-text empty-note">No active quests. Talk to people at the camp.</div>
            ) : (
              active.map((q) => {
                const def = questDef(ctx, q.id)!;
                const tracked = s.trackedQuest === q.id;
                return (
                  <div key={q.id} class={`quest-card ${tracked ? 'tracked' : ''}`} data-quest={q.id}>
                    <div class="quest-head">
                      <span class={`quest-type qt-${def.type}`}>{def.type}</span>
                      <span class="quest-name">{def.name}</span>
                      <button
                        class={`btn btn-small ${tracked ? 'btn-primary' : ''}`}
                        onClick={() => {
                          s.trackedQuest = q.id;
                          store.notify();
                        }}
                      >
                        {tracked ? 'Tracked' : 'Track'}
                      </button>
                    </div>
                    <div class="muted small">{text(ctx, def.description)}</div>
                    <div class="quest-stage">{text(ctx, def.stages[q.stage]?.text ?? '')}</div>
                    {currentObjectives(ctx, q.id).map((o) => (
                      <div key={o.ob.id} class={`obj-line ${o.done ? 'done' : ''}`}>
                        <span class="obj-box">{o.done ? '✓' : '•'}</span>
                        {o.ob.text}
                        {o.ob.count > 1 ? (
                          <span class="num muted">
                            {' '}
                            {Math.min(o.current, o.ob.count)}/{o.ob.count}
                          </span>
                        ) : null}
                        {o.ob.optional ? <span class="muted"> (optional)</span> : null}
                      </div>
                    ))}
                  </div>
                );
              })
            )
          ) : null}
          {tab === 'done'
            ? done.map((q) => {
                const def = questDef(ctx, q.id)!;
                const outcome = q.outcome && def.outcomes[q.outcome];
                return (
                  <div key={q.id} class="quest-card done">
                    <div class="quest-head">
                      <span class={`quest-type qt-${def.type}`}>{def.type}</span>
                      <span class="quest-name">{def.name}</span>
                      <span class={q.status === 'failed' ? 'bad small' : 'good small'}>
                        {q.status}
                        {q.completions > 1 ? ` ×${q.completions}` : ''}
                      </span>
                    </div>
                    <div class="muted small">{outcome ? outcome.text : text(ctx, def.description)}</div>
                  </div>
                );
              })
            : null}
          {tab === 'notes' ? (
            <div class="notes-split">
              <div class="notes-list">
                {s.notesRead.length === 0 ? (
                  <div class="dim-text empty-note">
                    No notes yet. Notes, letters and recordings you find are kept here.
                  </div>
                ) : null}
                {[...s.notesRead].reverse().map((id) => (
                  <div
                    key={id}
                    class={`item-row ${noteId === id ? 'selected' : ''}`}
                    onClick={() => setNoteId(id)}
                  >
                    {text(ctx, store.content.notes[id]?.title ?? id)}
                  </div>
                ))}
              </div>
              <div class="note-view">
                {note ? (
                  <>
                    <h3>{text(ctx, note.title)}</h3>
                    {text(ctx, note.body)
                      .split('\n')
                      .map((l, i) => (l ? <p key={i}>{l}</p> : null))}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
