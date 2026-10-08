import { useRef, useState } from 'preact/hooks';
import { DIFFICULTY_PRESETS } from '@/config/balance';
import { loadGame, saveBlocker, saveGame } from '@/systems/persistence';
import {
  MANUAL_SLOTS,
  SLOTS,
  SaveError,
  deleteSave,
  exportSave,
  importSave,
  listSaves,
  type SaveMeta,
  type SlotId,
} from '@/systems/save';
import { Modal } from '../components/Modal';
import { useStore } from '../context';
import { pushToast } from '../uiState';

const SLOT_NAME: Record<SlotId, string> = {
  auto: 'Autosave',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  slot3: 'Slot 3',
};

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

function played(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min played` : `${m} min played`;
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save slots: three manual slots and the autosave. Save, load, delete, export and import files. */
export function Saves({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const mode = entry.props?.mode === 'save' ? 'save' : 'load';
  const inGame = store.phase === 'playing';
  const [confirm, setConfirm] = useState<string | null>(null);
  const [importTo, setImportTo] = useState<SlotId | null>(null);
  const [, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setTick((n) => n + 1);
  const blocker = mode === 'save' && inGame ? saveBlocker(store.ctx) : null;
  const saves = listSaves();

  const ask = (key: string, fn: () => void) => {
    if (confirm === key) {
      setConfirm(null);
      fn();
    } else setConfirm(key);
  };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !importTo) return;
    try {
      importSave(store.content, await file.text(), importTo);
      pushToast(store, `Imported into ${SLOT_NAME[importTo]}.`, 'good');
    } catch (err) {
      pushToast(store, err instanceof SaveError ? err.message : `Import failed: ${String(err)}`, 'warn');
    }
    setImportTo(null);
    refresh();
  };

  const row = (slot: SlotId, meta: SaveMeta | null) => {
    const manual = MANUAL_SLOTS.includes(slot);
    return (
      <div class={`save-row ${meta ? '' : 'empty'}`} key={slot} data-slot={slot}>
        <div class="save-info">
          <div class="save-name">
            {SLOT_NAME[slot]}
            {meta ? <span class="muted small"> · {ago(meta.savedAt)}</span> : null}
          </div>
          {meta ? (
            <>
              <div>
                Day {meta.day} · {meta.clock} · {meta.location}
              </div>
              <div class="muted small">
                Level {meta.level} · {DIFFICULTY_PRESETS[meta.difficulty]?.label ?? meta.difficulty} ·{' '}
                {played(meta.playSeconds)}
                {meta.quest ? ` · ${meta.quest}` : ''}
              </div>
            </>
          ) : (
            <div class="muted">Empty</div>
          )}
        </div>
        <div class="save-actions">
          {mode === 'save' && manual ? (
            <button
              class={`btn btn-small ${confirm === `save:${slot}` ? 'btn-danger' : 'btn-primary'}`}
              data-action={`save-${slot}`}
              disabled={!!blocker}
              onClick={() =>
                (meta ? ask : (_k: string, fn: () => void) => fn())(`save:${slot}`, () => {
                  if (saveGame(store, slot)) refresh();
                })
              }
            >
              {confirm === `save:${slot}` ? 'Overwrite?' : meta ? 'Overwrite' : 'Save here'}
            </button>
          ) : null}
          {mode === 'load' && meta ? (
            <button
              class={`btn btn-small ${confirm === `load:${slot}` ? 'btn-danger' : 'btn-primary'}`}
              data-action={`load-${slot}`}
              onClick={() =>
                (inGame ? ask : (_k: string, fn: () => void) => fn())(`load:${slot}`, () => {
                  loadGame(store, slot);
                })
              }
            >
              {confirm === `load:${slot}` ? 'Lose unsaved progress?' : 'Load'}
            </button>
          ) : null}
          {meta ? (
            <button
              class="btn btn-small"
              title="Download this save as a file"
              onClick={() => {
                const f = exportSave(slot);
                if (f) download(f.filename, f.text);
              }}
            >
              Export
            </button>
          ) : null}
          {manual ? (
            <button
              class="btn btn-small"
              title="Load a save file into this slot"
              onClick={() => {
                setImportTo(slot);
                fileRef.current?.click();
              }}
            >
              Import
            </button>
          ) : null}
          {meta ? (
            <button
              class={`btn btn-small ${confirm === `del:${slot}` ? 'btn-danger' : ''}`}
              onClick={() =>
                ask(`del:${slot}`, () => {
                  deleteSave(slot);
                  refresh();
                })
              }
            >
              {confirm === `del:${slot}` ? 'Delete?' : 'Delete'}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Modal id="saves" title={mode === 'save' ? 'Save game' : 'Load game'} width={760}>
      {blocker ? <div class="warn-text save-blocker">{blocker}</div> : null}
      <div class="save-list">
        {SLOTS.map((slot) => row(slot, saves.find((x) => x.slot === slot)?.meta ?? null))}
      </div>
      <div class="muted small save-foot">
        Autosaves happen when you enter an area, at quest steps and when you sleep in the bunk. Saves live in
        this browser; export them to keep a copy.
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onFile}
      />
    </Modal>
  );
}
