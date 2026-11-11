import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Send } from 'lucide-react';
import { ui } from '@/i18n';
import {
  EMPTY_PLACED_PARAMS,
  RESUS_MENU,
  TEST_ACTION_ORDER,
  TEST_MENU_BUCKETS,
  TEST_MENU_SECTIONS,
  type ChatLineView,
  type ChatView,
  type GameActions,
  type GateCardView,
  type QuickChipCategory,
  type MedicationOption,
  type PlacedOrderParams,
  type QuickChipView,
  type ReportBucket,
} from '@/view';
import { CatheterOrders } from './CatheterOrders';
import { ChipPrompt } from './ChipPrompt';
import { DrugOrderForm } from './DrugOrderForm';
import { ContinuousFluidForm } from './ContinuousFluidForm';
import { GatePanel } from './GatePanel';
import { ObservePanel } from './ObservePanel';
import { OxygenOrderForm } from './OxygenOrderForm';

const MENTION_AT_END = /[@＠]([^\s@＠]*)$/u;
const MENTION_EDGE = /[\s@＠,，。.!！?？、:：]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** 與 engine parseMentions 對齊：@名字 之後要係空白或標點，先算已指定這位病人。 */
function mentionsKey(text: string, key: string): boolean {
  if (key.length === 0) return false;
  const pattern = new RegExp(`[@＠]${escapeRegExp(key)}(?=$|${MENTION_EDGE.source})`, 'iu');
  return pattern.test(text);
}

function medicationChoices(
  medications: readonly MedicationOption[],
  chip: QuickChipView,
): MedicationOption[] {
  const id = chip.medicationId;
  if (!id || medications.some((item) => item.id === id)) return [...medications];
  return [
    {
      id,
      label: chip.label,
      stem: chip.prompt?.stem ?? chip.label.toLowerCase(),
      catalogId: chip.catalogId ?? '',
    },
    ...medications,
  ];
}
const CHIP_GROUPS: QuickChipCategory[] = ['observe', 'treat', 'tests', 'resus'];

export interface ChatPanelProps {
  chat: ChatView;
  notice: { kind: string; tone: 'info' | 'warn' | 'error' } | null;
  chips: QuickChipView[];
  medications?: readonly MedicationOption[];
  treatmentMedications?: readonly MedicationOption[];
  gates?: GateCardView[];
  actions: GameActions;
}

function Line({ line }: { line: ChatLineView }) {
  const c = ui.game.chat;
  if (line.kind === 'SYSTEM') {
    if (line.systemCode) {
      const text = c.system[line.systemCode] ?? '';
      return (
        <div className="chat-system" data-testid="chat-line" data-kind="SYSTEM">
          <time>{line.timeLabel}</time> {line.speakerName} {text}
        </div>
      );
    }
    return (
      <div
        className="chat-system"
        data-testid="chat-line"
        data-kind="SYSTEM"
        data-source={line.source}
      >
        <time>{line.timeLabel}</time> <span lang="yue-Hant-HK">{line.text}</span>
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

function DrugOrderPopup({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const [mount] = useState(
    () => document.querySelector<HTMLElement>('[data-testid="play-frame"]') ?? document.body,
  );

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const root = layer;
    const previously =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function focusable(): HTMLElement[] {
      return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.classList.contains('drug-order-backdrop'),
      );
    }

    focusable()[0]?.focus();

    function onFocusIn(event: FocusEvent) {
      if (root.contains(event.target as Node)) return;
      focusable()[0]?.focus();
    }

    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusable();
      if (list.length === 0) {
        event.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKey, true);
      if (previously && document.contains(previously)) previously.focus();
    };
  }, []);

  return createPortal(
    <div className="drug-order-popup" ref={layerRef} data-testid="drug-order-popup">
      <button
        type="button"
        className="drug-order-backdrop"
        data-testid="drug-order-backdrop"
        aria-label={ui.game.log.close}
        tabIndex={-1}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          onClose();
        }}
      />
      {children}
    </div>,
    mount,
  );
}

function ChipMenus({
  chips,
  onPick,
  onPrompt,
  onDrug,
  onOxygen,
  onCatheters,
  onFluid,
  onObserve,
  onPickTests,
  suspended = false,
}: {
  chips: QuickChipView[];
  onPick: (chip: QuickChipView) => void;
  onPrompt: (chip: QuickChipView) => void;
  onDrug: (chip: QuickChipView) => void;
  onOxygen: () => void;
  onCatheters: () => void;
  onFluid: () => void;
  onObserve: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
  /** 抽血籃確認：一次落多張檢查單。 */
  onPickTests: (chips: QuickChipView[]) => void;
  /** 藥物視窗開啟時收起治療選單，並保持關閉。 */
  suspended?: boolean;
}) {
  const c = ui.game.chat;
  const r = ui.game.reports;
  const [open, setOpen] = useState<QuickChipCategory | null>(null);
  const [bucket, setBucket] = useState<ReportBucket | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [resusColumn, setResusColumn] = useState<string | null>(null);
  // 抽血籃：勾選的檢查。確認前唔會落單，所以唔入 engine state。
  const [basket, setBasket] = useState<QuickChipView[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  // 藥物／氧氣／導管視窗開啟時收起選單並保持關閉：用 render 期間比對上一個 prop 的寫法，
  // 不用 effect，避免 effect 內同步 setState 造成連環 render。
  const [wasSuspended, setWasSuspended] = useState(suspended);
  if (suspended !== wasSuspended) {
    setWasSuspended(suspended);
    if (suspended) {
      setOpen(null);
      setBucket(null);
      setSection(null);
      setResusColumn(null);
    }
  }

  function close() {
    setOpen(null);
    setBucket(null);
    setSection(null);
    setResusColumn(null);
  }

  function choose(chip: QuickChipView) {
    if (suspended) return;
    if (chip.medicationId) onDrug(chip);
    else if (chip.prompt) onPrompt(chip);
    else onPick(chip);
    close();
  }

  function toggleBasket(chip: QuickChipView) {
    if (suspended || !chip.catalogId) return;
    setBasket((current) =>
      current.some((item) => item.catalogId === chip.catalogId)
        ? current.filter((item) => item.catalogId !== chip.catalogId)
        : [...current, chip],
    );
  }

  function confirmBasket() {
    if (suspended || basket.length === 0) return;
    onPickTests(basket);
    setBasket([]);
    close();
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (open === 'observe') return;
      close();
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
        const pinned = category === 'treat' || category === 'observe';
        if (items.length === 0 && !pinned) return null;
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
                if (suspended) return;
                if (shown) close();
                else {
                  setOpen(category);
                  setBucket(null);
                  setSection(null);
                  setResusColumn(null);
                }
              }}
            >
              {label}
            </button>
            {shown && !suspended && category !== 'tests' && category !== 'resus' ? (
              <div
                id={`chip-menu-${category}`}
                className={category === 'observe' ? 'chip-menu chip-menu--panel' : 'chip-menu'}
                role={category === 'observe' ? 'group' : 'menu'}
                aria-label={label}
              >
                {category === 'treat' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="chip"
                    data-testid="treat-oxygen"
                    onClick={() => {
                      close();
                      onOxygen();
                    }}
                  >
                    {c.oxygen.title}
                  </button>
                ) : null}
                {category === 'treat' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="chip"
                    data-testid="treat-catheters"
                    onClick={() => {
                      close();
                      onCatheters();
                    }}
                  >
                    {c.catheters.title}
                  </button>
                ) : null}
                {category === 'treat' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="chip"
                    data-testid="treat-fluid"
                    onClick={() => {
                      close();
                      onFluid();
                    }}
                  >
                    持續輸液
                  </button>
                ) : null}
                {items.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    role="menuitem"
                    className="chip"
                    onClick={() => {
                      choose(chip);
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
                {category === 'treat' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="chip"
                    data-testid="treat-drug"
                    onClick={() => {
                      close();
                      onDrug({
                        id: 'treat.drug',
                        label: c.drugOrder.menu,
                        text: '',
                        category: 'treat',
                      });
                    }}
                  >
                    {c.drugOrder.menu}
                  </button>
                ) : null}
                {category === 'observe' ? (
                  <ObservePanel
                    onSubmit={(order) => {
                      onObserve(order);
                      close();
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {open === 'tests' && !suspended ? (
        <div id="chip-menu-tests" className="chip-menu chip-menu--tests" data-testid="test-menu">
          {bucket ? (
            <button
              type="button"
              className="chip chip-back"
              onClick={() => {
                if (section) setSection(null);
                else setBucket(null);
              }}
            >
              {c.menuBack}
            </button>
          ) : null}
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
                {r.menuBucket[id] ?? id}
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
                  {r.menuSection[id] ?? id}
                </button>
              ))}
            </div>
          ) : null}
          {bucket && section ? (
            <div
              className="chip-col"
              role="menu"
              aria-label={r.menuSection[section] ?? section}
              data-testid="test-col-action"
            >
              {actions.length > 0 ? (
                actions.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    role="menuitemcheckbox"
                    className="chip"
                    data-testid={`test-action-${chip.id}`}
                    aria-checked={
                      chip.catalogId
                        ? basket.some((item) => item.catalogId === chip.catalogId)
                        : false
                    }
                    onClick={() => {
                      toggleBasket(chip);
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
          {bucket && section ? (
            <div className="chip-col chip-basket" data-testid="test-basket">
              <p className="chip-basket-count" data-testid="test-basket-count">
                {basket.length === 0 ? c.basketEmpty : c.basketCount(basket.length)}
              </p>
              {basket.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="chip chip-basket-item"
                  data-testid={`test-basket-item-${chip.id}`}
                  onClick={() => {
                    toggleBasket(chip);
                  }}
                >
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                className="chip chip-primary"
                data-testid="test-basket-confirm"
                disabled={basket.length === 0}
                onClick={confirmBasket}
              >
                {c.basketConfirm(basket.length)}
              </button>
              {basket.length > 0 ? (
                <button
                  type="button"
                  className="chip"
                  data-testid="test-basket-clear"
                  onClick={() => {
                    setBasket([]);
                  }}
                >
                  {c.basketClear}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {open === 'resus' && !suspended ? (
        <div
          id="chip-menu-resus"
          className="chip-menu chip-menu--tests chip-menu--resus"
          data-testid="resus-menu"
        >
          {resusColumn ? (
            <button
              type="button"
              className="chip chip-back"
              onClick={() => {
                setResusColumn(null);
              }}
            >
              {c.menuBack}
            </button>
          ) : null}
          <div
            className="chip-col"
            role="menu"
            aria-label={c.chipGroup.resus}
            data-testid="resus-col-group"
          >
            {RESUS_MENU.map((column) => (
              <button
                key={column.id}
                type="button"
                role="menuitemradio"
                className="chip"
                aria-checked={resusColumn === column.id}
                data-testid={`resus-group-${column.id}`}
                onClick={() => {
                  setResusColumn(column.id);
                }}
              >
                {column.label}
              </button>
            ))}
          </div>
          {resusColumn ? (
            <div
              className="chip-col"
              role="menu"
              aria-label={RESUS_MENU.find((column) => column.id === resusColumn)?.label}
              data-testid="resus-col-action"
            >
              {(RESUS_MENU.find((column) => column.id === resusColumn)?.items ?? []).flatMap(
                (item) => {
                  const chip = chips.find((candidate) => candidate.id === item.id);
                  if (!chip) return [];
                  return [
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="chip"
                      data-testid={`resus-action-${item.id}`}
                      onClick={() => {
                        choose(chip);
                      }}
                    >
                      {item.label}
                    </button>,
                  ];
                },
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  chat,
  chips,
  medications = [],
  treatmentMedications = [],
  gates = [],
  notice,
  actions,
}: ChatPanelProps) {
  const c = ui.game.chat;
  const [text, setText] = useState('');
  const [addresseeId, setAddresseeId] = useState<string | null>(null);
  const [promptChip, setPromptChip] = useState<QuickChipView | null>(null);
  const [drugChip, setDrugChip] = useState<QuickChipView | null>(null);
  const [oxygenOpen, setOxygenOpen] = useState(false);
  const [catheterOpen, setCatheterOpen] = useState(false);
  const [fluidOpen, setFluidOpen] = useState(false);
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
  const addressee =
    chat.present.find((person) => person.kind === 'PATIENT' && person.id === addresseeId) ?? null;

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

  function textForSend(value: string): string {
    const trimmed = value.trim();
    if (!addressee) return trimmed;
    if (mentionsKey(trimmed, addressee.mentionName) || mentionsKey(trimmed, '病人')) return trimmed;
    const prefixed = `@${addressee.mentionName} ${trimmed}`;
    if (prefixed.length <= chat.playerTextMaxChars) return prefixed;
    return prefixed.slice(0, chat.playerTextMaxChars).trim();
  }

  function submit(value: string) {
    const spoken = textForSend(value);
    if (spoken.length === 0) return;
    actions.submitChat(chat.patientId, spoken);
    setText('');
    setActive(0);
    setDismissed(false);
  }

  function placeChip(chip: QuickChipView) {
    if (!chip.catalogId) return;
    actions.placeOrder(chat.patientId, chip.catalogId, chip.label, EMPTY_PLACED_PARAMS);
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
          {chat.present.map((p) => {
            const selected = p.kind === 'PATIENT' && p.id === addresseeId;
            return (
              <li
                key={p.id}
                className="present-chip"
                data-kind={p.kind}
                data-selected={selected ? 'true' : undefined}
              >
                {p.kind === 'PATIENT' ? (
                  <button
                    type="button"
                    className="present-chip-hit"
                    aria-pressed={selected}
                    aria-label={selected ? c.stopAddressing(p.name) : c.addressPatient(p.name)}
                    onClick={() => {
                      setAddresseeId(selected ? null : p.id);
                      inputRef.current?.focus();
                    }}
                  >
                    {p.name}
                  </button>
                ) : (
                  p.name
                )}
              </li>
            );
          })}
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

      {addressee ? (
        <p className="chat-addressee" data-testid="chat-addressee">
          {c.addressing(addressee.name)}
        </p>
      ) : null}

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
            placeholder={addressee ? c.addressPlaceholder(addressee.name) : c.placeholder}
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
            onSubmit={(text, params) => {
              if (!promptChip.catalogId) return;
              actions.placeOrder(chat.patientId, promptChip.catalogId, text, params);
            }}
            onClose={() => {
              setPromptChip(null);
            }}
          />
        ) : null}
        <ChipMenus
          chips={chips}
          suspended={drugChip !== null || oxygenOpen || catheterOpen || fluidOpen}
          onPick={placeChip}
          onPickTests={(picked) => {
            const ids = picked.flatMap((chip) => (chip.catalogId ? [chip.catalogId] : []));
            if (ids.length === 0) return;
            const bucket = picked[0]?.report?.bucket ?? 'laboratory';
            const prefix = c.batchPrefix[bucket] ?? c.batchPrefix.laboratory ?? '';
            actions.placeTests(
              chat.patientId,
              ids,
              `${prefix}${picked.map((chip) => chip.label).join('、')}`,
            );
          }}
          onPrompt={(chip) => {
            setPromptChip(chip);
          }}
          onDrug={(chip) => {
            setOxygenOpen(false);
            setCatheterOpen(false);
            setDrugChip(chip);
          }}
          onOxygen={() => {
            setDrugChip(null);
            setPromptChip(null);
            setCatheterOpen(false);
            setOxygenOpen(true);
          }}
          onCatheters={() => {
            setDrugChip(null);
            setPromptChip(null);
            setOxygenOpen(false);
            setCatheterOpen(true);
          }}
          onFluid={() => {
            setDrugChip(null);
            setPromptChip(null);
            setOxygenOpen(false);
            setCatheterOpen(false);
            setFluidOpen(true);
          }}
          onObserve={(order) => {
            actions.placeOrder(chat.patientId, order.catalogId, order.text, order.params);
          }}
        />
      </div>
      {fluidOpen ? (
        <DrugOrderPopup onClose={() => setFluidOpen(false)}>
          <ContinuousFluidForm
            onSubmit={(order) => {
              actions.placeOrder(chat.patientId, order.catalogId, order.text, order.params);
              setFluidOpen(false);
            }}
            onClose={() => setFluidOpen(false)}
          />
        </DrugOrderPopup>
      ) : null}
      {oxygenOpen ? (
        <DrugOrderPopup
          onClose={() => {
            setOxygenOpen(false);
          }}
        >
          <OxygenOrderForm
            onSubmit={(order) => {
              actions.placeOrder(chat.patientId, order.catalogId, order.text, order.params);
              setOxygenOpen(false);
            }}
            onClose={() => {
              setOxygenOpen(false);
            }}
          />
        </DrugOrderPopup>
      ) : null}
      {catheterOpen ? (
        <DrugOrderPopup
          onClose={() => {
            setCatheterOpen(false);
          }}
        >
          <CatheterOrders
            onSubmit={(order) => {
              actions.placeOrder(chat.patientId, order.catalogId, order.text, order.params);
              setCatheterOpen(false);
            }}
            onClose={() => {
              setCatheterOpen(false);
            }}
          />
        </DrugOrderPopup>
      ) : null}
      {drugChip ? (
        <DrugOrderPopup
          onClose={() => {
            setDrugChip(null);
          }}
        >
          <DrugOrderForm
            key={drugChip.medicationId ?? drugChip.id}
            drugId={drugChip.medicationId ?? ''}
            treatmentSearch={drugChip.id === 'treat.drug'}
            medications={
              drugChip.id === 'treat.drug'
                ? treatmentMedications
                : medicationChoices(medications, drugChip)
            }
            onSubmit={(order) => {
              actions.placeOrder(chat.patientId, order.catalogId, order.text, order.params);
              setDrugChip(null);
            }}
            onClose={() => {
              setDrugChip(null);
            }}
          />
        </DrugOrderPopup>
      ) : null}
    </section>
  );
}
