'use client';

export type SwapStep =
  | 'idle'
  | 'approving'
  | 'encrypting'
  | 'submitting'
  | 'confirming'
  | 'done'
  | 'error';

const STEPS = [
  { key: 'approving', label: 'Approve' },
  { key: 'encrypting', label: 'Encrypt' },
  { key: 'submitting', label: 'Submit' },
  { key: 'confirming', label: 'Settle' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];
type Status = 'done' | 'active' | 'pending';

function statusOf(current: SwapStep, key: StepKey): Status {
  const order: StepKey[] = ['approving', 'encrypting', 'submitting', 'confirming'];
  const currentIdx = order.indexOf(current as StepKey);
  const stepIdx = order.indexOf(key);
  if (current === 'done') return 'done';
  if (currentIdx === -1) return 'pending';
  if (currentIdx > stepIdx) return 'done';
  if (currentIdx === stepIdx) return 'active';
  return 'pending';
}

export function SwapTimeline({ step }: { step: SwapStep }) {
  if (step === 'idle' || step === 'error') return null;

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const status = statusOf(step, s.key);
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-initial">
            <Dot status={status} />
            <span
              className={`ml-2 text-xs ${
                status === 'active'
                  ? 'text-text'
                  : status === 'done'
                    ? 'text-muted'
                    : 'text-dim'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 ${
                  status === 'done' ? 'bg-purple/50' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dot({ status }: { status: Status }) {
  if (status === 'done') {
    return <div className="w-1.5 h-1.5 rounded-full bg-purple shrink-0" />;
  }
  if (status === 'active') {
    return (
      <div className="w-1.5 h-1.5 rounded-full bg-purple live-dot shrink-0" />
    );
  }
  return <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />;
}
