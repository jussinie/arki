import {
  QUICK_ADD_WATER_DL,
  createClientOpId,
  waterEntriesOnLocalDate,
  waterMlFromDl,
  waterTotalMl,
} from '../model';
import {
  useAddWater,
  useSetWaterGoal,
  useWaterDay,
  useWaterGoal,
} from '../api';
import { WaterGoalMeter } from './WaterGoalMeter';
import './WaterTracker.css';

type WaterTrackerProps = {
  localDate: string;
  createOpId?: () => string;
};

export function WaterTracker({
  localDate,
  createOpId = createClientOpId,
}: WaterTrackerProps) {
  const day = useWaterDay(localDate);
  const addWater = useAddWater();
  const goal = useWaterGoal();
  const setGoal = useSetWaterGoal();

  function handleAddWater(amountMl: number) {
    const id = createOpId();
    addWater.mutate({
      id,
      amountMl,
      localDate,
    });
  }

  const entries = waterEntriesOnLocalDate(day.data ?? [], localDate);
  const totalMl = waterTotalMl(entries, localDate);

  return (
    <section className="water" aria-labelledby="water-heading">
      <h3 id="water-heading">Water</h3>
      <time className="water__date" dateTime={localDate}>
        {localDate}
      </time>
      {day.isPending ? (
        <p role="status">Loading water…</p>
      ) : day.isError ? (
        <p className="water__error" role="alert">
          Unable to load water entries. Please reload.
        </p>
      ) : (
        <>
          <p className="water__total" aria-live="polite">
            <span className="water__label">Day's water total</span>
            <span className="water__amount">{totalMl} ml</span>
          </p>
          {entries.length > 0 ? (
            <ul className="water__entries" aria-label="Water entries">
              {entries.map((entry) => (
                <li key={entry.id} className="water__entry">
                  {entry.amountMl} ml
                </li>
              ))}
            </ul>
          ) : null}
          {goal.isPending ? (
            <p role="status">Loading water goal…</p>
          ) : goal.isError || goal.data === undefined ? (
            <p className="water__error" role="alert">
              Unable to load the water goal. Please reload.
            </p>
          ) : (
            <WaterGoalMeter
              consumedMl={totalMl}
              goalMl={goal.data}
              saveError={setGoal.isError}
              saving={setGoal.isPending}
              onSave={(goalMl) => {
                setGoal.mutate(goalMl);
              }}
            />
          )}
          {addWater.isError ? (
            <p className="water__error" role="alert">
              Could not add water. Try again.
            </p>
          ) : null}
          <div className="water__actions">
            {QUICK_ADD_WATER_DL.map((dl) => (
              <button
                key={dl}
                className="water__add"
                type="button"
                onClick={() => {
                  handleAddWater(waterMlFromDl(dl));
                }}
              >
                {dl} dl
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
