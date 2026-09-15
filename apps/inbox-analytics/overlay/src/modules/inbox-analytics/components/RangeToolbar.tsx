import { DateField, SegmentedControl, Spinner, TimezoneSelect, Toolbar } from '~ui';
import { BUCKET_LABELS, COPY, RANGE_PRESETS, type RangePreset } from '../copy';
import type { Bucket } from '../types';

export interface RangeToolbarProps {
  preset: RangePreset;
  onPreset: (next: RangePreset) => void;
  fromDay: string;
  toDay: string;
  onDates: (from: string | null, to: string | null) => void;
  bucket: Bucket;
  buckets: readonly Bucket[];
  onBucket: (next: Bucket) => void;
  tz: string;
  onTz: (next: string) => void;
  /** `over 12,430 messages · Aug 1 – 31 · Europe/Berlin`, or null before the first load. */
  coverage: string | null;
  loading: boolean;
}

/**
 * One filter row above everything it scopes (the dataviz rule): the range,
 * the custom dates, the bucket, the zone, and the coverage sentence every
 * card repeats. Nothing inside a card filters anything.
 */
export function RangeToolbar({
  preset,
  onPreset,
  fromDay,
  toDay,
  onDates,
  bucket,
  buckets,
  onBucket,
  tz,
  onTz,
  coverage,
  loading,
}: RangeToolbarProps) {
  return (
    <Toolbar>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<RangePreset>
          aria-label={COPY.toolbar.range}
          size="sm"
          value={preset}
          onChange={onPreset}
          options={RANGE_PRESETS}
        />
        {preset === 'custom' ? (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <DateField
              aria-label={COPY.toolbar.from}
              value={fromDay}
              onChange={(from) => onDates(from, toDay)}
              max={toDay}
            />
            <span>–</span>
            <DateField
              aria-label={COPY.toolbar.to}
              value={toDay}
              onChange={(to) => onDates(fromDay, to)}
              min={fromDay}
            />
          </div>
        ) : null}
        <SegmentedControl<Bucket>
          aria-label={COPY.toolbar.bucket}
          size="sm"
          value={bucket}
          onChange={onBucket}
          options={buckets.map((value) => ({ value, label: BUCKET_LABELS[value] }))}
        />
        <TimezoneSelect
          aria-label={COPY.toolbar.timezone}
          value={tz}
          onChange={(next) => next && onTz(next)}
          className="w-56"
        />
        <span className="ml-auto flex items-center gap-2 text-micro text-text-faint">
          {loading ? <Spinner size={12} /> : null}
          {coverage}
        </span>
      </div>
    </Toolbar>
  );
}
