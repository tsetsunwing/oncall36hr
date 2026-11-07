import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const DESKTOP = { w: 1280, h: 800 };
const PHONE = { w: 390, h: 844 };
/** 只有直向手機用手機框；其餘（包括窄橫向）縮放電腦框，唔會按寬度重排區域。 */
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
  const size = mobile ? PHONE : DESKTOP;
  const scale = Math.min(window.innerWidth / size.w, window.innerHeight / size.h);
  return {
    kind: mobile ? 'mobile' : 'desktop',
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

  const size = frame.kind === 'mobile' ? PHONE : DESKTOP;
  return (
    <FrameContext.Provider value={frame.kind}>
      <div className="play-viewport">
        <div
          className={
            frame.kind === 'mobile' ? 'play-stage frame-mobile' : 'play-stage frame-desktop'
          }
          data-testid="play-frame"
          data-frame={frame.kind}
          style={{
            width: size.w,
            height: size.h,
            zoom: frame.scale,
          }}
        >
          {children}
        </div>
      </div>
    </FrameContext.Provider>
  );
}
