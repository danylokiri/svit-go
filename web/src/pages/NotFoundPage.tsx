import { Link } from "react-router-dom";
import GlassCard from "@/components/GlassCard";

export default function NotFoundPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-200px)] max-w-md place-items-center px-4 py-16 text-center">
      <GlassCard variant="strong" className="w-full p-10">
        <div className="text-7xl">🧭</div>
        <h1 className="font-marker mt-4 text-6xl leading-none">404</h1>
        <p className="mt-3 text-ink-secondary">
          This corner of the world isn't on our map yet.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="btn btn-primary">
            Back home
          </Link>
          <Link to="/catalog" className="btn btn-ghost">
            Browse catalog
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
