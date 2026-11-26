import {
  QUICK_ADD_WATER_DL,
  createClientOpId,
  isWaterGoalReached,
  resolveWaterGoalMl,
  waterMlFromDl,
  waterTotalMl,
} from '../model';
import { useAddWater, useWaterDay, useWaterGoals } from '../api';
import { WaterOrb } from './WaterOrb';
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
  const goals = useWaterGoals();

  function handleAddWater(amountMl: number) {
    const id = createOpId();
    addWater.mutate({
      id,
      amountMl,
      localDate,
    });
  }

  const totalMl = waterTotalMl(day.data ?? [], localDate);
  const resolvedGoalMl =
    goals.data === undefined
      ? undefined
      : resolveWaterGoalMl(goals.data, localDate);

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
          {goals.isPending ? (
            <p role="status">Loading water goal…</p>
          ) : goals.isError || resolvedGoalMl === undefined ? (
            <p className="water__error" role="alert">
              Unable to load the water goal. Please reload.
            </p>
          ) : resolvedGoalMl === null ? (
            <p className="water__goal-empty">
              No water goal set. Set one in Settings.
            </p>
          ) : (
            <div className="water__goal">
              <div className="water__goal-meter">
                <WaterOrb consumedMl={totalMl} goalMl={resolvedGoalMl} />
                <div className="water__goal-status" aria-live="polite">
                  {isWaterGoalReached(totalMl, resolvedGoalMl) ? (
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
            </div>
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
