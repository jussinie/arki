import { formatWaterGoalLiters, waterGoalFillPercent } from '../model';
import './WaterOrb.css';

type WaterOrbProps = {
  consumedMl: number;
  goalMl: number;
};

function finiteConsumedMl(consumedMl: number): number {
  return Number.isFinite(consumedMl) ? Math.max(consumedMl, 0) : 0;
}

export function WaterOrb({ consumedMl, goalMl }: WaterOrbProps) {
  const consumed = finiteConsumedMl(consumedMl);
  const fillPercent = waterGoalFillPercent(consumedMl, goalMl);
  const goalLabel = formatWaterGoalLiters(goalMl);
  const consumedLabel = formatWaterGoalLiters(consumed);

  return (
    <div
      className="water-orb"
      role="progressbar"
      aria-label="Daily water goal"
      aria-valuemin={0}
      aria-valuemax={goalMl}
      aria-valuenow={Math.min(consumed, goalMl)}
      aria-valuetext={`${consumed} ml of ${goalLabel} L`}
    >
      <div className="water-orb__glass">
        <div
          className="water-orb__fill water__bar-fill"
          style={{
            width: `${fillPercent}%`,
            height: `${fillPercent}%`,
          }}
        >
          {fillPercent > 0 ? (
            <div className="water-orb__wave-clip">
              <svg
                className="water-orb__wave"
                viewBox="0 0 200 24"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M0 12 Q25 4 50 12 T100 12 T150 12 T200 12 V24 H0 Z" />
              </svg>
            </div>
          ) : null}
        </div>
      </div>
      <div className="water-orb__readout">
        <p className="water-orb__figure">
          <span className="water-orb__litres">{consumedLabel} L</span>
          <span className="water-orb__detail">
            of {goalLabel} L · {fillPercent}%
          </span>
        </p>
      </div>
    </div>
  );
}
