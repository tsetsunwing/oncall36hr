import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Send } from 'lucide-react';
import { ui } from '@/i18n';
import {
  TEST_ACTION_ORDER,
  TEST_MENU_BUCKETS,
  TEST_MENU_SECTIONS,
  type ChatLineView,
  type ChatView,
  type GameActions,
  type GateCardView,
  type QuickChipCategory,
  type QuickChipView,
  type ReportBucket,
} from '@/view';
import { ChipPrompt } from './ChipPrompt';
import { GatePanel } from './GatePanel';

const MENTION_AT_END = /[@＠]([^\s@＠]*)$/u;
const CHIP_GROUPS: QuickChipCategory[] = ['observe', 'treat', 'tests', 'resus'];

export interface ChatPanelProps {
  chat: ChatView;
  notice: { kind: string; tone: 'info' | 'warn' | 'error' } | null;
  chips: QuickChipView[];
  gates?: GateCardView[];
  actions: GameActions;
}

function Line({ line }: { line: ChatLineView }) {
  const c = ui.game.chat;
  if (line.kind === 'SYSTEM') {
    const text = c.system[line.systemCode ?? ''] ?? '';
    return (
      <div className="chat-system" data-testid="chat-line" data-kind="SYSTEM">
        <time>{line.timeLabel}</time> {line.speakerName} {text}
      </div>
    );
  }
  const mine = line.kind === 'PLAYER';
  return (
    <div
      className={`chat-line chat-line--${line.kind.toLowerCase()}`}
      data-testid="chat-line"
      data-kind={line.kind}
    >
      <div className="chat-meta">
        <span className="chat-who">{mine ? c.you : line.speakerName}</span>
        {line.source === 'PHONE' ? <span className="chat-source">{c.phone}</span> : null}
        <time>{line.timeLabel}</time>
      </div>
      <p className="chat-text" lang={mine ? undefined : 'yue-Hant-HK'}>
        {line.text}
      </p>
    </div>
  );
}

function actionsIn(chips: readonly QuickChipView[], bucket: ReportBucket, section: string) {
  const order = TEST_ACTION_ORDER[section] ?? [];
  return chips
    .filter(
      (chip) =>
        chip.category === 'tests' &&
        chip.report?.bucket === bucket &&
        chip.report.section === section,
    )
    .sort((a, b) => {
      const ai = order.indexOf(a.catalogId ?? '');
      const bi = order.indexOf(b.catalogId ?? '');
      return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
    });
}

function ChipMenus({
  chips,
  onPick,
  onPrompt,
}: {
  chips: QuickChipView[];
  onPick: (text: string) => void;
  onPrompt: (chip: QuickChipView) => void;
}) {
  const c = ui.game.chat;
  const r = ui.game.reports;
  const [open, setOpen] = useState<QuickChipCategory | null>(null);
  const [bucket, setBucket] = useState<ReportBucket | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(null);
    setBucket(null);
    setSection(null);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sections = bucket ? TEST_MENU_SECTIONS[bucket] : [];
  const actions = bucket && section ? actionsIn(chips, bucket, section) : [];

  return (
    <div className="chips" role="group" aria-label={c.quickGroup} ref={rootRef}>
      {CHIP_GROUPS.map((category) => {
        const items = chips.filter((chip) => chip.category === category);
        if (items.length === 0) return null;
        const label = c.chipGroup[category] ?? category;
        const shown = open === category;
        return (
          <div key={category} className="chip-group">
            <button
              type="button"
              className="chip chip-category"
              aria-expanded={shown}
              aria-controls={`chip-menu-${category}`}
              onClick={() => {
                if (shown) close();
                else {
                  setOpen(category);
                  setBucket(null);
                  setSection(null);
                }
              }}
            >
              {label}
            </button>
            {shown && category !== 'tests' ? (
              <div
                id={`chip-menu-${category}`}
                className="chip-menu"
                role="menu"
                aria-label={label}
              >
                {items.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    role="menuitem"
                    className="chip"
                    onClick={() => {
                      if (chip.prompt) onPrompt(chip);
                      else onPick(chip.text);
                      close();
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {open === 'tests' ? (
        <div id="chip-menu-tests" className="chip-menu chip-menu--tests" data-testid="test-menu">
          <div
            className="chip-col"
            role="menu"
            aria-label={r.filtersLabel}
            data-testid="test-col-bucket"
          >
            {TEST_MENU_BUCKETS.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                className="chip"
                aria-checked={bucket === id}
                data-testid={`test-bucket-${id}`}
                onClick={() => {
                  setBucket(id);
                  setSection(null);
                }}
              >
                {r.bucket[id]}
              </button>
            ))}
          </div>
          {bucket ? (
            <div
              className="chip-col"
              role="menu"
              aria-label={r.sectionsLabel}
              data-testid="test-col-section"
            >
              {sections.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  className="chip"
                  aria-checked={section === id}
                  data-testid={`test-section-${id}`}
                  onClick={() => {
                    setSection(id);
                  }}
                >
                  {r.section[id] ?? id}
                </button>
              ))}
            </div>
          ) : null}
          {bucket && section ? (
            <div
              className="chip-col"
              role="menu"
              aria-label={r.section[section]}
              data-testid="test-col-action"
            >
              {actions.length > 0 ? (
                actions.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    role="menuitem"
                    className="chip"
                    data-testid={`test-action-${chip.id}`}
                    onClick={() => {
                      if (chip.prompt) onPrompt(chip);
                      else onPick(chip.text);
                      close();
                    }}
                  >
                    {chip.label}
                  </button>
                ))
              ) : (
                <p className="chip-empty" data-testid="test-empty">
                  {c.testsEmpty}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({ chat, chips, gates = [], notice, actions }: ChatPanelProps) {
  const c = ui.game.chat;
  const [text, setText] = useState('');
  const [promptChip, setPromptChip] = useState<QuickChipView | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const mention = MENTION_AT_END.exec(text);
  const query = (mention?.[1] ?? '').toLowerCase();
  const options = useMemo(
    () =>
      mention
        ? chat.present.filter((p) => p.mentionName.toLowerCase().includes(query) || query === '')
        : [],
    [chat.present, mention, query],
  );
  const open = mention !== null && options.length > 0 && !dismissed;
  const typing = chat.present.filter((p) => p.typing);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.lines.length, typing.length]);

  function choose(index: number) {
    const option = options[index];
    if (!option || !mention) return;
    setText(`${text.slice(0, text.length - mention[0].length)}@${option.mentionName} `);
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((active + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((active - 1 + options.length) % options.length);
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  }

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    actions.submitChat(chat.patientId, trimmed);
    setText('');
    setActive(0);
    setDismissed(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(text);
  }

  return (
    <section className="chat" aria-labelledby="chat-heading" data-testid="chat">
      <header className="chat-head">
        <h2 id="chat-heading">{c.heading}</h2>
        <ul className="present" aria-label={c.presentLabel}>
          {chat.present.map((p) => (
            <li key={p.id} className="present-chip" data-kind={p.kind}>
              {p.name}
            </li>
          ))}
        </ul>
      </header>

      {/* 可捲動區域需要鍵盤可聚焦（axe: scrollable-region-focusable） */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={logRef} className="chat-log" role="log" aria-label={c.logLabel} tabIndex={0}>
        <ol className="chat-list">
          {chat.lines.length === 0 ? <li className="chat-empty">{c.empty}</li> : null}
          {chat.lines.map((line, index) => (
            <li key={line.id} className="chat-item">
              {chat.lastLeftDividerIndex === index ? (
                <div className="chat-divider" role="separator">
                  {c.lastLeft}
                </div>
              ) : null}
              <Line line={line} />
            </li>
          ))}
          {typing.map((p) => (
            <li key={`typing-${p.id}`} className="chat-typing" data-testid="typing">
              {c.typing(p.name)}
            </li>
          ))}
        </ol>
      </div>

      <GatePanel gates={gates} actions={actions} />

      <p className="chat-notice" role="status" data-testid="chat-notice">
        {notice ? (ui.game.notice[notice.kind] ?? ui.game.notice.fallback) : ''}
      </p>

      <form className="chat-form" onSubmit={onSubmit}>
        <div className="chat-input-wrap">
          <label htmlFor="chat-input" className="visually-hidden">
            {c.inputLabel}
          </label>
          <input
            id="chat-input"
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${listId}-${String(active)}` : undefined}
            autoComplete="off"
            value={text}
            maxLength={chat.playerTextMaxChars}
            placeholder={c.placeholder}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={c.mentionHeading}
            className="mentions"
            hidden={!open}
          >
            {options.map((p, index) => (
              <li
                key={p.id}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === active}
                className="mention-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(index);
                }}
              >
                @{p.mentionName}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="submit"
          className="btn btn-primary icon-btn"
          disabled={text.trim().length === 0}
          aria-label={c.send}
          title={c.send}
        >
          <Send size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </form>
      <div className="chip-prompt-anchor">
        {promptChip?.prompt ? (
          <ChipPrompt
            chip={promptChip}
            onSubmit={submit}
            onClose={() => {
              setPromptChip(null);
            }}
          />
        ) : null}
        <ChipMenus
          chips={chips}
          onPick={submit}
          onPrompt={(chip) => {
            setPromptChip(chip);
          }}
        />
      </div>
    </section>
  );
}
