/**
 * enhance.js — Additional interactions layered on top of script.js
 * ──────────────────────────────────────────────────────────────
 * - Scroll progress bar
 * - Custom cursor (fine-pointer devices only)
 * - Animated stat counters
 * - Project filter + detail modal
 * - Testimonials slider
 * - Back-to-top button
 * - Magnetic buttons
 * - Ambient particle canvas background
 * All effects respect prefers-reduced-motion.
 */

(function () {
  'use strict';

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;

  /* ══════════════════════════════════════════════════════
     1. Scroll progress bar
     ══════════════════════════════════════════════════════ */

  const progressBar = document.getElementById('scroll-progress');
  function updateProgress() {
    if (!progressBar) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ══════════════════════════════════════════════════════
     2. Custom cursor & Minor Comet Tail
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion && isFinePointer) {
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    const tailDots = document.querySelectorAll('.cursor-tail__dot');

    if (dot && ring) {
      document.body.classList.add('has-custom-cursor');

      let mouseX = window.innerWidth / 2;
      let mouseY = window.innerHeight / 2;
      let prevMouseX = mouseX;
      let prevMouseY = mouseY;
      let ringX = mouseX;
      let ringY = mouseY;
      let isHovering = false;
      let isLoopRunning = false;

      // 5 trailing micro-nodes for a sleek, subtle cursor tail
      const tailPos = [
        { x: mouseX, y: mouseY },
        { x: mouseX, y: mouseY },
        { x: mouseX, y: mouseY },
        { x: mouseX, y: mouseY },
        { x: mouseX, y: mouseY }
      ];
      const tailSizes = [4.5, 3.8, 3.0, 2.2, 1.5];
      const tailAlphas = [0.72, 0.54, 0.38, 0.24, 0.12];

      // Pre-set fixed dimensions once (avoids layout reflows on every animation frame)
      tailDots.forEach((el, i) => {
        el.style.width = tailSizes[i] + 'px';
        el.style.height = tailSizes[i] + 'px';
      });

      window.addEventListener('mousedown', () => {
        dot.classList.add('cursor-dot--active');
        ring.classList.add('cursor-ring--active');
      });
      window.addEventListener('mouseup', () => {
        dot.classList.remove('cursor-dot--active');
        ring.classList.remove('cursor-ring--active');
      });

      function wakeLoop() {
        if (!isLoopRunning && !document.hidden) {
          isLoopRunning = true;
          requestAnimationFrame(renderCursor);
        }
      }

      window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
        wakeLoop();
      }, { passive: true });

      window.addEventListener('mouseleave', () => {
        dot.style.opacity = '0';
        ring.style.opacity = '0';
        tailDots.forEach((d) => { d.style.opacity = '0'; });
      });

      window.addEventListener('mouseenter', () => {
        dot.style.opacity = '1';
        ring.style.opacity = '1';
        wakeLoop();
      });

      // Completely pause animation loop when tab is in background
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          isLoopRunning = false;
        } else {
          wakeLoop();
        }
      });

      function renderCursor() {
        if (document.hidden) {
          isLoopRunning = false;
          return;
        }

        // Smooth ring lerp
        const rdx = mouseX - ringX;
        const rdy = mouseY - ringY;
        ringX += rdx * 0.22;
        ringY += rdy * 0.22;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;

        // Minor tail physics (chained spring lag)
        tailPos[0].x += (mouseX - tailPos[0].x) * 0.52;
        tailPos[0].y += (mouseY - tailPos[0].y) * 0.52;
        let maxTailDelta = Math.hypot(mouseX - tailPos[0].x, mouseY - tailPos[0].y);

        for (let i = 1; i < tailPos.length; i++) {
          tailPos[i].x += (tailPos[i - 1].x - tailPos[i].x) * 0.44;
          tailPos[i].y += (tailPos[i - 1].y - tailPos[i].y) * 0.44;
          const d = Math.hypot(tailPos[i - 1].x - tailPos[i].x, tailPos[i - 1].y - tailPos[i].y);
          if (d > maxTailDelta) maxTailDelta = d;
        }

        const speed = Math.hypot(mouseX - prevMouseX, mouseY - prevMouseY);
        prevMouseX = mouseX;
        prevMouseY = mouseY;
        const showTail = speed > 0.4 && !isHovering;

        for (let i = 0; i < tailDots.length; i++) {
          tailDots[i].style.transform = `translate3d(${tailPos[i].x}px, ${tailPos[i].y}px, 0) translate(-50%, -50%)`;
          tailDots[i].style.opacity = showTail ? tailAlphas[i] : '0';
        }

        // Zero-CPU idle sleep: when motion stops and nodes have settled, stop requestAnimationFrame loop
        const ringDist = Math.hypot(rdx, rdy);
        if (speed < 0.05 && ringDist < 0.1 && maxTailDelta < 0.1) {
          ringX = mouseX;
          ringY = mouseY;
          ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
          for (let i = 0; i < tailDots.length; i++) {
            tailDots[i].style.opacity = '0';
          }
          isLoopRunning = false;
          return; // Dormant until next mousemove
        }

        requestAnimationFrame(renderCursor);
      }

      // Initial wake up to place cursor elements
      wakeLoop();

      const attachHoverListeners = () => {
        document
          .querySelectorAll('a, button, .filter-btn, .testimonial-dot, .back-to-top, .navbar__resume-btn, .modal-box__close, .project-card__expand, .theme-toggle')
          .forEach((el) => {
            if (el.dataset.cursorBound) return;
            el.dataset.cursorBound = 'true';
            el.addEventListener('mouseenter', () => {
              isHovering = true;
              ring.classList.add('cursor-ring--hover');
              dot.style.opacity = '0';
            });
            el.addEventListener('mouseleave', () => {
              isHovering = false;
              ring.classList.remove('cursor-ring--hover');
              dot.style.opacity = '1';
            });
          });

        document
          .querySelectorAll(
            '.project-card, .research-card, .stat-card, .edu-card, .writing-card, .repo-chip, .contact-link, .cert-card, .achievement-card'
          )
          .forEach((el) => {
            if (el.dataset.cursorCardBound) return;
            el.dataset.cursorCardBound = 'true';
            el.addEventListener('mouseenter', () => {
              isHovering = true;
              ring.classList.add('cursor-ring--card');
            });
            el.addEventListener('mouseleave', () => {
              isHovering = false;
              ring.classList.remove('cursor-ring--card');
            });
          });
      };
      attachHoverListeners();
      window.addEventListener('load', attachHoverListeners);
      setTimeout(attachHoverListeners, 800);
    }
  }

  /* ══════════════════════════════════════════════════════
     3. Animated stat counters
     ══════════════════════════════════════════════════════ */

  const statNumbers = document.querySelectorAll('.stat-card__number');
  if (statNumbers.length) {
    const animateCount = (el) => {
      const target = parseFloat(el.getAttribute('data-count-to'));
      const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      const suffix = el.getAttribute('data-suffix') || '';

      if (prefersReducedMotion || Number.isNaN(target)) {
        el.textContent = target.toFixed(decimals) + suffix;
        return;
      }

      const duration = 1400;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = target.toFixed(decimals) + suffix;
      }
      requestAnimationFrame(tick);
    };

    const statsObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            statsObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    statNumbers.forEach((el) => statsObserver.observe(el));
  }

  /* ══════════════════════════════════════════════════════
     4. Project filters
     ══════════════════════════════════════════════════════ */

  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card[data-category]');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');

      projectCards.forEach((card) => {
        const cats = (card.getAttribute('data-category') || '').split(' ');
        const show = filter === 'all' || cats.includes(filter);

        if (show) {
          card.classList.remove('is-hidden');
          card.classList.remove('is-filtering');
          void card.offsetWidth; // restart animation
          if (!prefersReducedMotion) card.classList.add('is-filtering');
        } else {
          card.classList.add('is-hidden');
        }
      });
    });
  });

  /* ══════════════════════════════════════════════════════
     5. Project detail modal
     ══════════════════════════════════════════════════════ */

  const modalOverlay = document.getElementById('project-modal');
  const modalIcon = document.getElementById('modal-icon');
  const modalTitle = document.getElementById('modal-title');
  const modalDescription = document.getElementById('modal-description');
  const modalStack = document.getElementById('modal-stack');
  const modalLinks = document.getElementById('modal-links');

  function openModal(card) {
    if (!modalOverlay || !card) return;
    const icon = card.querySelector('.project-card__icon');
    const title = card.querySelector('.project-card__title');
    const description = card.querySelector('.project-card__description');
    const stack = card.querySelector('.project-card__stack');
    const links = card.querySelector('.project-card__links');

    if (modalIcon && icon) modalIcon.innerHTML = icon.innerHTML;
    if (modalTitle && title) modalTitle.textContent = title.textContent;
    if (modalDescription && description) modalDescription.innerHTML = description.innerHTML;
    if (modalStack && stack) modalStack.innerHTML = stack.innerHTML;
    if (modalLinks && links) modalLinks.innerHTML = links.innerHTML;

    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.project-card__expand').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(btn.closest('.project-card'));
    });
  });

  const modalClose = document.getElementById('modal-close');
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  /* ══════════════════════════════════════════════════════
     6. Testimonials slider
     ══════════════════════════════════════════════════════ */

  const track = document.getElementById('testimonial-track');
  const dotsContainer = document.getElementById('testimonial-dots');

  if (track) {
    const slides = track.children;
    let current = 0;
    const dots = [];

    if (dotsContainer && slides.length > 1) {
      Array.from(slides).forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
        dots.push(dot);
      });
    }

    function goTo(index) {
      current = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }

    let autoplay;
    function startAutoplay() {
      if (prefersReducedMotion || slides.length < 2) return;
      autoplay = setInterval(() => goTo(current + 1), 5000);
    }
    function stopAutoplay() {
      clearInterval(autoplay);
    }
    startAutoplay();

    const slider = document.querySelector('.testimonial-slider');
    if (slider) {
      slider.addEventListener('mouseenter', stopAutoplay);
      slider.addEventListener('mouseleave', startAutoplay);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });
  }

  /* ══════════════════════════════════════════════════════
     7. Back to top
     ══════════════════════════════════════════════════════ */

  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    window.addEventListener(
      'scroll',
      () => {
        backToTop.classList.toggle('visible', window.scrollY > 600);
      },
      { passive: true }
    );
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* ══════════════════════════════════════════════════════
     8. Magnetic buttons
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion && isFinePointer) {
    document.querySelectorAll('.btn, .filter-btn').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        // Subtle tactile response without overshooting
        btn.style.transform = `translate(${x * 0.12}px, ${y * 0.16}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }



  /* ══════════════════════════════════════════════════════
     10. Theme Toggle Controller (Dark / Light)
     ══════════════════════════════════════════════════════ */

  const themeToggle = document.getElementById('theme-toggle');

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function applyTheme(theme, animate = true) {
    const html = document.documentElement;

    if (animate) {
      html.classList.add('theme-transition');
    }

    html.setAttribute('data-theme', theme);

    try {
      localStorage.setItem('portfolio-theme', theme);
    } catch (e) {}

    // Update accessible labels
    if (themeToggle) {
      const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
      const title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
      themeToggle.setAttribute('aria-label', label);
      themeToggle.setAttribute('title', title);
    }

    // Dispatch global theme change event for WebGL / canvas modules
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));

    if (animate) {
      setTimeout(() => {
        html.classList.remove('theme-transition');
      }, 300);
    }
  }

  if (themeToggle) {
    // Initial sync of accessible label
    const initialTheme = getTheme();
    themeToggle.setAttribute(
      'aria-label',
      initialTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
    );
    themeToggle.setAttribute(
      'title',
      initialTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'
    );

    themeToggle.addEventListener('click', () => {
      const current = getTheme();
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next, true);
    });

    // Listen to system preference changes if user hasn't explicitly set preference
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        try {
          if (!localStorage.getItem('portfolio-theme')) {
            applyTheme(e.matches ? 'dark' : 'light', true);
          }
        } catch (err) {}
      });
    }
  }
})();
