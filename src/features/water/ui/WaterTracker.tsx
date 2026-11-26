import {
  QUICK_ADD_WATER_DL,
  createClientOpId,
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

  const totalMl = waterTotalMl(day.data ?? [], localDate);

  const quickAddSection = (
    <>
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
  );

  return (
    <section className="water" aria-label="Water">
      {day.isPending ? (
        <p role="status">Loading water…</p>
      ) : day.isError ? (
        <p className="water__error" role="alert">
          Unable to load water entries. Please reload.
        </p>
      ) : goal.isPending ? (
        <>
          <p role="status">Loading water goal…</p>
          {quickAddSection}
        </>
      ) : goal.isError || goal.data === undefined ? (
        <>
          <p className="water__error" role="alert">
            Unable to load the water goal. Please reload.
          </p>
          {quickAddSection}
        </>
      ) : (
        <WaterGoalMeter
          consumedMl={totalMl}
          goalMl={goal.data}
          saveError={setGoal.isError}
          saving={setGoal.isPending}
          onSave={(goalMl) => {
            setGoal.mutate(goalMl);
          }}
        >
          {quickAddSection}
        </WaterGoalMeter>
      )}
    </section>
  );
}
