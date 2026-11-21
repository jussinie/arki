import {
  QUICK_ADD_WATER_DL,
  QUICK_ADD_WATER_ML,
  createClientOpId,
  waterMlFromDl,
  waterTotalMl,
} from '../model';
import { useAddWater, useWaterDay } from '../api';
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

  function handleAddWater(amountMl: number) {
    const id = createOpId();
    addWater.mutate({
      id,
      amountMl,
      localDate,
    });
  }

  const totalMl = waterTotalMl(day.data ?? [], localDate);

  return (
    <section className="water" aria-labelledby="water-heading">
      <h3 id="water-heading">Water</h3>
      <time className="water__date" dateTime={localDate}>
        {localDate}
      </time>
      {day.isPending ? (
        <p role="status">Loading water…</p>
      ) : (
        <>
          <p className="water__total" aria-live="polite">
            <span className="water__label">Today's water total</span>
            <span className="water__amount">{totalMl} ml</span>
          </p>
          <div className="water__actions">
            <button
              className="water__add water__add--wide"
              type="button"
              onClick={() => {
                handleAddWater(QUICK_ADD_WATER_ML);
              }}
            >
              Add {QUICK_ADD_WATER_ML} ml
            </button>
            {QUICK_ADD_WATER_DL.map((dl) => (
              <button
                key={dl}
                className="water__add"
                type="button"
                onClick={() => {
                  handleAddWater(waterMlFromDl(dl));
                }}
              >
                Add {dl} dl
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
