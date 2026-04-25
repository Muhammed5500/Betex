import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="text-xs uppercase tracking-widest text-muted mb-4">404</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Page not found.</h1>
        <p className="text-muted text-sm leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 px-5 py-2.5 rounded bg-purple hover:bg-purpleHi text-bg font-medium text-sm transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
