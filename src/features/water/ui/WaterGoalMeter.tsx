import { useState, type FormEvent, type ReactNode } from 'react';
import {
  WATER_GOAL_RANGE_MESSAGE,
  formatWaterGoalLiters,
  isWaterGoalReached,
  parseWaterGoalInput,
} from '../model';
import { WaterOrb } from './WaterOrb';

const SAVE_GOAL_ERROR = 'Could not save the water goal. Try again.';

type WaterGoalMeterProps = {
  consumedMl: number;
  goalMl: number;
  saveError: boolean;
  saving: boolean;
  onSave: (goalMl: number) => void;
  children?: ReactNode;
};

type WaterGoalFormProps = {
  savedLabel: string;
  saveError: boolean;
  saving: boolean;
  onSave: (goalMl: number) => void;
};

function WaterGoalForm({
  savedLabel,
  saveError,
  saving,
  onSave,
}: WaterGoalFormProps) {
  const [draft, setDraft] = useState(savedLabel);
  const [inputError, setInputError] = useState<string | null>(null);
  const message = inputError ?? (saveError ? SAVE_GOAL_ERROR : null);

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
    <>
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
    </>
  );
}

export function WaterGoalMeter({
  consumedMl,
  goalMl,
  saveError,
  saving,
  onSave,
  children,
}: WaterGoalMeterProps) {
  const savedLabel = formatWaterGoalLiters(goalMl);
  const reached = isWaterGoalReached(consumedMl, goalMl);

  return (
    <div className="water__goal">
      <div className="water__goal-meter">
        <WaterOrb consumedMl={consumedMl} goalMl={goalMl} />
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
      {children}
      <WaterGoalForm
        key={savedLabel}
        savedLabel={savedLabel}
        saveError={saveError}
        saving={saving}
        onSave={onSave}
      />
    </div>
  );
}
