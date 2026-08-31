import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  ChipInput,
  EmptyState,
  IconChat,
  IconInstagram,
  IconPlus,
  IconSend,
  IconTrash,
  SegmentedControl,
  Switch,
  Textarea,
} from '~ui';
import type { ModuleAppProps } from '../types';
import {
  loadRules,
  newRule,
  saveRules,
  triggerSummary,
  type CommentRule,
  type RuleTrigger,
} from './rules';

/**
 * The whole product on one screen: rules on the left, the selected rule's editor on the
 * right. The face is Instagram's own gradient — this app is one channel, one job, and it
 * wears the channel's colors — over the shell's primitives and tokens for everything else.
 */

/** Instagram's brand gradient. One definition; every accent on this screen derives from it. */
const IG_GRADIENT = 'linear-gradient(45deg, #f9ce34 0%, #ee2a7b 55%, #6228d7 100%)';
/** The same gradient at whisper volume, for tinted surfaces. */
const IG_GRADIENT_SOFT =
  'linear-gradient(45deg, rgba(249,206,52,0.10) 0%, rgba(238,42,123,0.10) 55%, rgba(98,40,215,0.10) 100%)';

/** A rounded tile filled with the gradient, holding a white icon. */
function GradientTile({ icon, size = 'md' }: { icon: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-white shadow-sm ${
        size === 'md' ? 'size-9 rounded-xl [&_svg]:h-5 [&_svg]:w-5' : 'size-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4'
      }`}
      style={{ background: IG_GRADIENT }}
    >
      {icon}
    </span>
  );
}

/** The Public / DM state pills on a rule card. */
function StatePill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        on ? 'bg-channel-instagram-soft text-channel-instagram' : 'bg-surface-sunken text-text-faint'
      }`}
    >
      {children}
    </span>
  );
}

export function CommentsApp({ botId, params, setParams }: ModuleAppProps) {
  const [rules, setRules] = useState<CommentRule[]>(() => loadRules(botId));
  const selectedId = params.get('rule') ?? rules[0]?.id;
  const selected = useMemo(() => rules.find((rule) => rule.id === selectedId), [rules, selectedId]);

  useEffect(() => saveRules(botId, rules), [botId, rules]);

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set('rule', id);
      setParams(next);
    },
    [params, setParams],
  );

  const patch = useCallback(
    (id: string, change: Partial<CommentRule>) => {
      setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...change } : rule)));
    },
    [setRules],
  );

  const add = useCallback(() => {
    const rule = newRule();
    setRules((current) => [...current, rule]);
    select(rule.id);
  }, [select]);

  const remove = useCallback(
    (id: string) => {
      setRules((current) => current.filter((rule) => rule.id !== id));
      const next = new URLSearchParams(params);
      next.delete('rule');
      setParams(next);
    },
    [params, setParams],
  );

  return (
    <div className="flex h-full bg-surface-sunken">
      <aside className="flex w-80 shrink-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2.5">
            <GradientTile icon={<IconInstagram />} />
            <div>
              <div className="text-sm font-bold">Reply rules</div>
              <div className="text-xs text-text-muted">
                {rules.filter((rule) => rule.enabled).length} of {rules.length} live
              </div>
            </div>
          </div>
          <Button size="xs" variant="secondary" onClick={add}>
            <IconPlus />
            New
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
          {rules.map((rule) => {
            const isSelected = rule.id === selectedId;
            return (
              <div
                key={rule.id}
                className="rounded-2xl p-[1.5px] transition-shadow"
                style={isSelected ? { background: IG_GRADIENT } : undefined}
              >
                <button
                  type="button"
                  onClick={() => select(rule.id)}
                  className={`block w-full rounded-[15px] bg-surface p-4 text-left transition-shadow ${
                    isSelected ? 'shadow-md' : 'border border-border hover:shadow-md'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-text">{rule.name}</span>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${rule.enabled ? '' : 'bg-border-strong'}`}
                      style={rule.enabled ? { background: IG_GRADIENT } : undefined}
                    />
                  </span>
                  <span className="mt-1 block truncate text-xs text-text-muted">
                    {triggerSummary(rule)}
                  </span>
                  <span className="mt-2.5 flex items-center gap-1.5">
                    <StatePill on={rule.publicReply.enabled}>Public</StatePill>
                    <StatePill on={rule.privateReply.enabled}>DM</StatePill>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto">
        {selected ? (
          <RuleEditor
            key={selected.id}
            rule={selected}
            onChange={(change) => patch(selected.id, change)}
            onDelete={() => remove(selected.id)}
          />
        ) : (
          <EmptyState
            icon={<IconInstagram />}
            title="No rule selected"
            description="Pick a rule on the left, or create one."
            action={
              <Button variant="primary" size="sm" onClick={add}>
                <IconPlus />
                New rule
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}

/** One editor section: gradient mark, title, optional switch, body. */
function EditorCard({
  icon,
  title,
  description,
  action,
  tinted,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tinted?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
      style={tinted ? { background: IG_GRADIENT_SOFT } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <GradientTile icon={icon} size="sm" />
          <div>
            <div className="text-sm font-bold text-text">{title}</div>
            {description ? <div className="mt-0.5 text-xs text-text-muted">{description}</div> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onDelete,
}: {
  rule: CommentRule;
  onChange: (change: Partial<CommentRule>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6 pl-2">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <input
          value={rule.name}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-label="Rule name"
          className="w-full min-w-0 flex-1 bg-transparent text-lg font-bold text-text outline-none placeholder:text-text-faint"
          placeholder="Name this rule"
        />
        <Switch
          checked={rule.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={rule.enabled ? 'Live' : 'Off'}
        />
        <Button iconOnly aria-label="Delete rule" variant="dangerGhost" size="sm" onClick={onDelete}>
          <IconTrash />
        </Button>
      </div>

      <EditorCard
        icon={<IconInstagram />}
        title="When a comment arrives"
        description="Instagram · comments on your posts"
      >
        <div className="flex flex-col gap-3">
          <SegmentedControl<RuleTrigger>
            aria-label="Trigger"
            value={rule.trigger}
            onChange={(trigger) => onChange({ trigger })}
            options={[
              { value: 'all', label: 'Every comment' },
              { value: 'keywords', label: 'Contains keywords' },
            ]}
          />
          {rule.trigger === 'keywords' ? (
            <ChipInput
              value={rule.keywords}
              onChange={(keywords) => onChange({ keywords })}
              placeholder="Add a keyword and press Enter"
            />
          ) : null}
        </div>
      </EditorCard>

      <EditorCard
        icon={<IconChat />}
        title="Public reply"
        description="Threaded under the comment, visible to everyone"
        action={
          <Switch
            checked={rule.publicReply.enabled}
            onChange={(enabled) => onChange({ publicReply: { ...rule.publicReply, enabled } })}
            aria-label="Public reply on"
          />
        }
      >
        <Textarea
          value={rule.publicReply.text}
          onChange={(event) => onChange({ publicReply: { ...rule.publicReply, text: event.target.value } })}
          disabled={!rule.publicReply.enabled}
          autoGrow
          rows={2}
          placeholder="What to answer under the comment"
          className="rounded-xl"
        />
      </EditorCard>

      <EditorCard
        icon={<IconSend />}
        title="Private reply"
        description="Sent to the commenter's DMs — where the sale happens"
        tinted
        action={
          <Switch
            checked={rule.privateReply.enabled}
            onChange={(enabled) => onChange({ privateReply: { ...rule.privateReply, enabled } })}
            aria-label="Private reply on"
          />
        }
      >
        <Textarea
          value={rule.privateReply.text}
          onChange={(event) => onChange({ privateReply: { ...rule.privateReply, text: event.target.value } })}
          disabled={!rule.privateReply.enabled}
          autoGrow
          rows={2}
          placeholder="What to send in the DM"
          className="rounded-xl bg-surface"
        />
      </EditorCard>
    </div>
  );
}
