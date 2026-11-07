import { ui } from '@/i18n';
import type { GameActions, GameView } from '@/view';

export interface AiFailureBannerProps {
  failure: NonNullable<GameView['aiFailure']>;
  actions: GameActions;
  onLeave: () => void;
}

/** 靜態橫幅（顏色＋文字＋圖示）；唔閃爍。重試用同一 reqId（spec §21）。 */
export function AiFailureBanner({ failure, actions, onLeave }: AiFailureBannerProps) {
  const f = ui.game.aiFailure;
  const reason = f.reason[failure.reason ?? 'UNKNOWN'] ?? f.reason.UNKNOWN;
  return (
    <div className="ai-failure" role="alert" data-testid="ai-failure">
      <p className="ai-failure-title">
        <span aria-hidden="true">⚠ </span>
        {f.heading}
      </p>
      <p>
        {f.body} {f.reasonLabel}：{reason}
      </p>
      <p className="ai-failure-actions">
        <button type="button" className="btn btn-primary" onClick={actions.retryAi}>
          {f.retry}
        </button>
        <a className="button-link" href="#/settings">
          {f.toSettings}
        </a>
        <button type="button" className="btn" data-testid="ai-failure-leave" onClick={onLeave}>
          {f.leave}
        </button>
      </p>
    </div>
  );
}
