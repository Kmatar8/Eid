'use client';

import { useTheme } from 'next-themes';
import { FireworksBackground } from '@/components/ui/fireworks';

type FireworksBackgroundDemoProps = {
    population: number;
};

export default function FireworksBackgroundDemo({
    population,
}: FireworksBackgroundDemoProps) {
    const { resolvedTheme } = useTheme();
    const theme = resolvedTheme;

    return (
        <FireworksBackground
            className="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none"
            population={population}
        />
    );
}
