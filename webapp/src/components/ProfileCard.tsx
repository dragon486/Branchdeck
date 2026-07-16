import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import './ProfileCard.css';

const DEFAULT_INNER_GRADIENT = 'linear-gradient(145deg,#60496e8c 0%,#71C4FF44 100%)';

const ANIMATION_CONFIG = {
  INITIAL_DURATION: 1200,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
  DEVICE_BETA_OFFSET: 20,
  ENTER_TRANSITION_MS: 180
};

const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);
const round = (v: number, precision = 3) => parseFloat(v.toFixed(precision));
const adjust = (v: number, fMin: number, fMax: number, tMin: number, tMax: number) => round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));

// Coordinates and details for 24 floating symbols
const SYMBOLS_DATA = [
  { char: '</>', x: 8, y: 12, size: 26, color: '#7DF9FF', delay: 0 },
  { char: '{}', x: 90, y: 16, size: 22, color: '#4FD1FF', delay: 1.5 },
  { char: '[]', x: 14, y: 44, size: 20, color: '#7B68EE', delay: 0.5 },
  { char: 'AI', x: 88, y: 32, size: 28, color: '#66A3FF', delay: 2.2 },
  { char: 'λ', x: 6, y: 62, size: 24, color: '#7DF9FF', delay: 1.0 },
  { char: '01', x: 92, y: 58, size: 26, color: '#7B68EE', delay: 0.8 },
  { char: '<>', x: 12, y: 74, size: 20, color: '#66A3FF', delay: 1.7 },
  { char: '()', x: 45, y: 22, size: 22, color: '#7DF9FF', delay: 2.5 },
  { char: 'const', x: 86, y: 76, size: 24, color: '#4FD1FF', delay: 0.3 },
  { char: 'function', x: 65, y: 8, size: 20, color: '#7B68EE', delay: 1.2 },
  { char: '=>', x: 72, y: 50, size: 25, color: '#66A3FF', delay: 0.6 },
  { char: 'npm', x: 24, y: 68, size: 21, color: '#7DF9FF', delay: 1.9 },
  { char: 'git', x: 40, y: 88, size: 19, color: '#4FD1FF', delay: 2.8 },
  { char: '⚡', x: 26, y: 28, size: 23, color: '#7B68EE', delay: 1.4 },
  { char: '⌘', x: 58, y: 40, size: 18, color: '#66A3FF', delay: 0.9 },
  { char: '</>', x: 65, y: 84, size: 22, color: '#7DF9FF', delay: 2.1 },
  { char: '{}', x: 24, y: 5, size: 20, color: '#4FD1FF', delay: 1.1 },
  { char: '[]', x: 40, y: 54, size: 24, color: '#7B68EE', delay: 0.4 },
  { char: 'AI', x: 5, y: 36, size: 18, color: '#66A3FF', delay: 2.7 },
  { char: 'λ', x: 48, y: 80, size: 21, color: '#7DF9FF', delay: 1.3 },
  { char: '01', x: 76, y: 90, size: 23, color: '#4FD1FF', delay: 0.7 },
  { char: '<>', x: 95, y: 48, size: 20, color: '#7B68EE', delay: 1.6 },
  { char: '()', x: 76, y: 15, size: 26, color: '#66A3FF', delay: 2.4 },
  { char: 'const', x: 52, y: 66, size: 19, color: '#7DF9FF', delay: 0.2 }
];

interface ProfileCardProps {
  avatarUrl?: string;
  iconUrl?: string;
  grainUrl?: string;
  innerGradient?: string;
  behindGlowEnabled?: boolean;
  behindGlowColor?: string;
  behindGlowSize?: string;
  className?: string;
  enableTilt?: boolean;
  enableMobileTilt?: boolean;
  mobileTiltSensitivity?: number;
  miniAvatarUrl?: string;
  name?: string;
  title?: string;
  handle?: string;
  status?: string;
  contactText?: string;
  contactUrl?: string;
  linkedinUrl?: string; // LinkedIn redirection prop
  showLinkedinIcon?: boolean; // toggle LinkedIn rendering
  showUserInfo?: boolean;
  onContactClick?: () => void;
}

const ProfileCardComponent: React.FC<ProfileCardProps> = ({
  avatarUrl = '<Placeholder for avatar URL>',
  iconUrl = '<Placeholder for icon URL>',
  grainUrl = '<Placeholder for grain URL>',
  innerGradient,
  behindGlowEnabled = true,
  behindGlowColor,
  behindGlowSize,
  className = '',
  enableTilt = true,
  enableMobileTilt = false,
  mobileTiltSensitivity = 5,
  miniAvatarUrl,
  name = 'Javi A. Torres',
  title = 'Software Engineer',
  handle = 'javicodes',
  status = 'Online',
  contactText = 'Contact',
  contactUrl = 'https://linkedin.com/in/adel',
  linkedinUrl = 'https://linkedin.com/in/adel',
  showLinkedinIcon = true,
  showUserInfo = true,
  onContactClick
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const symbolRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const enterTimerRef = useRef<number | null>(null);
  const leaveRafRef = useRef<number | null>(null);

  const tiltEngine = useMemo(() => {
    if (!enableTilt) return null;

    let rafId: number | null = null;
    let running = false;
    let lastTs = 0;

    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const DEFAULT_TAU = 0.14;
    const INITIAL_TAU = 0.6;
    let initialUntil = 0;

    const setVarsFromXY = (x: number, y: number) => {
      const shell = shellRef.current;
      const wrap = wrapRef.current;
      if (!shell || !wrap) return;

      const width = shell.clientWidth || 1;
      const height = shell.clientHeight || 1;

      const percentX = clamp((100 / width) * x);
      const percentY = clamp((100 / height) * y);

      const centerX = percentX - 50;
      const centerY = percentY - 50;

      // Update hover proximity factor for each individual symbol element
      SYMBOLS_DATA.forEach((sym, idx) => {
        const el = symbolRefs.current[idx];
        if (!el) return;
        const dist = Math.hypot(percentX - sym.x, percentY - sym.y);
        // Active visual bloom scope within 26% radial coordinates distance
        const proximity = clamp(1 - dist / 26, 0, 1);
        el.style.setProperty('--proximity', proximity.toFixed(3));
      });

      const properties = {
        '--pointer-x': `${percentX}%`,
        '--pointer-y': `${percentY}%`,
        '--background-x': `${adjust(percentX, 0, 100, 35, 65)}%`,
        '--background-y': `${adjust(percentY, 0, 100, 35, 65)}%`,
        '--pointer-from-center': `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        '--pointer-from-top': `${percentY / 100}`,
        '--pointer-from-left': `${percentX / 100}`,
        '--rotate-x': `${round(-(centerX / 5))}deg`,
        '--rotate-y': `${round(centerY / 4)}deg`
      };

      for (const [k, v] of Object.entries(properties)) wrap.style.setProperty(k, v);
    };

    const step = (ts: number) => {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
      const k = 1 - Math.exp(-dt / tau);

      currentX += (targetX - currentX) * k;
      currentY += (targetY - currentY) * k;

      setVarsFromXY(currentX, currentY);

      const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05;

      if (stillFar || document.hasFocus()) {
        rafId = requestAnimationFrame(step);
      } else {
        running = false;
        lastTs = 0;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0;
      rafId = requestAnimationFrame(step);
    };

    return {
      setImmediate(x: number, y: number) {
        currentX = x;
        currentY = y;
        setVarsFromXY(currentX, currentY);
      },
      setTarget(x: number, y: number) {
        targetX = x;
        targetY = y;
        start();
      },
      toCenter() {
        const shell = shellRef.current;
        if (!shell) return;
        this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);
      },
      beginInitial(durationMs: number) {
        initialUntil = performance.now() + durationMs;
        start();
      },
      getCurrent() {
        return { x: currentX, y: currentY, tx: targetX, ty: targetY };
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
        lastTs = 0;
      }
    };
  }, [enableTilt]);

  const getOffsets = (evt: React.PointerEvent<HTMLDivElement> | PointerEvent, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  const handlePointerEnter = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;

      shell.classList.add('active');
      shell.classList.add('entering');
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = window.setTimeout(() => {
        shell.classList.remove('entering');
      }, ANIMATION_CONFIG.ENTER_TRANSITION_MS);

      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  const handlePointerLeave = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || !tiltEngine) return;

    tiltEngine.toCenter();

    // Settle proximity variables back to 0 on exit
    SYMBOLS_DATA.forEach((_, idx) => {
      const el = symbolRefs.current[idx];
      if (el) el.style.setProperty('--proximity', '0');
    });

    const checkSettle = () => {
      if (!tiltEngine) return;
      const { x, y, tx, ty } = tiltEngine.getCurrent();
      const settled = Math.hypot(tx - x, ty - y) < 0.6;
      if (settled) {
        shell.classList.remove('active');
        leaveRafRef.current = null;
      } else {
        leaveRafRef.current = requestAnimationFrame(checkSettle);
      }
    };
    if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
    leaveRafRef.current = requestAnimationFrame(checkSettle);
  }, [tiltEngine]);

  const handleDeviceOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;

      const { beta, gamma } = event;
      if (beta == null || gamma == null) return;

      const centerX = shell.clientWidth / 2;
      const centerY = shell.clientHeight / 2;
      const x = clamp(centerX + gamma * mobileTiltSensitivity, 0, shell.clientWidth);
      const y = clamp(
        centerY + (beta - ANIMATION_CONFIG.DEVICE_BETA_OFFSET) * mobileTiltSensitivity,
        0,
        shell.clientHeight
      );

      tiltEngine.setTarget(x, y);
    },
    [tiltEngine, mobileTiltSensitivity]
  );

  useEffect(() => {
    if (!enableTilt || !tiltEngine) return;

    const shell = shellRef.current;
    if (!shell) return;

    const pointerMoveHandler = handlePointerMove;
    const pointerEnterHandler = handlePointerEnter;
    const pointerLeaveHandler = handlePointerLeave;
    const deviceOrientationHandler = handleDeviceOrientation;

    shell.addEventListener('pointerenter', pointerEnterHandler);
    shell.addEventListener('pointermove', pointerMoveHandler);
    shell.addEventListener('pointerleave', pointerLeaveHandler);

    const handleClick = () => {
      if (!enableMobileTilt || typeof window === 'undefined' || window.location.protocol !== 'https:') return;
      const anyMotion = window.DeviceMotionEvent as any;
      if (anyMotion && typeof anyMotion.requestPermission === 'function') {
        anyMotion
          .requestPermission()
          .then((state: string) => {
            if (state === 'granted') {
              window.addEventListener('deviceorientation', deviceOrientationHandler);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('deviceorientation', deviceOrientationHandler);
      }
    };
    shell.addEventListener('click', handleClick);

    const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET;
    const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;
    tiltEngine.setImmediate(initialX, initialY);
    tiltEngine.toCenter();
    tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION);

    return () => {
      shell.removeEventListener('pointerenter', pointerEnterHandler);
      shell.removeEventListener('pointermove', pointerMoveHandler);
      shell.removeEventListener('pointerleave', pointerLeaveHandler);
      shell.removeEventListener('click', handleClick);
      window.removeEventListener('deviceorientation', deviceOrientationHandler);
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
      tiltEngine.cancel();
      shell.classList.remove('entering');
    };
  }, [
    enableTilt,
    enableMobileTilt,
    tiltEngine,
    handlePointerMove,
    handlePointerEnter,
    handlePointerLeave,
    handleDeviceOrientation
  ]);

  const cardStyle = useMemo(
    () => ({
      '--icon': iconUrl ? `url(${iconUrl})` : 'none',
      '--grain': grainUrl ? `url(${grainUrl})` : 'none',
      '--inner-gradient': innerGradient ?? DEFAULT_INNER_GRADIENT,
      '--behind-glow-color': behindGlowColor ?? 'rgba(125, 190, 255, 0.67)',
      '--behind-glow-size': behindGlowSize ?? '50%'
    } as React.CSSProperties),
    [iconUrl, grainUrl, innerGradient, behindGlowColor, behindGlowSize]
  );

  const handleContactClick = useCallback((e: React.MouseEvent) => {
    onContactClick?.();
  }, [onContactClick]);

  return (
    <div ref={wrapRef} className={`pc-card-wrapper ${className}`.trim()} style={cardStyle}>
      {behindGlowEnabled && <div className="pc-behind" />}
      <div ref={shellRef} className="pc-card-shell">
        <section className="pc-card">
          <div className="pc-inside">
            {/* Background & Glare Layers */}
            <div className="pc-shine" />
            <div className="pc-glare" />

            {/* Floating Developer Symbols Layer */}
            <div className="pc-symbols-layer">
              {SYMBOLS_DATA.map((sym, idx) => (
                <span
                  key={idx}
                  ref={(el) => {
                    symbolRefs.current[idx] = el;
                  }}
                  className={`pc-symbol sym-${idx + 1}`}
                  style={{
                    left: `${sym.x}%`,
                    top: `${sym.y}%`,
                    fontSize: `${sym.size}px`,
                    color: sym.color,
                    animationDelay: `${sym.delay}s`
                  }}
                >
                  {sym.char}
                </span>
              ))}
            </div>

            {/* Head bloom lighting effect */}
            <div className="pc-head-glow" />

            {/* Avatar Content */}
            <div className="pc-content pc-avatar-content">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="avatar"
                src={avatarUrl}
                alt={`${name || 'User'} avatar`}
                loading="lazy"
                onError={(e: any) => {
                  const t = e.target;
                  t.style.display = 'none';
                }}
              />
              {showUserInfo && (
                <div className="pc-user-info">
                  <div className="pc-user-details">
                    <div className="pc-mini-avatar">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={miniAvatarUrl || avatarUrl}
                        alt={`${name || 'User'} mini avatar`}
                        loading="lazy"
                        onError={(e: any) => {
                          const t = e.target;
                          t.style.opacity = '0.5';
                          t.src = avatarUrl;
                        }}
                      />
                    </div>
                    <div className="pc-user-text">
                      <div className="pc-handle-row">
                        <span className="pc-handle">@{handle}</span>
                        {showLinkedinIcon && (
                          <a
                            href={linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pc-linkedin-link"
                            aria-label="LinkedIn Profile"
                            style={{ pointerEvents: 'auto' }}
                          >
                            <svg viewBox="0 0 24 24" className="pc-linkedin-icon" fill="#0A66C2">
                              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                            </svg>
                          </a>
                        )}
                      </div>
                      <div className="pc-status">{status}</div>
                    </div>
                  </div>
                  <a
                    className="pc-contact-btn"
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleContactClick}
                    style={{ pointerEvents: 'auto' }}
                    aria-label={`Contact ${name || 'user'}`}
                  >
                    {contactText}
                  </a>
                </div>
              )}
            </div>

            {/* Cinematic Glass Overlay */}
            <div className="pc-glass-overlay" />

            {/* Typography Header */}
            <div className="pc-content">
              <div className="pc-details">
                <h3>{name}</h3>
                <p>{title}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export const ProfileCard = React.memo(ProfileCardComponent);
export default ProfileCard;
