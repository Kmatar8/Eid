'use client';

import { FireworksBackground } from '@/components/ui/fireworks';

type FireworksBackgroundDemoProps = {
    population: number;
};

export default function FireworksBackgroundDemo({
    population,
}: FireworksBackgroundDemoProps) {
    return (
        <FireworksBackground
            className="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none"
            population={population}
        />
    );
}
