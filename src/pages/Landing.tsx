import { Link, useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();

  const capabilities = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
        </svg>
      ),
      title: "Multi-Source Ingestion",
      desc: "Pull context from Slack threads, emails, and meeting recordings into a unified pipeline.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      ),
      title: "Conflict Detection",
      desc: "Automatically surface contradictions between stakeholder statements before they become blockers.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: "Evidence Traceability",
      desc: "Every BRD sentence links back to the exact source that justifies it — no black boxes.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      title: "AI Quality Auditor",
      desc: "A proactive chat assistant scores your BRD in real time and prompts you to fill gaps.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      title: "Version Control",
      desc: "Full timeline of every BRD version with diff summaries and one-click rollback.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/30 backdrop-blur-xl bg-background/90 sticky top-0 z-50 px-8 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <span className="font-semibold text-lg tracking-tight text-foreground">DocuMind</span>
        <div className="flex items-center gap-6">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-primary transition-elegant">
            Sign in
          </Link>
          <Link
            to="/signup"
            className="text-sm bg-primary text-primary-foreground px-6 py-2.5 rounded hover:bg-primary/90 transition-elegant font-medium elegant-shadow hover-lift"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-7xl mx-auto px-6 pt-32 pb-32 overflow-hidden">
        {/* Background atmospheric elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-primary/3 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
        </div>

        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left content */}
          <div className="lg:col-span-7 space-y-8">
            <h1 className="text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.9] text-foreground">
              Eliminate<br />
              <span className="text-primary relative inline-block">
                the Gap
                <svg className="absolute -bottom-2 left-0 w-full" height="12" viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 10C50 5 100 2 150 5C200 8 250 4 298 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="text-muted-foreground/40">.</span>
            </h1>

            <p className="text-xl text-muted-foreground leading-relaxed max-w-xl font-light">
              DocuMind ingests your team's scattered conversations—Slack threads, emails, meeting recordings—and generates a 
              <span className="text-foreground font-medium"> structured, evidence-traced Business Requirements Document </span>
              in minutes.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4">
              <button
                onClick={() => navigate('/signup')}
                className="group relative bg-primary text-primary-foreground px-8 py-4 text-base font-semibold hover:bg-primary/90 transition-all duration-300 overflow-hidden rounded-lg shadow-lg hover:shadow-xl hover:scale-105"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start free
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <button
                onClick={() => navigate('/login')}
                className="group border-2 border-border px-8 py-4 text-base font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 rounded-lg"
              >
                <span className="flex items-center gap-2">
                  Sign in
                  <svg className="w-4 h-4 opacity-0 -ml-6 group-hover:opacity-100 group-hover:ml-0 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-6 pt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="font-medium">No credit card required</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <span>Free to start</span>
            </div>
          </div>

          {/* Right visual element */}
          <div className="lg:col-span-5 relative">
            <div className="relative bg-gradient-to-br from-card to-card/50 border border-border rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
              {/* Decorative corner accent */}
              <div className="absolute -top-3 -right-3 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
              
              {/* Simplified MVP-appropriate visual */}
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/50">
                  <span className="text-xs font-mono text-primary uppercase tracking-wider">Your Workflow</span>
                  <span className="text-xs text-muted-foreground font-medium">Simplified</span>
                </div>
                
                {/* Process steps */}
                <div className="space-y-5">
                  {[
                    { 
                      step: '1', 
                      label: 'Upload Documents', 
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                      ),
                      desc: 'Add your project files',
                      delay: '0s' 
                    },
                    { 
                      step: '2', 
                      label: 'AI Analysis', 
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                          <circle cx="11" cy="11" r="3" />
                        </svg>
                      ),
                      desc: 'Extract key requirements',
                      delay: '0.15s' 
                    },
                    { 
                      step: '3', 
                      label: 'Generate BRD', 
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      ),
                      desc: 'Get structured output',
                      delay: '0.3s' 
                    },
                  ].map((item, i) => (
                    <div 
                      key={i} 
                      className="flex items-start gap-4 group"
                      style={{ animation: `fadeInUp 0.6s ease-out ${item.delay} both` }}
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                        {item.icon}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-primary">STEP {item.step}</span>
                          <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground mb-0.5">{item.label}</h4>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom accent */}
                <div className="pt-5 mt-5 border-t border-border/50 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span>Fast & Simple</span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-border" />
                  <span>No Setup Required</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </section>

      {/* Flow Diagram */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-12">How it works</p>
        <div className="flex items-center gap-0 overflow-x-auto pb-4">
          {/* Sources */}
          <div className="flex flex-col gap-3 min-w-[160px]">
            {[
              { label: 'Email', icon: '✉' },
              { label: 'Slack', icon: '#' },
              { label: 'Meetings', icon: '◎' },
            ].map((src) => (
              <div
                key={src.label}
                className="border border-border bg-card px-4 py-3 flex items-center gap-3"
              >
                <span className="text-muted-foreground text-sm font-mono">{src.icon}</span>
                <span className="text-sm">{src.label}</span>
              </div>
            ))}
          </div>

          {/* Arrow */}
          <div className="flex-1 flex items-center px-6 min-w-[80px]">
            <div className="w-full border-t border-dashed border-border relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">→</div>
            </div>
          </div>

          {/* Core */}
          <div className="border border-primary bg-card px-6 py-5 text-center min-w-[160px]">
            <div className="text-xs text-primary mb-1 font-mono">CORE</div>
            <div className="text-sm font-medium">DocuMind</div>
            <div className="text-xs text-muted-foreground mt-1">AI Processor</div>
          </div>

          {/* Arrow */}
          <div className="flex-1 flex items-center px-6 min-w-[80px]">
            <div className="w-full border-t border-dashed border-border relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">→</div>
            </div>
          </div>

          {/* Output */}
          <div className="border border-border bg-card px-6 py-5 text-center min-w-[160px]">
            <div className="text-xs text-muted-foreground mb-1 font-mono">OUTPUT</div>
            <div className="text-sm font-medium">Structured BRD</div>
            <div className="text-xs text-muted-foreground mt-1">Evidence-traced</div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-12">Core capabilities</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {capabilities.map((cap) => (
            <div key={cap.title} className="bg-background p-6 flex flex-col gap-3">
              <div className="text-muted-foreground">{cap.icon}</div>
              <div className="text-sm font-medium">{cap.title}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{cap.desc}</div>
            </div>
          ))}
          {/* Filler cell to complete grid */}
          <div className="bg-background p-6 hidden lg:block" />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border text-center">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">Ready to close the gap?</h2>
        <p className="text-muted-foreground mb-8 text-sm">Free to start. No credit card required.</p>
        <button
          onClick={() => navigate('/signup')}
          className="bg-primary text-primary-foreground px-8 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Create your first BRD →
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 max-w-6xl mx-auto flex justify-between items-center">
        <span className="text-xs text-muted-foreground">DocuMind © 2026</span>
        <span className="text-xs text-muted-foreground">AI-native BRD generation</span>
      </footer>
    </div>
  );
};

export default Landing;
