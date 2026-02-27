import { FireworksBackground } from "@/components/ui/fireworks";
import FireworksBackgroundDemo from "@/components/fireworks-demo";

export default function EidCelebrationPage() {
    return (
        <div className="relative min-h-screen w-full bg-background overflow-hidden text-foreground">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,var(--festive-glow),transparent_52%),linear-gradient(160deg,var(--background)_0%,var(--secondary)_48%,var(--background)_100%)] z-[-1]" />
            {/* Fireworks Background */}
            <FireworksBackground
                population={2}
                particleSpeed={3}
                className="absolute inset-0 z-0"
            />
            {/* Monochrome Fireworks Demo Layer */}
            <FireworksBackgroundDemo population={1} />

            {/* Content Overlay */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center p-4">
                <div className="backdrop-blur-xl bg-glass-bg p-10 rounded-2xl border border-glass-border shadow-2xl animate-float-soft">
                    <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 mb-6 drop-shadow-sm animate-glow-pulse">
                        Eid Mubarak
                    </h1>
                    <h2 className="text-4xl md:text-6xl mb-8 text-fuchsia-400 drop-shadow-md">
                        عيد مبارك
                    </h2>
                    <p className="text-xl md:text-2xl opacity-80 max-w-lg mx-auto leading-relaxed">
                        Wishing you and your family a joyous celebration filled with peace, love, and prosperity.
                    </p>

                    <div className="mt-10 flex gap-4 justify-center">
                        <button className="px-8 py-3 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold hover:scale-105 transition-all shadow-lg hover:shadow-fuchsia-500/30">
                            Send Wishes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
