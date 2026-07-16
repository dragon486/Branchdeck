'use client';

import React, { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import './StaggeredMenu.css';

interface MenuItem {
  label: string;
  ariaLabel?: string;
  link: string;
}

interface SocialItem {
  label: string;
  link: string;
}

interface StaggeredMenuProps {
  position?: 'left' | 'right';
  colors?: string[];
  items?: MenuItem[];
  socialItems?: SocialItem[];
  displaySocials?: boolean;
  displayItemNumbering?: boolean;
  className?: string;
  logoUrl?: string;
  menuButtonColor?: string;
  openMenuButtonColor?: string;
  accentColor?: string;
  changeMenuColorOnOpen?: boolean;
  isFixed?: boolean;
  closeOnClickAway?: boolean;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const StaggeredMenu = ({
  position = 'right',
  colors = ['#1a1a1a', '#0A0A0A'],
  items = [],
  socialItems = [],
  displaySocials = true,
  displayItemNumbering = true,
  className = '',
  logoUrl,
  menuButtonColor = '#000000',
  openMenuButtonColor = '#ffffff',
  accentColor = '#000000',
  changeMenuColorOnOpen = true,
  isFixed = true,
  closeOnClickAway = true,
  onMenuOpen,
  onMenuClose
}: StaggeredMenuProps) => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const preLayersRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = useCallback(() => {
    setOpen(prev => {
      const nextState = !prev;
      if (nextState) {
        onMenuOpen?.();
      } else {
        onMenuClose?.();
      }
      return nextState;
    });
  }, [onMenuOpen, onMenuClose]);

  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    const preContainer = preLayersRef.current;
    if (!panel || !preContainer) return;

    const layers = Array.from(preContainer.querySelectorAll('.sm-prelayer'));
    const itemLabels = Array.from(panel.querySelectorAll('.sm-panel-itemLabel'));
    const socialLinks = Array.from(panel.querySelectorAll('.sm-socials-link'));
    const logo = panel.querySelector('.sm-panel-logo');

    const offscreen = position === 'left' ? '-100%' : '100%';

    if (open) {
      // Open Animation
      document.body.style.overflow = 'hidden';

      gsap.killTweensOf([panel, ...layers, itemLabels, socialLinks]);

      // Set initial state
      gsap.set(layers, { xPercent: position === 'left' ? -100 : 100 });
      gsap.set(panel, { xPercent: position === 'left' ? -100 : 100 });
      gsap.set(itemLabels, { y: 50, opacity: 0 });
      gsap.set(socialLinks, { y: 20, opacity: 0 });
      if (logo) gsap.set(logo, { opacity: 0, scale: 0.9 });

      // Animate layers first (staggered slide-in)
      gsap.to(layers, {
        xPercent: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out'
      });

      // Slide in main panel
      gsap.to(panel, {
        xPercent: 0,
        duration: 0.6,
        delay: 0.15,
        ease: 'power3.out'
      });

      // Fade-in Logo
      if (logo) {
        gsap.to(logo, {
          opacity: 1,
          scale: 1,
          duration: 0.4,
          delay: 0.45,
          ease: 'back.out(1.7)'
        });
      }

      // Stagger item labels
      gsap.to(itemLabels, {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.08,
        delay: 0.4,
        ease: 'power2.out'
      });

      // Social links stagger
      if (socialLinks.length) {
        gsap.to(socialLinks, {
          y: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.05,
          delay: 0.6,
          ease: 'power2.out'
        });
      }
    } else {
      // Close Animation
      document.body.style.overflow = '';

      gsap.killTweensOf([panel, ...layers, itemLabels, socialLinks]);

      // Slide main panel back out
      gsap.to(panel, {
        xPercent: position === 'left' ? -100 : 100,
        duration: 0.4,
        ease: 'power3.in'
      });

      // Slide layers out staggered
      gsap.to(layers, {
        xPercent: position === 'left' ? -100 : 100,
        duration: 0.4,
        stagger: 0.05,
        delay: 0.1,
        ease: 'power3.in'
      });
    }
  }, [open, position]);

  // Click away listener to close menu
  useEffect(() => {
    if (!closeOnClickAway || !open) return;

    const handleClickAway = (e: MouseEvent) => {
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      if (panel && !panel.contains(e.target as Node) && trigger && !trigger.contains(e.target as Node)) {
        setOpen(false);
        onMenuClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [closeOnClickAway, open, onMenuClose]);

  return (
    <div className={`sm-menu-container ${isFixed ? 'fixed' : 'relative'} ${className}`}>
      {/* Toggle Button */}
      <button
        ref={triggerRef}
        onClick={toggleMenu}
        className="sm-menu-btn"
        aria-label="Toggle Menu"
        style={{ color: open && changeMenuColorOnOpen ? openMenuButtonColor : menuButtonColor }}
      >
        <div className={`sm-menu-icon-wrap ${open ? 'open' : ''}`}>
          <span className="sm-line line-1" style={{ backgroundColor: open && changeMenuColorOnOpen ? openMenuButtonColor : menuButtonColor }} />
          <span className="sm-line line-2" style={{ backgroundColor: open && changeMenuColorOnOpen ? openMenuButtonColor : menuButtonColor }} />
          <span className="sm-line line-3" style={{ backgroundColor: open && changeMenuColorOnOpen ? openMenuButtonColor : menuButtonColor }} />
        </div>
      </button>

      {/* Slide-out Layers */}
      <div ref={preLayersRef} className="sm-layers-wrapper">
        <div className="sm-prelayer layer-1" style={{ backgroundColor: colors[0] }} />
        <div className="sm-prelayer layer-2" style={{ backgroundColor: colors[1] }} />
      </div>

      {/* Main Panel */}
      <div ref={panelRef} className={`sm-panel ${position}`} style={{ backgroundColor: colors[1] || '#0A0A0A' }}>
        <div className="sm-panel-content">
          {logoUrl && (
            <div className="sm-panel-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
            </div>
          )}

          <nav className="sm-panel-nav">
            <ul className="sm-panel-list" data-numbering={displayItemNumbering ? 'true' : 'false'}>
              {items.map((item, idx) => (
                <li key={idx} className="sm-panel-item">
                  <a
                    href={item.link}
                    aria-label={item.ariaLabel}
                    onClick={() => { setOpen(false); onMenuClose?.(); }}
                    className="sm-panel-itemLink"
                  >
                    <span className="sm-panel-itemLabel" style={{ '--accent': accentColor } as React.CSSProperties}>
                      {item.label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {displaySocials && socialItems.length > 0 && (
            <div className="sm-socials">
              <span className="sm-socials-title">Follow Us</span>
              <div className="sm-socials-links">
                {socialItems.map((soc, idx) => (
                  <a
                    key={idx}
                    href={soc.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm-socials-link"
                    style={{ '--accent-social': accentColor } as React.CSSProperties}
                  >
                    {soc.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaggeredMenu;
