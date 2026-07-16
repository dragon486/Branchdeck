'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import { gsap } from 'gsap';
import './FlowingMenu.css';

interface FlowingMenuItem {
  link: string;
  text: string;
  image?: string;
}

interface FlowingMenuProps {
  items?: FlowingMenuItem[];
  speed?: number;
  textColor?: string;
  bgColor?: string;
  marqueeBgColor?: string;
  marqueeTextColor?: string;
}

const distMetric = (x: number, y: number, x2: number, y2: number) => {
  const dx = x - x2; const dy = y - y2; return dx * dx + dy * dy;
};

const findClosestEdge = (mouseX: number, mouseY: number, width: number, height: number) => {
  const topEdgeDist = distMetric(mouseX, mouseY, width / 2, 0);
  const bottomEdgeDist = distMetric(mouseX, mouseY, width / 2, height);
  return topEdgeDist < bottomEdgeDist ? 'top' : 'bottom';
};

interface MenuItemProps extends FlowingMenuItem {
  speed: number;
  textColor: string;
  marqueeBgColor: string;
  marqueeTextColor: string;
}

function MenuItem({ link, text, image, speed, textColor, marqueeBgColor, marqueeTextColor }: MenuItemProps) {
  const itemRef = useRef<HTMLLIElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeInnerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const [repetitions, setRepetitions] = useState(6);

  const animationDefaults = { duration: 0.5, ease: 'expo' };

  const calculateRepetitions = useCallback(() => {
    if (!marqueeInnerRef.current) return;
    const marqueeContent = marqueeInnerRef.current.querySelector('.marquee__part') as HTMLElement;
    if (!marqueeContent) return;
    const needed = Math.ceil(window.innerWidth / (marqueeContent.offsetWidth || 200)) + 3;
    setRepetitions(Math.max(5, needed));
  }, []);

  useEffect(() => {
    calculateRepetitions();
    window.addEventListener('resize', calculateRepetitions);
    return () => window.removeEventListener('resize', calculateRepetitions);
  }, [text, image, calculateRepetitions]);

  useEffect(() => {
    if (!marqueeInnerRef.current) return;
    if (animationRef.current) animationRef.current.kill();
    const marqueeContent = marqueeInnerRef.current.querySelector('.marquee__part') as HTMLElement;
    if (!marqueeContent) return;
    const contentWidth = marqueeContent.offsetWidth;
    if (contentWidth === 0) return;
    animationRef.current = gsap.to(marqueeInnerRef.current, {
      x: `-=${contentWidth}`, duration: contentWidth / (speed * 60), ease: 'none', repeat: -1, modifiers: {
        x: gsap.utils.unitize((v: string) => String(parseFloat(v) % contentWidth)),
      },
    });
  }, [repetitions, speed]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const el = itemRef.current; const marquee = marqueeRef.current;
    if (!el || !marquee) return;
    const rect = el.getBoundingClientRect();
    const edge = findClosestEdge(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    gsap.fromTo(marquee, { y: edge === 'top' ? '-101%' : '101%' }, { ...animationDefaults, y: '0%' });
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    const el = itemRef.current; const marquee = marqueeRef.current;
    if (!el || !marquee) return;
    const rect = el.getBoundingClientRect();
    const edge = findClosestEdge(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    gsap.to(marquee, { ...animationDefaults, y: edge === 'top' ? '-101%' : '101%' });
  };

  return (
    <li ref={itemRef} className="menu-item" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
      style={{ '--menu-text-color': textColor } as React.CSSProperties}>
      <a href={link}>
        <span className="menu-item__text">{text}</span>
      </a>
      <div ref={marqueeRef} className="menu-item__marquee"
        style={{ '--marquee-bg': marqueeBgColor, '--marquee-text': marqueeTextColor } as React.CSSProperties}>
        <div ref={marqueeInnerRef} className="menu-item__marquee-inner">
          {Array.from({ length: repetitions }).map((_, i) => (
            <span key={i} className="marquee__part">
              <span>{text}</span>
              {image && <img src={image} alt={text} />}
              <span>—</span>
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

export default function FlowingMenu({
  items = [], speed = 15, textColor = '#ffffff',
  bgColor = '#0a0b0f', marqueeBgColor = '#3279F9', marqueeTextColor = '#ffffff',
}: FlowingMenuProps) {
  return (
    <div className="flowing-menu-wrap" style={{ backgroundColor: bgColor }}>
      <ul className="flowing-menu">
        {items.map((item, idx) => (
          <MenuItem key={idx} {...item} speed={speed} textColor={textColor}
            marqueeBgColor={marqueeBgColor} marqueeTextColor={marqueeTextColor} />
        ))}
      </ul>
    </div>
  );
}
