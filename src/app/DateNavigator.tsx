import { isValidLocalDate, shiftLocalDate } from '../shared/date';
import './DateNavigator.css';

type DateNavigatorProps = {
  value: string;
  today: string;
  onChange: (localDate: string) => void;
};

const FIRST_DATE = '0001-01-01';
const LAST_DATE = '9999-12-31';

export function DateNavigator({ value, today, onChange }: DateNavigatorProps) {
  return (
    <nav className="date-navigator" aria-label="Day navigation">
      <label className="date-navigator__label" htmlFor="selected-date">
        Choose date
      </label>
      <button
        type="button"
        aria-label="Previous day"
        disabled={value === FIRST_DATE}
        onClick={() => onChange(shiftLocalDate(value, -1))}
      >
        <span aria-hidden="true">←</span>
      </button>
      <input
        id="selected-date"
        type="date"
        min={FIRST_DATE}
        max={LAST_DATE}
        value={value}
        onChange={(event) => {
          const nextDate = event.currentTarget.value;
          if (isValidLocalDate(nextDate)) onChange(nextDate);
        }}
      />
      <button
        type="button"
        aria-label="Next day"
        disabled={value === LAST_DATE}
        onClick={() => onChange(shiftLocalDate(value, 1))}
      >
        <span aria-hidden="true">→</span>
      </button>
      {value !== today ? (
        <button
          className="date-navigator__today"
          type="button"
          onClick={() => onChange(today)}
        >
          Today
        </button>
      ) : null}
    </nav>
  );
}
