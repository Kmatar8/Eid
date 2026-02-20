import { FireworksBackground } from "@/components/ui/fireworks";
import FireworksBackgroundDemo from "@/components/fireworks-demo";

export default function EidCelebrationPage() {
    return (
        <div className="relative min-h-screen w-full bg-black overflow-hidden text-white">
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
                <div className="backdrop-blur-sm bg-black/30 p-10 rounded-2xl border border-white/10 shadow-2xl animate-float-soft">
                    <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 mb-6 drop-shadow-sm animate-glow-pulse">
                        Eid Mubarak
                    </h1>
                    <h2 className="text-4xl md:text-6xl mb-8 text-yellow-100 drop-shadow-md">
                        عيد مبارك
                    </h2>
                    <p className="text-xl md:text-2xl text-gray-200 max-w-lg mx-auto leading-relaxed">
                        Wishing you and your family a joyous celebration filled with peace, love, and prosperity.
                    </p>

                    <div className="mt-10 flex gap-4 justify-center">
                        <button className="px-8 py-3 rounded-full bg-white text-black font-semibold hover:bg-gray-100 transition-colors shadow-lg hover:shadow-white/20">
                            Send Wishes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
