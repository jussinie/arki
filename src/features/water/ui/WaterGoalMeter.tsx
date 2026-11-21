import { useEffect, useState, type FormEvent } from 'react';
import {
  WATER_GOAL_RANGE_MESSAGE,
  formatWaterGoalLiters,
  isWaterGoalReached,
  parseWaterGoalInput,
  waterGoalFillPercent,
} from '../model';

const SAVE_GOAL_ERROR = 'Could not save the water goal. Try again.';

type WaterGoalMeterProps = {
  consumedMl: number;
  goalMl: number;
  saveError: boolean;
  saving: boolean;
  onSave: (goalMl: number) => void;
};

export function WaterGoalMeter({
  consumedMl,
  goalMl,
  saveError,
  saving,
  onSave,
}: WaterGoalMeterProps) {
  const savedLabel = formatWaterGoalLiters(goalMl);
  const [draft, setDraft] = useState(savedLabel);
  const [inputError, setInputError] = useState<string | null>(null);
  const reached = isWaterGoalReached(consumedMl, goalMl);
  const shownConsumedMl = Number.isFinite(consumedMl)
    ? Math.max(consumedMl, 0)
    : 0;
  const message = inputError ?? (saveError ? SAVE_GOAL_ERROR : null);

  useEffect(() => {
    setDraft(savedLabel);
    setInputError(null);
  }, [savedLabel]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextGoalMl = parseWaterGoalInput(draft);
      setDraft(formatWaterGoalLiters(nextGoalMl));
      setInputError(null);
      onSave(nextGoalMl);
    } catch (error) {
      setInputError(
        error instanceof Error ? error.message : WATER_GOAL_RANGE_MESSAGE
      );
    }
  }

  return (
    <div className="water__goal">
      <div className="water__goal-meter">
        <div
          className="water__bar"
          role="progressbar"
          aria-label="Daily water goal"
          aria-valuemin={0}
          aria-valuemax={goalMl}
          aria-valuenow={Math.min(shownConsumedMl, goalMl)}
          aria-valuetext={`${shownConsumedMl} ml of ${savedLabel} L`}
        >
          <div
            className="water__bar-fill"
            style={{ width: `${waterGoalFillPercent(consumedMl, goalMl)}%` }}
          />
        </div>
        <div className="water__goal-status" aria-live="polite">
          {reached ? (
            <span
              className="water__goal-met"
              role="img"
              aria-label="Goal reached"
            >
              ✓
            </span>
          ) : null}
        </div>
      </div>
      <form className="water__goal-form" onSubmit={handleSubmit}>
        <div className="water__goal-field">
          <label htmlFor="water-goal">Daily water goal (L)</label>
          <input
            id="water-goal"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            aria-invalid={inputError !== null}
            {...(message ? { 'aria-describedby': 'water-goal-error' } : {})}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
        </div>
        <button className="water__goal-save" type="submit" disabled={saving}>
          Save goal
        </button>
      </form>
      {message ? (
        <p className="water__error" id="water-goal-error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
