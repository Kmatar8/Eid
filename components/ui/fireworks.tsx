'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

const rand = (min: number, max: number): number =>
    Math.random() * (max - min) + min;

const randInt = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min) + min);

const randColor = (): string => `hsl(${randInt(0, 360)}, 100%, 50%)`;

type ParticleType = {
    x: number;
    y: number;
    color: string;
    speed: number;
    direction: number;
    vx: number;
    vy: number;
    gravity: number;
    friction: number;
    alpha: number;
    decay: number;
    size: number;
    update: () => void;
    draw: (ctx: CanvasRenderingContext2D) => void;
    isAlive: () => boolean;
};

function createParticle(
    x: number,
    y: number,
    color: string,
    speed: number,
    direction: number,
    gravity: number,
    friction: number,
    size: number,
): ParticleType {
    const vx = Math.cos(direction) * speed;
    const vy = Math.sin(direction) * speed;
    const alpha = 1;
    const decay = rand(0.005, 0.02);

    return {
        x,
        y,
        color,
        speed,
        direction,
        vx,
        vy,
        gravity,
        friction,
        alpha,
        decay,
        size,
        update() {
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.vy += this.gravity;
            this.x += this.vx;
            this.y += this.vy;
            this.alpha -= this.decay;
        },
        draw(ctx: CanvasRenderingContext2D) {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
        },
        isAlive() {
            return this.alpha > 0;
        },
    };
}

type FireworkType = {
    x: number;
    y: number;
    targetY: number;
    color: string;
    speed: number;
    size: number;
    angle: number;
    vx: number;
    vy: number;
    trail: { x: number; y: number }[];
    trailLength: number;
    exploded: boolean;
    update: () => boolean;
    explode: () => void;
    draw: (ctx: CanvasRenderingContext2D) => void;
};

function createFirework(
    x: number,
    y: number,
    targetY: number,
    color: string,
    speed: number,
    size: number,
    particleSpeed: { min: number; max: number } | number,
    particleSize: { min: number; max: number } | number,
    particleCountRange: { min: number; max: number },
    onExplode: (particles: ParticleType[]) => void,
): FireworkType {
    const angle = -Math.PI / 2 + rand(-0.3, 0.3);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const trail: { x: number; y: number }[] = [];
    const trailLength = randInt(10, 25);

    return {
        x,
        y,
        targetY,
        color,
        speed,
        size,
        angle,
        vx,
        vy,
        trail,
        trailLength,
        exploded: false,
        update() {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailLength) {
                this.trail.shift();
            }
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.02;
            if (this.vy >= 0 || this.y <= this.targetY) {
                this.explode();
                return false;
            }
            return true;
        },
        explode() {
            const numParticles = randInt(
                particleCountRange.min,
                particleCountRange.max + 1,
            );
            const particles: ParticleType[] = [];
            for (let i = 0; i < numParticles; i++) {
                const particleAngle = rand(0, Math.PI * 2);
                const localParticleSpeed = getValueByRange(particleSpeed);
                const localParticleSize = getValueByRange(particleSize);
                particles.push(
                    createParticle(
                        this.x,
                        this.y,
                        this.color,
                        localParticleSpeed,
                        particleAngle,
                        0.05,
                        0.98,
                        localParticleSize,
                    ),
                );
            }
            onExplode(particles);
        },
        draw(ctx: CanvasRenderingContext2D) {
            ctx.save();
            ctx.beginPath();
            if (this.trail.length > 1) {
                ctx.moveTo(this.trail[0]?.x ?? this.x, this.trail[0]?.y ?? this.y);
                for (const point of this.trail) {
                    ctx.lineTo(point.x, point.y);
                }
            } else {
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x, this.y);
            }
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.restore();
        },
    };
}

function getValueByRange(range: { min: number; max: number } | number): number {
    if (typeof range === 'number') {
        return range;
    }
    return rand(range.min, range.max);
}

function getColor(color: string | string[] | undefined): string {
    if (Array.isArray(color)) {
        return color[randInt(0, color.length)] ?? randColor();
    }
    return color ?? randColor();
}

const DEFAULT_FIREWORK_SPEED = Object.freeze({ min: 4, max: 8 });
const DEFAULT_FIREWORK_SIZE = Object.freeze({ min: 2, max: 5 });
const DEFAULT_PARTICLE_SPEED = Object.freeze({ min: 2, max: 7 });
const DEFAULT_PARTICLE_SIZE = Object.freeze({ min: 1, max: 5 });
const DEFAULT_PARTICLE_COUNT = Object.freeze({ min: 24, max: 70 });
const DEFAULT_EXPLOSION_HEIGHT = Object.freeze({ min: 0.1, max: 0.4 });
const MAX_DEVICE_PIXEL_RATIO = 1.5;
const BASE_MAX_FIREWORKS = 10;
const BASE_MAX_PARTICLES = 720;
const LOW_END_MAX_FIREWORKS = 6;
const LOW_END_MAX_PARTICLES = 360;

type FireworksBackgroundProps = Omit<React.ComponentProps<'div'>, 'color'> & {
    canvasProps?: React.ComponentProps<'canvas'>;
    population?: number;
    color?: string | string[];
    fireworkSpeed?: { min: number; max: number } | number;
    fireworkSize?: { min: number; max: number } | number;
    particleSpeed?: { min: number; max: number } | number;

    particleSize?: { min: number; max: number } | number;
    explosionHeight?: { min: number; max: number };
};

function FireworksBackground({
    className,
    canvasProps,
    population = 1,
    color,
    fireworkSpeed = DEFAULT_FIREWORK_SPEED,
    fireworkSize = DEFAULT_FIREWORK_SIZE,
    particleSpeed = DEFAULT_PARTICLE_SPEED,
    particleSize = DEFAULT_PARTICLE_SIZE,
    explosionHeight = DEFAULT_EXPLOSION_HEIGHT,
    ...props
}: FireworksBackgroundProps) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const fireworkSpeedMin = typeof fireworkSpeed === 'number' ? fireworkSpeed : fireworkSpeed.min;
    const fireworkSpeedMax = typeof fireworkSpeed === 'number' ? fireworkSpeed : fireworkSpeed.max;
    const fireworkSizeMin = typeof fireworkSize === 'number' ? fireworkSize : fireworkSize.min;
    const fireworkSizeMax = typeof fireworkSize === 'number' ? fireworkSize : fireworkSize.max;
    const particleSpeedMin = typeof particleSpeed === 'number' ? particleSpeed : particleSpeed.min;
    const particleSpeedMax = typeof particleSpeed === 'number' ? particleSpeed : particleSpeed.max;
    const particleSizeMin = typeof particleSize === 'number' ? particleSize : particleSize.min;
    const particleSizeMax = typeof particleSize === 'number' ? particleSize : particleSize.max;
    const explosionHeightMin = explosionHeight.min;
    const explosionHeightMax = explosionHeight.max;

    React.useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let maxX = 0;
        let maxY = 0;
        const devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let reducedMotionEnabled = reducedMotionQuery.matches;
        const hostNavigator = navigator as Navigator & { deviceMemory?: number };
        const hardwareConcurrency = hostNavigator.hardwareConcurrency ?? 4;
        const deviceMemory = hostNavigator.deviceMemory ?? 4;
        const isVeryWeakDevice = hardwareConcurrency <= 2 || deviceMemory <= 2;
        const isWeakDevice = isVeryWeakDevice || hardwareConcurrency <= 4 || deviceMemory <= 4;
        const deviceLoadFactor = isVeryWeakDevice ? 0 : isWeakDevice ? 0.55 : 1;

        const resolvedFireworkSpeed =
            fireworkSpeedMin === fireworkSpeedMax
                ? fireworkSpeedMin
                : { min: fireworkSpeedMin, max: fireworkSpeedMax };
        const resolvedFireworkSize =
            fireworkSizeMin === fireworkSizeMax
                ? fireworkSizeMin
                : { min: fireworkSizeMin, max: fireworkSizeMax };
        const resolvedParticleSpeed =
            particleSpeedMin === particleSpeedMax
                ? particleSpeedMin
                : { min: particleSpeedMin, max: particleSpeedMax };
        const resolvedParticleSize =
            particleSizeMin === particleSizeMax
                ? particleSizeMin
                : { min: particleSizeMin, max: particleSizeMax };

        const setCanvasSize = () => {
            const width = Math.max(1, Math.floor(container.clientWidth || window.innerWidth));
            const height = Math.max(1, Math.floor(container.clientHeight || window.innerHeight));

            maxX = width;
            maxY = height;
            canvas.width = Math.floor(width * devicePixelRatio);
            canvas.height = Math.floor(height * devicePixelRatio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        };
        setCanvasSize();
        window.addEventListener('resize', setCanvasSize);

        const explosions: ParticleType[] = [];
        const fireworks: FireworkType[] = [];
        const effectivePopulation = Math.max(0.2, population * deviceLoadFactor);
        const maxFireworks = Math.max(
            2,
            Math.round((isWeakDevice ? LOW_END_MAX_FIREWORKS : BASE_MAX_FIREWORKS) * effectivePopulation),
        );
        const maxParticles = Math.max(
            140,
            Math.round((isWeakDevice ? LOW_END_MAX_PARTICLES : BASE_MAX_PARTICLES) * effectivePopulation),
        );
        const particleCountRange = isWeakDevice
            ? { min: 12, max: 36 }
            : DEFAULT_PARTICLE_COUNT;
        let launchTimeoutId: number | null = null;
        let animationFrameId: number | null = null;
        let isHidden = document.visibilityState === 'hidden';
        let disposed = false;

        const canRunAnimation = () =>
            !disposed && !isHidden && !reducedMotionEnabled && !isVeryWeakDevice;

        const trimToMax = <T,>(items: T[], maxItems: number) => {
            const overflow = items.length - maxItems;
            if (overflow > 0) {
                items.splice(0, overflow);
            }
        };

        const handleExplosion = (particles: ParticleType[]) => {
            explosions.push(...particles);
            trimToMax(explosions, maxParticles);
        };

        const pushFirework = (firework: FireworkType) => {
            fireworks.push(firework);
            trimToMax(fireworks, maxFireworks);
        };

        const launchFirework = () => {
            if (!canRunAnimation()) {
                return;
            }
            const x = rand(maxX * 0.1, maxX * 0.9);
            const y = maxY;
            const targetY = rand(maxY * explosionHeightMin, maxY * explosionHeightMax);
            const fireworkColor = getColor(color);
            const speed = getValueByRange(resolvedFireworkSpeed);
            const size = getValueByRange(resolvedFireworkSize);
            pushFirework(
                createFirework(
                    x,
                    y,
                    targetY,
                    fireworkColor,
                    speed,
                    size,
                    resolvedParticleSpeed,
                    resolvedParticleSize,
                    particleCountRange,
                    handleExplosion,
                ),
            );
        };

        const scheduleNextLaunch = () => {
            if (!canRunAnimation()) {
                return;
            }
            const timeout = rand(300, 800) / effectivePopulation;
            launchTimeoutId = window.setTimeout(() => {
                launchTimeoutId = null;
                launchFirework();
                scheduleNextLaunch();
            }, timeout);
        };

        const animate = () => {
            if (!canRunAnimation()) {
                animationFrameId = null;
                return;
            }
            ctx.clearRect(0, 0, maxX, maxY);

            for (let i = fireworks.length - 1; i >= 0; i--) {
                const firework = fireworks[i];
                if (!firework?.update()) {
                    fireworks.splice(i, 1);
                } else {
                    firework.draw(ctx);
                }
            }

            for (let i = explosions.length - 1; i >= 0; i--) {
                const particle = explosions[i];
                particle?.update();
                if (particle?.isAlive()) {
                    particle.draw(ctx);
                } else {
                    explosions.splice(i, 1);
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        const stopAnimation = (clearState = false) => {
            if (launchTimeoutId !== null) {
                window.clearTimeout(launchTimeoutId);
                launchTimeoutId = null;
            }
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            if (clearState) {
                fireworks.length = 0;
                explosions.length = 0;
                ctx.clearRect(0, 0, maxX, maxY);
            }
        };

        const startAnimation = () => {
            if (!canRunAnimation()) {
                return;
            }
            if (launchTimeoutId === null) {
                launchFirework();
                scheduleNextLaunch();
            }
            if (animationFrameId === null) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };

        const handleVisibilityChange = () => {
            isHidden = document.visibilityState === 'hidden';
            if (isHidden) {
                stopAnimation(true);
                return;
            }
            startAnimation();
        };

        const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
            reducedMotionEnabled = event.matches;
            if (reducedMotionEnabled) {
                stopAnimation(true);
                return;
            }
            startAnimation();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        if (typeof reducedMotionQuery.addEventListener === 'function') {
            reducedMotionQuery.addEventListener('change', handleMotionPreferenceChange);
        } else {
            reducedMotionQuery.addListener(handleMotionPreferenceChange);
        }
        startAnimation();

        const handleClick = (event: MouseEvent) => {
            if (!canRunAnimation()) {
                return;
            }
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = maxY;
            const targetY = Math.max(0, Math.min(maxY, event.clientY - rect.top));
            const fireworkColor = getColor(color);
            const speed = getValueByRange(resolvedFireworkSpeed);
            const size = getValueByRange(resolvedFireworkSize);
            pushFirework(
                createFirework(
                    x,
                    y,
                    targetY,
                    fireworkColor,
                    speed,
                    size,
                    resolvedParticleSpeed,
                    resolvedParticleSize,
                    particleCountRange,
                    handleExplosion,
                ),
            );
        };

        container.addEventListener('click', handleClick);

        return () => {
            disposed = true;
            window.removeEventListener('resize', setCanvasSize);
            container.removeEventListener('click', handleClick);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (typeof reducedMotionQuery.removeEventListener === 'function') {
                reducedMotionQuery.removeEventListener('change', handleMotionPreferenceChange);
            } else {
                reducedMotionQuery.removeListener(handleMotionPreferenceChange);
            }
            stopAnimation();
        };
    }, [
        population,
        color,
        fireworkSpeedMin,
        fireworkSpeedMax,
        fireworkSizeMin,
        fireworkSizeMax,
        particleSpeedMin,
        particleSpeedMax,
        particleSizeMin,
        particleSizeMax,
        explosionHeightMin,
        explosionHeightMax,
    ]);

    return (
        <div
            ref={containerRef}
            data-slot="fireworks-background"
            className={cn('relative size-full overflow-hidden', className)}
            {...props}
        >
            <canvas
                {...canvasProps}
                ref={canvasRef}
                className={cn('absolute inset-0 size-full', canvasProps?.className)}
            />
        </div>
    );
}

export { FireworksBackground, type FireworksBackgroundProps };
