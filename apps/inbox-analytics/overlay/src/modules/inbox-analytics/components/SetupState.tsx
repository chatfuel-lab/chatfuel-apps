import { Button, EmptyState, IconDatabase } from '~ui';
import { COPY } from '../copy';

/**
 * What the page shows when the routes are not mounted: the three steps the
 * playbook walks through, and a way to ask again once they are done.
 */
export function SetupState({ onRetry, checking }: { onRetry: () => void; checking: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <EmptyState
        icon={<IconDatabase />}
        title={COPY.setup.title}
        description={COPY.setup.description}
        action={
          <Button variant="secondary" size="sm" onClick={onRetry} loading={checking}>
            {COPY.setup.retry}
          </Button>
        }
      />
      <ol className="flex max-w-xl list-decimal flex-col gap-2 pl-5 text-sm text-text-muted">
        {COPY.setup.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
