/** Figma AL DOM for Top HUD + Bottom Dock. Handlers wired from LayoutGDemo. */
import { DEMO_NEEDS, type DayPart, type ZoneId } from './fakeData';

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

function NeedMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="fal-need" data-node-id="6:4" data-name="Need Meter">
      <p className="fal-t-need" data-node-id="6:5">
        {label}
      </p>
      <div className="fal-need-track" data-node-id="6:6" data-name="BarTrack">
        <i className="fal-need-fill" style={{ width: `${String(value)}%` }} />
      </div>
    </div>
  );
}

export function FloorHud({
  clock,
  dayPart,
  zone,
  onZone,
  onDayPart,
  onPhone,
  onRound,
}: {
  clock: string;
  dayPart: DayPart;
  zone: ZoneId;
  onZone: (z: ZoneId) => void;
  onDayPart: (d: DayPart) => void;
  onPhone: () => void;
  onRound: () => void;
}) {
  const moon = dayPart === 'night';
  return (
    <div className="fal-hud" data-node-id="34:103" data-name="Top HUD" data-testid="lg-hud-floor">
      <div className="fal-clock" data-node-id="34:104" data-name="Clock" data-testid="lg-clock">
        <p className="fal-t-clock" data-node-id="34:105">
          {moon ? '☾' : '☀'} {clock}
        </p>
        <p className="fal-t-clock-sub" data-node-id="34:106">
          {moon ? '深夜輪值 Night shift' : '日間輪值 Day shift'}
        </p>
      </div>
      <NeedMeter label={`疲倦 Fatigue ${String(DEMO_NEEDS.fatigue)}%`} value={DEMO_NEEDS.fatigue} />
      <NeedMeter label={`飢餓 Hunger ${String(DEMO_NEEDS.hunger)}%`} value={DEMO_NEEDS.hunger} />
      <NeedMeter label={`內急 Urgency ${String(DEMO_NEEDS.bladder)}%`} value={DEMO_NEEDS.bladder} />
      <div className="fal-fill-spacer" data-node-id="34:116" data-name="Spacer" />
      <div className="fal-zone-switch" data-node-id="34:117" data-name="Zone Switch">
        <button
          type="button"
          className="fal-zone-btn"
          data-node-id="34:118"
          data-name="A"
          data-selected={zone === 'A'}
          data-testid="lg-zone-a"
          onClick={() => {
            onZone('A');
          }}
        >
          <p className="fal-t-zone" data-node-id="34:119">
            A區 Zone A · 14床 beds
          </p>
        </button>
        <button
          type="button"
          className="fal-zone-btn"
          data-node-id="34:120"
          data-name="B"
          data-selected={zone === 'B'}
          data-testid="lg-zone-b"
          onClick={() => {
            onZone('B');
          }}
        >
          <p className="fal-t-zone" data-node-id="34:121">
            B區 Zone B · 5床 beds
          </p>
        </button>
      </div>
      <button
        type="button"
        className="fal-hud-btn"
        data-node-id="34:122"
        data-name="DayNight"
        data-testid="lg-daynight"
        onClick={() => {
          onDayPart(dayPart === 'night' ? 'day' : 'night');
        }}
      >
        <p className="fal-t-hud-btn" data-node-id="34:123">
          {moon ? '夜 Night' : '日 Day'}
        </p>
      </button>
      <button type="button" className="fal-hud-btn" data-testid="lg-round" onClick={onRound}>
        <p className="fal-t-hud-btn-13">巡房 Round</p>
      </button>
      <button
        type="button"
        className="fal-phone"
        data-node-id="34:124"
        data-name="Phone"
        data-testid="lg-phone"
        aria-label="電話 Phone"
        onClick={onPhone}
      >
        <img
          src={asset('demo/layout-g/phone-icon.svg')}
          alt=""
          width={24}
          height={24}
          data-node-id="38:216"
          data-name="Mobile phone · SVG"
        />
      </button>
    </div>
  );
}

export function BedHud({
  clock,
  dayPart,
  bedId,
  speed,
  onSpeed,
  onPhone,
  onBack,
}: {
  clock: string;
  dayPart: DayPart;
  bedId: string;
  speed: string;
  onSpeed: (s: string) => void;
  onPhone: () => void;
  onBack: () => void;
}) {
  const moon = dayPart === 'night';
  return (
    <div className="fal-hud" data-node-id="35:484" data-name="Top HUD" data-testid="lg-hud-bed">
      <div className="fal-clock" data-node-id="35:485" data-name="Clock" data-testid="lg-clock">
        <p className="fal-t-clock" data-node-id="35:486">
          {moon ? '☾' : '☀'} {clock}
        </p>
        <p className="fal-t-clock-bed" data-node-id="35:487">
          Bed {bedId}
        </p>
      </div>
      <NeedMeter label={`疲倦 Fatigue ${String(DEMO_NEEDS.fatigue)}%`} value={DEMO_NEEDS.fatigue} />
      <NeedMeter label={`飢餓 Hunger ${String(DEMO_NEEDS.hunger)}%`} value={DEMO_NEEDS.hunger} />
      <NeedMeter label={`內急 Urgency ${String(DEMO_NEEDS.bladder)}%`} value={DEMO_NEEDS.bladder} />
      <div className="fal-fill-spacer" data-node-id="35:497" data-name="Spacer" />
      <div className="fal-speed" data-node-id="53:462" data-name="Time Speed">
        <p className="fal-t-speed-label" data-node-id="53:463">
          時間流速 Time Speed
        </p>
        {(['00', '1x', '2x', '4x'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className="fal-speed-chip"
            data-name={s}
            data-selected={speed === s}
            onClick={() => {
              onSpeed(s);
            }}
          >
            <p className="fal-t-speed">{s}</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="fal-hud-btn"
        data-radius="14"
        data-node-id="53:472"
        data-name="Save"
      >
        <p className="fal-t-hud-btn-bold" data-node-id="53:473">
          儲存 Save
        </p>
      </button>
      <button
        type="button"
        className="fal-hud-btn"
        data-node-id="35:498"
        data-name="Back"
        data-testid="lg-back"
        onClick={onBack}
      >
        <p className="fal-t-hud-btn-13" data-node-id="35:499">
          ← 返回 Back
        </p>
      </button>
      <button
        type="button"
        className="fal-phone"
        data-node-id="35:500"
        data-name="Phone"
        data-testid="lg-phone"
        aria-label="電話 Phone"
        onClick={onPhone}
      >
        <img
          src={asset('demo/layout-g/phone-icon.svg')}
          alt=""
          width={24}
          height={24}
          data-node-id="38:255"
          data-name="Mobile phone · SVG"
        />
      </button>
    </div>
  );
}

const DOCK_CHIPS = [
  { id: 'observe' as const, node: '35:523', textNode: '35:524', label: '觀察 Observe' },
  { id: 'tests' as const, node: '35:527', textNode: '35:528', label: '檢查 Tests' },
  { id: 'treat' as const, node: '35:525', textNode: '35:526', label: '治療 Treat' },
  { id: 'resus' as const, node: '35:529', textNode: '35:530', label: '搶救 Resus' },
];

export function BottomDock({
  draft,
  dock,
  onDraft,
  onSend,
  onDock,
}: {
  draft: string;
  dock: 'observe' | 'treat' | 'tests' | 'resus' | null;
  onDraft: (v: string) => void;
  onSend: () => void;
  onDock: (id: 'observe' | 'treat' | 'tests' | 'resus') => void;
}) {
  return (
    <div className="fal-dock" data-node-id="35:520" data-name="Bottom Dock" data-testid="lg-dock">
      <div className="fal-dock-chat" data-node-id="35:521" data-name="Chat">
        <input
          value={draft}
          data-testid="lg-chat-input"
          placeholder="輸入訊息或醫囑… Enter message / order…"
          aria-label="輸入訊息或醫囑 Enter message / order"
          onChange={(e) => {
            onDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend();
          }}
        />
      </div>
      {DOCK_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="fal-dock-chip"
          data-dock={chip.id}
          data-node-id={chip.node}
          data-name={chip.label}
          data-selected={dock === chip.id}
          data-testid={`lg-chip-${chip.id}`}
          onClick={() => {
            onDock(chip.id);
          }}
        >
          <p className="fal-t-dock" data-node-id={chip.textNode}>
            {chip.label}
          </p>
        </button>
      ))}
    </div>
  );
}
