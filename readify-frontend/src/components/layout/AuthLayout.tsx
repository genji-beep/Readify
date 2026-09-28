import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-scope flex min-h-screen w-full bg-background font-sans">
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#5A4EF8] via-[#5546E8] to-[#4338CA] px-12 py-10 text-white lg:flex">
        <Logo />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 py-10">
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="w-full max-w-sm"
          >
            <ReaderIllustration />
          </motion.div>

          <div className="text-center">
            <h1 className="text-3xl font-bold leading-tight">Discover books through people.</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-white/80">
              Join thousands of readers discovering books through intelligent recommendations and community
              reviews.
            </p>
          </div>
        </div>

        <figure className="relative z-10 border-l-2 border-white/30 pl-4">
          <blockquote className="text-sm italic leading-relaxed text-white/90">
            "A reader lives a thousand lives before he dies. The man who never reads lives only one."
          </blockquote>
          <figcaption className="mt-2 text-xs text-white/50">— George R.R. Martin</figcaption>
        </figure>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        />
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12 lg:w-[55%]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[0_20px_60px_-15px_rgba(91,92,235,0.15)] sm:p-10 lg:shadow-none"
        >
          <div className="mb-6 flex justify-center lg:hidden">
            <Logo dark />
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="relative z-10 flex items-center gap-2">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${dark ? 'bg-primary' : 'bg-white/15'}`}>
        <BookOpen className="text-white" size={22} />
      </div>
      <span className={`text-lg font-bold ${dark ? 'text-text' : 'text-white'}`}>Readify</span>
    </div>
  );
}

function ReaderIllustration() {
  return (
    <svg viewBox="0 0 360 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" aria-hidden="true">
      <ellipse cx="180" cy="250" rx="140" ry="16" fill="white" fillOpacity="0.08" />

      <g opacity="0.9">
        <rect x="60" y="120" width="34" height="46" rx="4" fill="white" fillOpacity="0.9" transform="rotate(-8 60 120)" />
        <rect x="150" y="100" width="38" height="52" rx="4" fill="white" fillOpacity="0.95" transform="rotate(4 150 100)" />
        <rect x="240" y="128" width="32" height="44" rx="4" fill="white" fillOpacity="0.85" transform="rotate(10 240 128)" />
      </g>

      <g stroke="white" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 5">
        <line x1="90" y1="150" x2="160" y2="185" />
        <line x1="255" y1="155" x2="170" y2="188" />
        <line x1="170" y1="188" x2="170" y2="220" />
      </g>

      <g>
        <circle cx="90" cy="150" r="16" fill="white" fillOpacity="0.95" />
        <circle cx="255" cy="155" r="16" fill="white" fillOpacity="0.95" />
        <circle cx="170" cy="200" r="20" fill="white" />
      </g>

      <g fill="#5B5CEB">
        <circle cx="90" cy="146" r="5" />
        <circle cx="255" cy="151" r="5" />
        <circle cx="170" cy="194" r="6" />
      </g>
    </svg>
  );
}