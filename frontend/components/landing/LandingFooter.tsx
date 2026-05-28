"use client";

export default function LandingFooter() {
  return (
    <footer className="bg-paper">
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block w-3 h-3 bg-ink" aria-hidden="true" />
            <span className="font-mono font-semibold tracking-widest uppercase">AutoSoc</span>
          </div>
          <p className="label-cap-muted">AI-assisted SOC. Monochrome on purpose.</p>
        </div>
        <div>
          <div className="label-cap mb-3">Product</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><a href="/landing/features" className="hover:text-ink">Features</a></li>
            <li><a href="/landing/demo" className="hover:text-ink">Demo</a></li>
            <li><a href="/landing/integrations" className="hover:text-ink">Integrations</a></li>
            <li><a href="/landing/pricing" className="hover:text-ink">Pricing</a></li>
          </ul>
        </div>
        <div>
          <div className="label-cap mb-3">Resources</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><a href="/" className="hover:text-ink">Console</a></li>
            <li><a href="/login" className="hover:text-ink">Sign in</a></li>
            <li><a href="https://github.com/" className="hover:text-ink">GitHub</a></li>
            <li><a href="mailto:hello@autosoc.dev" className="hover:text-ink">Contact</a></li>
          </ul>
        </div>
        <div>
          <div className="label-cap mb-3">Legal</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><a href="#" className="hover:text-ink">Privacy</a></li>
            <li><a href="#" className="hover:text-ink">Terms</a></li>
            <li><a href="#" className="hover:text-ink">Security</a></li>
            <li><a href="#" className="hover:text-ink">SOC 2</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between label-cap-muted">
          <span>© 2026 AutoSoc</span>
          <span className="tabular-nums">v0.6.0 / build {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
