import React from "react";
import { Link, useLocation } from "react-router";

// LeapBuilder M11 — catch-all 404 page. Mounted on the "*" route in
// routes.ts so any unmatched path inside the root layout renders here
// instead of React Router's default error boundary.

export default function NotFoundScreen() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6 text-center max-w-2xl mx-auto">
      <div className="text-7xl font-semibold opacity-80 select-none">404</div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm opacity-75">
          We couldn&apos;t find anything at{" "}
          <code className="rounded bg-base-secondary px-1.5 py-0.5">
            {pathname}
          </code>
          .
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
        <Link
          to="/"
          className="text-xs px-3 py-1.5 rounded bg-[#FC6B0E] text-[#0D0F11] font-semibold"
        >
          Go home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="text-xs px-3 py-1.5 rounded border border-[#3a3a3a] hover:bg-base-secondary"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
