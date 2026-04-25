'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[betex] unhandled error', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="text-xs uppercase tracking-widest text-danger mb-4">Error</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-3">
          Something went wrong.
        </h1>
        <p className="text-muted text-sm leading-relaxed mb-8">
          {error.message || 'An unknown error occurred while rendering this page.'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="focus-ring px-5 py-2.5 rounded bg-purple hover:bg-purpleHi text-bg font-medium text-sm transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="focus-ring px-5 py-2.5 rounded border border-border hover:border-borderHi text-text text-sm transition-colors"
          >
            Home
          </Link>
        </div>
        {error.digest && (
          <div className="mt-8 pt-4 border-t border-border text-xs font-mono text-dim">
            digest {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}
