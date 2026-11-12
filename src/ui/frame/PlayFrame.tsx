import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const PHONE = { w: 390, h: 844 };
/** 只有直向手機用手機框；其餘跟視窗大小，唔再鎖 1280×800。 */
const PHONE_QUERY = '(orientation: portrait) and (max-width: 500px)';

export type FrameKind = 'desktop' | 'mobile';

const FrameContext = createContext<FrameKind>('desktop');

export function useFrame(): FrameKind {
  return useContext(FrameContext);
}

function readFrame(): { kind: FrameKind; scale: number } {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { kind: 'desktop', scale: 1 };
  }
  const mobile = window.matchMedia(PHONE_QUERY).matches;
  if (!mobile) {
    return { kind: 'desktop', scale: 1 };
  }
  const scale = Math.min(window.innerWidth / PHONE.w, window.innerHeight / PHONE.h);
  return {
    kind: 'mobile',
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

export function PlayFrame({ children }: { children: ReactNode }) {
  const [frame, setFrame] = useState(readFrame);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => {
      setFrame(readFrame());
    };
    window.addEventListener('resize', onChange);
    mq.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      mq.removeEventListener('change', onChange);
    };
  }, []);

  const mobile = frame.kind === 'mobile';
  const stageStyle: CSSProperties | undefined = mobile
    ? { width: PHONE.w, height: PHONE.h, zoom: frame.scale }
    : undefined;

  return (
    <FrameContext.Provider value={frame.kind}>
      <div className="play-viewport">
        <div
          className={mobile ? 'play-stage frame-mobile' : 'play-stage frame-desktop'}
          data-testid="play-frame"
          data-frame={frame.kind}
          style={stageStyle}
        >
          {children}
        </div>
      </div>
    </FrameContext.Provider>
  );
}
