document.addEventListener('DOMContentLoaded', () => {

  /* ─── THEME TOGGLE (DARK MODE) ────────────────────────── */
  const themeToggle = document.getElementById('theme-toggle');

  // Initialize theme from preference
  const savedTheme = localStorage.getItem('branchdeck-theme') || 'light';
  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.dataset.theme || 'light';
      const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(targetTheme);
    });
  }

  function applyTheme(theme) {
    // Set theme attribute
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('branchdeck-theme', theme);

    // Start/stop canvas light rays for dark mode
    if (theme === 'dark') {
      initLightRays();
    } else {
      stopLightRays();
    }
  }

  /* ─── CANVAS LIGHT RAYS (DARK MODE HERO) ─────────────── */
  let lightRaysAnimId = null;

  function initLightRays() {
    const canvas = document.getElementById('hero-light-rays');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let startTime = null;

    function resize() {
      const section = canvas.closest('.hero') || canvas.parentElement;
      canvas.width = section ? section.offsetWidth : window.innerWidth;
      canvas.height = section ? section.offsetHeight : window.innerHeight;
    }
    resize();

    const resizeObserver = new ResizeObserver(resize);
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    const rays = Array.from({ length: 12 }, (_, i) => ({
      angle: (i / 12) * Math.PI * 0.75 - Math.PI * 0.375,
      width: Math.random() * 120 + 60,
      speed: Math.random() * 0.0004 + 0.0002,
      phase: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.18 + 0.04,
    }));

    function draw(ts) {
      if (!startTime) startTime = ts;
      const t = (ts - startTime) * 0.001;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const originX = canvas.width * 0.5;
      const originY = -50;
      const rayLen = Math.max(canvas.width, canvas.height) * 2;

      rays.forEach(ray => {
        const sway = Math.sin(t * ray.speed * 1000 + ray.phase) * 0.12;
        const angle = ray.angle + sway;
        const endX = originX + Math.sin(angle) * rayLen;
        const endY = originY + Math.cos(angle) * rayLen;

        const pulse = (Math.sin(t * ray.speed * 2000 + ray.phase * 2) + 1) * 0.5;
        const opacity = ray.opacity * (0.6 + pulse * 0.4);

        const grad = ctx.createLinearGradient(originX, originY, endX, endY);
        grad.addColorStop(0, `rgba(50, 121, 249, ${opacity * 1.4})`);
        grad.addColorStop(0.35, `rgba(100, 160, 255, ${opacity})`);
        grad.addColorStop(1, `rgba(50, 80, 200, 0)`);

        ctx.save();
        ctx.beginPath();
        const halfW = ray.width * (0.7 + pulse * 0.3);
        ctx.moveTo(originX - Math.cos(angle) * halfW, originY + Math.sin(angle) * halfW);
        ctx.lineTo(originX + Math.cos(angle) * halfW, originY - Math.sin(angle) * halfW);
        ctx.lineTo(endX + Math.cos(angle) * halfW * 0.05, endY - Math.sin(angle) * halfW * 0.05);
        ctx.lineTo(endX - Math.cos(angle) * halfW * 0.05, endY + Math.sin(angle) * halfW * 0.05);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fill();
        ctx.restore();
      });

      lightRaysAnimId = requestAnimationFrame(draw);
    }

    if (lightRaysAnimId) cancelAnimationFrame(lightRaysAnimId);
    lightRaysAnimId = requestAnimationFrame(draw);
  }

  function stopLightRays() {
    if (lightRaysAnimId) {
      cancelAnimationFrame(lightRaysAnimId);
      lightRaysAnimId = null;
    }
    const canvas = document.getElementById('hero-light-rays');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  /* ─── CLIENT-SIDE SPA ROUTER ─────────────────────────── */
  const views = {
    '/': document.getElementById('view-home'),
    '/extension': document.getElementById('view-extension'),
    '/use-cases': document.getElementById('view-use-cases'),
    '/pricing': document.getElementById('view-pricing'),
    '/download': document.getElementById('view-download'),
    '/blog': document.getElementById('view-blog')
  };

  // Navigate to a specific route
  function navigate(path, updateState = true) {
    // Normalise path (remove trailing slash except root)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // Support query parameters mapping
    const url = new URL(path, window.location.origin);
    let route = url.pathname;
    const params = new URLSearchParams(url.search);
    const appParam = params.get('app');

    // Query parameters overrides matching Antigravity behavior
    if (appParam === 'branchdeck-extension') {
      route = '/extension';
    } else if (appParam === 'branchdeck-webapp') {
      route = '/';
    }

    // Active view toggles
    let foundRoute = false;
    Object.keys(views).forEach(key => {
      const view = views[key];
      if (view) {
        if (key === route) {
          view.classList.add('page-view--active');
          foundRoute = true;
          // Trigger animations specific to the active view
          onViewActivated(key, params);
        } else {
          view.classList.remove('page-view--active');
        }
      }
    });

    if (!foundRoute && views['/']) {
      views['/'].classList.add('page-view--active');
      route = '/';
      onViewActivated('/', params);
    }

    // Scroll back to top
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Update history state
    if (updateState) {
      const finalUrl = appParam ? `${route}?app=${appParam}` : route;
      window.history.pushState({ route: finalUrl }, '', finalUrl);
    }

    // Update active state in nav links
    updateNavLinks(route);
  }

  // Monitor link clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Check if it's an internal route link
    const isInternal = href.startsWith('/') || href.startsWith('?');
    const isDownloadTab = href.includes('tab=cli');
    const isAnchor = href.startsWith('#');

    if (isInternal) {
      e.preventDefault();
      // Handle special parameters redirects
      if (isDownloadTab) {
        navigate('/download', true);
        switchDownloadTab('cli');
      } else {
        navigate(href, true);
      }
      
      // Close mobile menu if open
      const linksMenu = document.getElementById('nav-links');
      const burger = document.getElementById('nav-burger');
      if (linksMenu && linksMenu.classList.contains('nav__links--open')) {
        linksMenu.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--active');
      }
    } else if (isAnchor) {
      // Allow scroll animations to waitlist CTA
      e.preventDefault();
      const target = document.getElementById(href.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

  // Monitor backward/forward buttons
  window.addEventListener('popstate', (e) => {
    const route = (e.state && e.state.route) || window.location.pathname + window.location.search;
    navigate(route, false);
  });

  // Highlight current nav tab
  function updateNavLinks(activeRoute) {
    const navLinks = document.querySelectorAll('.nav__links a[data-route], .nav__actions a[data-route]');
    navLinks.forEach(link => {
      const linkRoute = link.getAttribute('data-route');
      if (linkRoute === activeRoute) {
        link.style.color = 'var(--palette-blue-600)';
        link.style.fontWeight = '600';
      } else {
        link.style.color = '';
        link.style.fontWeight = '';
      }
    });
  }

  // View specific activations
  function onViewActivated(route, params) {
    if (route === '/') {
      // Trigger metric counts
      triggerMetricsCounters();
      // Ensure canvas particles run
      if (particleSystem) particleSystem.resume();
    } else {
      // Pause particles to optimize background processes
      if (particleSystem) particleSystem.pause();
    }

    if (route === '/use-cases') {
      const tabParam = params.get('tab');
      if (tabParam) switchUseCaseTab(tabParam);
    }
  }

  // Init routing on page load
  const initialRoute = window.location.pathname + window.location.search;
  navigate(initialRoute, false);


  /* ─── STAGGERED HERO TEXT ANIMATION ──────────────────── */
  const headline = document.getElementById('staggered-headline');
  if (headline) {
    const text = headline.textContent.trim();
    headline.innerHTML = '';
    let charIndex = 0;
    
    // Split text by word clusters
    const words = text.split(/\s+/);
    words.forEach((word, wIdx) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'split-word';
      
      const chars = word.split('');
      chars.forEach(char => {
        const charSpan = document.createElement('span');
        charSpan.className = 'split-char';
        charSpan.textContent = char;
        charSpan.style.setProperty('--delay', `${charIndex * 0.012}s`);
        wordSpan.appendChild(charSpan);
        charIndex++;
      });
      
      headline.appendChild(wordSpan);
      if (wIdx < words.length - 1) {
        headline.appendChild(document.createTextNode(' '));
      }
    });
  }


  /* ─── LIGHTWEIGHT CANVAS DATA FLOW SYSTEM (BACKGROUND) ── */
  class DataFlowSystem {
    constructor() {
      this.canvas = document.getElementById('particle-canvas');
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext('2d');
      this.nodes = [];
      this.edges = [];
      this.mouse = { x: null, y: null, radius: 140 };
      this.isActive = true;
      this.animationFrameId = null;

      this.init();
      this.bindEvents();
      this.animate();
    }

    init() {
      this.resizeCanvas();
      
      const nodeNames = [
        "gateway-api", "auth.controller", "auth.service", "user.repository", "Stripe API",
        "cache.redis", "db.postgres", "logger.service", "email.adapter"
      ];
      
      const cols = 3;
      const rows = 3;
      
      this.nodes = nodeNames.map((name, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        
        // Spread evenly across canvas grid cells with random offset
        const gridW = this.canvas.width / cols;
        const gridH = this.canvas.height / rows;
        const baseX = gridW * col + gridW / 2;
        const baseY = gridH * row + gridH / 2;
        
        return {
          x: baseX + (Math.random() - 0.5) * (gridW * 0.4),
          y: baseY + (Math.random() - 0.5) * (gridH * 0.4),
          baseX: baseX,
          baseY: baseY,
          name: name,
          width: name.length * 7 + 24,
          height: 28,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          glow: 0,
          scale: 1
        };
      });

      // Connections between components: index pairs
      this.edges = [
        { from: 0, to: 1, progress: 0.0, speed: 0.003 },
        { from: 1, to: 2, progress: 0.25, speed: 0.004 },
        { from: 2, to: 3, progress: 0.5, speed: 0.002 },
        { from: 2, to: 5, progress: 0.1, speed: 0.005 },
        { from: 3, to: 6, progress: 0.7, speed: 0.003 },
        { from: 0, to: 4, progress: 0.45, speed: 0.003 },
        { from: 1, to: 7, progress: 0.8, speed: 0.004 },
        { from: 4, to: 8, progress: 0.15, speed: 0.003 }
      ];
    }

    resizeCanvas() {
      const parent = this.canvas.parentElement;
      this.canvas.width = parent.offsetWidth;
      this.canvas.height = parent.offsetHeight;
    }

    bindEvents() {
      window.addEventListener('resize', () => {
        this.resizeCanvas();
        this.init();
      });

      const heroSection = this.canvas.closest('section');
      if (heroSection) {
        heroSection.addEventListener('mousemove', (e) => {
          const rect = this.canvas.getBoundingClientRect();
          this.mouse.x = e.clientX - rect.left;
          this.mouse.y = e.clientY - rect.top;
        });

        heroSection.addEventListener('mouseleave', () => {
          this.mouse.x = null;
          this.mouse.y = null;
        });
      }
    }

    animate = () => {
      if (!this.isActive) return;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 1. Draw connections/edges
      this.edges.forEach(edge => {
        const fromNode = this.nodes[edge.from];
        const toNode = this.nodes[edge.to];
        if (!fromNode || !toNode) return;

        // Draw dotted edge
        this.ctx.beginPath();
        this.ctx.setLineDash([4, 6]);
        this.ctx.moveTo(fromNode.x, fromNode.y);
        this.ctx.lineTo(toNode.x, toNode.y);
        this.ctx.strokeStyle = 'rgba(50, 121, 249, 0.12)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset line dash

        // Draw flowing data packets
        edge.progress += edge.speed;
        if (edge.progress > 1) edge.progress = 0;

        const packetX = fromNode.x + (toNode.x - fromNode.x) * edge.progress;
        const packetY = fromNode.y + (toNode.y - fromNode.y) * edge.progress;

        this.ctx.beginPath();
        this.ctx.arc(packetX, packetY, 3.5, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(50, 121, 249, 0.65)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = 'rgba(50, 121, 249, 0.5)';
        this.ctx.fill();
        this.ctx.shadowBlur = 0; // Reset shadow
      });

      // 2. Draw nodes
      this.nodes.forEach(node => {
        // Slow organic drift movement
        node.x += node.vx;
        node.y += node.vy;

        // Bounce back if node wanders too far from cell center
        const dx = node.x - node.baseX;
        const dy = node.y - node.baseY;
        if (Math.abs(dx) > 40) node.vx *= -1;
        if (Math.abs(dy) > 40) node.vy *= -1;

        // Mouse hover interaction check
        if (this.mouse.x !== null && this.mouse.y !== null) {
          const mdx = node.x - this.mouse.x;
          const mdy = node.y - this.mouse.y;
          const distance = Math.sqrt(mdx * mdx + mdy * mdy);

          if (distance < this.mouse.radius) {
            // Glow and subtle scaling
            node.glow = Math.min(1, node.glow + 0.08);
            node.scale = Math.min(1.08, node.scale + 0.01);
            
            // Connect hovered node to mouse cursor with fine line
            this.ctx.beginPath();
            this.ctx.setLineDash([2, 4]);
            this.ctx.moveTo(node.x, node.y);
            this.ctx.lineTo(this.mouse.x, this.mouse.y);
            this.ctx.strokeStyle = `rgba(50, 121, 249, ${0.1 * (1 - distance / this.mouse.radius)})`;
            this.ctx.stroke();
            this.ctx.setLineDash([]);
          } else {
            node.glow = Math.max(0, node.glow - 0.05);
            node.scale = Math.max(1, node.scale - 0.008);
          }
        } else {
          node.glow = Math.max(0, node.glow - 0.05);
          node.scale = Math.max(1, node.scale - 0.008);
        }

        const w = node.width * node.scale;
        const h = node.height * node.scale;

        // Node card background
        this.ctx.beginPath();
        this.ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, 6);
        this.ctx.fillStyle = node.glow > 0 
          ? `rgba(240, 244, 255, ${0.5 + node.glow * 0.3})`
          : 'rgba(248, 250, 252, 0.45)';
        this.ctx.fill();

        // Node card border
        this.ctx.strokeStyle = node.glow > 0
          ? `rgba(50, 121, 249, ${0.18 + node.glow * 0.2})`
          : 'rgba(50, 121, 249, 0.08)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // Node card code name label
        this.ctx.font = '10px "Google Sans Code", "JetBrains Mono", monospace';
        this.ctx.fillStyle = node.glow > 0
          ? `rgba(50, 121, 249, ${0.7 + node.glow * 0.3})`
          : 'rgba(50, 121, 249, 0.45)';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(node.name, node.x, node.y);
      });

      this.animationFrameId = requestAnimationFrame(this.animate);
    }

    pause() {
      this.isActive = false;
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    }

    resume() {
      if (this.isActive) return;
      this.isActive = true;
      this.animate();
    }
  }

  const particleSystem = new DataFlowSystem();


  /* ─── METRIC BAND COUNTER ANIMATION ──────────────────── */
  let metricsAnimated = false;
  
  function triggerMetricsCounters() {
    if (metricsAnimated) return;
    
    const elements = document.querySelectorAll('.metric__value');
    if (elements.length === 0) return;

    // Direct initialization helper (for robust triggering)
    setTimeout(animateMetrics, 150);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateMetrics();
          observer.disconnect();
        }
      });
    }, { threshold: 0.15 });

    elements.forEach(el => observer.observe(el));
  }

  function animateMetrics() {
    if (metricsAnimated) return;
    metricsAnimated = true;

    const values = document.querySelectorAll('.metric__value');
    const duration = 1800;

    values.forEach(el => {
      const target = parseInt(el.getAttribute('data-target'), 10);
      const start = 0;
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeProgress = progress * (2 - progress);
        const currentVal = Math.floor(start + easeProgress * (target - start));
        
        el.textContent = currentVal.toLocaleString() + (target === 2400 ? '+' : '');
        
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = target.toLocaleString() + (target === 2400 ? '+' : '');
        }
      }

      requestAnimationFrame(update);
    });
  }


  /* ─── ON-SCROLL REVEAL TRIGGERS ───────────────────────── */
  const revealElements = document.querySelectorAll('.scroll-reveal');
  if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('scroll-reveal--active');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));
  }


  /* ─── INTERACTIVE TAB SWITCHING DEMO CARD ─────────────── */
  const demoTabs = document.querySelectorAll('.demo-tab');
  const demoPanes = document.querySelectorAll('.demo-pane');

  demoTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all
      demoTabs.forEach(t => t.classList.remove('demo-tab--active'));
      demoPanes.forEach(p => p.classList.remove('demo-pane--active'));

      // Activate clicked
      tab.classList.add('demo-tab--active');
      const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
      if (targetPane) {
        targetPane.classList.add('demo-pane--active');
        resetPaneAnimations(tab.dataset.tab);
      }
    });
  });

  function resetPaneAnimations(tabName) {
    if (tabName === 'flow') {
      const nodes = document.querySelectorAll('.flow-node');
      const connectors = document.querySelectorAll('.flow-connector');
      nodes.forEach(node => {
        node.style.animation = 'none';
        node.offsetHeight; // trigger reflow
        node.style.animation = '';
      });
      connectors.forEach(conn => {
        conn.style.animation = 'none';
        conn.offsetHeight; // trigger reflow
        conn.style.animation = '';
      });
    } else if (tabName === 'impact') {
      const stats = document.querySelectorAll('.impact-stat');
      const items = document.querySelectorAll('.impact-item');
      stats.forEach(s => {
        s.style.animation = 'none';
        s.offsetHeight;
        s.style.animation = '';
      });
      items.forEach(item => {
        item.style.animation = 'none';
        item.offsetHeight;
        item.style.animation = '';
      });
    } else if (tabName === 'map') {
      const items = document.querySelectorAll('.feature-item');
      items.forEach(item => {
        item.style.animation = 'none';
        item.offsetHeight;
        item.style.animation = '';
      });
    }
  }


  /* ─── USE CASES VIEW CONTROLS ──────────────────────────── */
  const ucTabs = document.querySelectorAll('.uc-tab');
  const ucPanes = document.querySelectorAll('.uc-content-pane');

  ucTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const ucName = tab.dataset.uc;
      switchUseCaseTab(ucName);
    });
  });

  function switchUseCaseTab(ucName) {
    ucTabs.forEach(t => {
      if (t.dataset.uc === ucName) {
        t.classList.add('uc-tab--active');
      } else {
        t.classList.remove('uc-tab--active');
      }
    });

    ucPanes.forEach(pane => {
      if (pane.id === `uc-pane-${ucName}`) {
        pane.classList.add('uc-content-pane--active');
      } else {
        pane.classList.remove('uc-content-pane--active');
      }
    });
  }


  /* ─── DOWNLOAD VIEW CONTROLS ───────────────────────────── */
  const downloadTabs = document.querySelectorAll('.download-tab-btn');
  const downloadPanes = document.querySelectorAll('.download-pane');

  downloadTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const dtabName = tab.dataset.dtab;
      switchDownloadTab(dtabName);
    });
  });

  function switchDownloadTab(dtabName) {
    downloadTabs.forEach(t => {
      if (t.dataset.dtab === dtabName) {
        t.classList.add('download-tab-btn--active');
      } else {
        t.classList.remove('download-tab-btn--active');
      }
    });

    downloadPanes.forEach(pane => {
      if (pane.id === `dpath-${dtabName}`) {
        pane.classList.add('download-pane--active');
      } else {
        pane.classList.remove('download-pane--active');
      }
    });
  }


  /* ─── COPY CODE TO CLIPBOARD HELPER ────────────────────── */
  const copyButtons = document.querySelectorAll('.cli-copy-btn');
  
  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const codeText = btn.dataset.clipboard;
      if (!codeText) return;

      navigator.clipboard.writeText(codeText).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied! ✓';
        btn.style.color = '#10B981';
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = '';
        }, 2000);
      }).catch(err => {
        console.error('Could not copy text: ', err);
      });
    });
  });


  /* ─── BLOG POSTS FILTER CATEGORY ───────────────────────── */
  const filterBtns = document.querySelectorAll('.blog-filter-btn');
  const blogPosts = document.querySelectorAll('.blog-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      
      // Update filter active states
      filterBtns.forEach(b => b.classList.remove('blog-filter-btn--active'));
      btn.classList.add('blog-filter-btn--active');

      // Filter articles
      blogPosts.forEach(post => {
        if (category === 'all' || post.dataset.cat === category) {
          post.style.display = 'flex';
          post.style.animation = 'pane-fade-in 0.3s ease-out forwards';
        } else {
          post.style.display = 'none';
        }
      });
    });
  });


  /* ─── FORM SUBMISSIONS HANDLER ─────────────────────────── */
  const newsletterForm = document.getElementById('newsletter-form');
  
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const input = document.getElementById('newsletter-email');
      const submitBtn = document.getElementById('newsletter-submit');
      const email = input.value.trim();

      if (!validateEmail(email)) {
        showFormFeedback(input, 'Please specify a valid email address.', false);
        return;
      }

      // Update button to loading state
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Requesting...';

      // Resolve Web App base URL for local development vs production Vercel deployment
      const baseUrl = window.location.origin;

      try {
        const res = await fetch(`${baseUrl}/api/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: email.split('@')[0],
            email: email,
            company: 'Landing Signup',
            role: 'Developer'
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to request early access.');
        }

        // Success visual updates
        submitBtn.textContent = 'Requested! ✓';
        submitBtn.style.backgroundColor = '#10B981';
        submitBtn.style.borderColor = '#10B981';
        submitBtn.style.color = '#fff';
        input.value = '';
        
        showFormFeedback(input, 'Success! We have saved your spot.', true);
      } catch (err) {
        showFormFeedback(input, err.message, false);
      } finally {
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          submitBtn.style.backgroundColor = '';
          submitBtn.style.borderColor = '';
          submitBtn.style.color = '';
        }, 4000);
      }
    });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showFormFeedback(inputEl, message, isSuccess) {
    // Delete existing feedback messages
    const parent = inputEl.parentElement;
    const existing = parent.querySelector('.form-feedback');
    if (existing) existing.remove();

    const feedback = document.createElement('div');
    feedback.className = 'form-feedback';
    feedback.textContent = message;
    feedback.style.fontSize = '0.8rem';
    feedback.style.marginTop = '8px';
    feedback.style.fontWeight = '500';
    feedback.style.color = isSuccess ? '#10b981' : '#ef4444';
    feedback.style.textAlign = 'left';

    parent.after(feedback);

    if (!isSuccess) {
      inputEl.style.borderColor = '#ef4444';
      setTimeout(() => {
        inputEl.style.borderColor = '';
      }, 3000);
    } else {
      setTimeout(() => {
        feedback.remove();
      }, 4000);
    }
  }


  /* ─── BURGER MOBILE MENU DRAWER ────────────────────────── */
  const burger = document.getElementById('nav-burger');
  const linksMenu = document.getElementById('nav-links');

  if (burger && linksMenu) {
    burger.addEventListener('click', () => {
      linksMenu.classList.toggle('nav__links--open');
      burger.classList.toggle('nav__burger--active');
    });
  }
});
