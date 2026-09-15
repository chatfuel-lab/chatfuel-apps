import { Button, EmptyState, IconLink } from '~ui';
import { COPY } from '../copy';

/** A bot with nothing connected has nothing to count; the channels module is one click away. */
export function NoChannelsState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState
        icon={<IconLink />}
        title={COPY.channels.title}
        description={COPY.channels.description}
        action={
          <Button variant="primary" size="sm" onClick={onConnect}>
            <IconLink />
            {COPY.channels.action}
          </Button>
        }
      />
    </div>
  );
}
