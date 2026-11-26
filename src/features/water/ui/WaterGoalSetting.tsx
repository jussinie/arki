import { useState, type FormEvent } from 'react';
import { formatDisplayDate, isValidLocalDate } from '../../../shared/date';
import {
  WATER_GOAL_RANGE_MESSAGE,
  formatWaterGoalLiters,
  parseWaterGoalInput,
  resolveWaterGoalMl,
} from '../model';
import { useSetWaterGoal, useWaterGoals } from '../api';
import './WaterGoalSetting.css';

const SAVE_GOAL_ERROR = 'Could not save the water goal. Try again.';
const CHOOSE_DATE_ERROR = 'Choose a valid date.';

type WaterGoalSettingProps = {
  today: string;
};

type WaterGoalFormProps = {
  selectedDate: string;
  savedLabel: string;
  scopeText: string | null;
  saveError: boolean;
  saving: boolean;
  onDateChange: (localDate: string) => void;
  onSave: (goalMl: number) => void;
};

function WaterGoalForm({
  selectedDate,
  savedLabel,
  scopeText,
  saveError,
  saving,
  onDateChange,
  onSave,
}: WaterGoalFormProps) {
  const [draft, setDraft] = useState(savedLabel);
  const [dateError, setDateError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const message =
    dateError ?? inputError ?? (saveError ? SAVE_GOAL_ERROR : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidLocalDate(selectedDate)) {
      setDateError(CHOOSE_DATE_ERROR);
      setInputError(null);
      return;
    }
    try {
      const nextGoalMl = parseWaterGoalInput(draft);
      setDraft(formatWaterGoalLiters(nextGoalMl));
      setInputError(null);
      setDateError(null);
      onSave(nextGoalMl);
    } catch (error) {
      setInputError(
        error instanceof Error ? error.message : WATER_GOAL_RANGE_MESSAGE
      );
      setDateError(null);
    }
  }

  return (
    <form className="water-goal-setting__form" onSubmit={handleSubmit}>
      <div className="water-goal-setting__field">
        <label htmlFor="water-goal-date">Goal date</label>
        <input
          id="water-goal-date"
          type="date"
          value={selectedDate}
          aria-invalid={dateError !== null}
          {...(message ? { 'aria-describedby': 'water-goal-error' } : {})}
          onChange={(event) => {
            onDateChange(event.currentTarget.value);
          }}
        />
      </div>
      <div className="water-goal-setting__field">
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
      {scopeText ? (
        <p className="water-goal-setting__scope">{scopeText}</p>
      ) : null}
      <button
        className="water-goal-setting__save"
        type="submit"
        disabled={saving}
      >
        Save goal
      </button>
      {message ? (
        <p
          className="water-goal-setting__error"
          id="water-goal-error"
          role="alert"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Settings section for the daily water goal (ARK-49): a goal picked for
 * today or a future date is saved as an ongoing change point, a goal picked
 * for a past date as a single-day exception.
 */
export function WaterGoalSetting({ today }: WaterGoalSettingProps) {
  const goals = useWaterGoals();
  const saveGoal = useSetWaterGoal();
  const [selectedDate, setSelectedDate] = useState(today);

  const savedGoalMl =
    goals.data === undefined
      ? undefined
      : resolveWaterGoalMl(goals.data, selectedDate);
  const savedLabel =
    savedGoalMl === undefined || savedGoalMl === null
      ? ''
      : formatWaterGoalLiters(savedGoalMl);
  const isPastDate = isValidLocalDate(selectedDate) && selectedDate < today;
  const scopeText = !isValidLocalDate(selectedDate)
    ? null
    : isPastDate
      ? `Applies only to ${formatDisplayDate(selectedDate)}.`
      : `Applies every day from ${formatDisplayDate(selectedDate)} until you change it.`;

  if (goals.isPending) {
    return (
      <section
        className="water-goal-setting"
        aria-labelledby="water-goal-setting-heading"
      >
        <h3 id="water-goal-setting-heading">Water goal</h3>
        <p role="status">Loading water goal…</p>
      </section>
    );
  }

  if (goals.isError || goals.data === undefined) {
    return (
      <section
        className="water-goal-setting"
        aria-labelledby="water-goal-setting-heading"
      >
        <h3 id="water-goal-setting-heading">Water goal</h3>
        <p className="water-goal-setting__error" role="alert">
          Unable to load the water goal. Please reload.
        </p>
      </section>
    );
  }

  return (
    <section
      className="water-goal-setting"
      aria-labelledby="water-goal-setting-heading"
    >
      <h3 id="water-goal-setting-heading">Water goal</h3>
      <WaterGoalForm
        key={`${selectedDate}:${savedLabel}`}
        selectedDate={selectedDate}
        savedLabel={savedLabel}
        scopeText={scopeText}
        saveError={saveGoal.isError}
        saving={saveGoal.isPending}
        onDateChange={setSelectedDate}
        onSave={(goalMl) => {
          saveGoal.mutate({
            goalMl,
            localDate: selectedDate,
            singleDay: isPastDate,
          });
        }}
      />
    </section>
  );
}
