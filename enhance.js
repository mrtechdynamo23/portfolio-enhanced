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
     2. Custom cursor
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion && isFinePointer) {
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');

    if (dot && ring) {
      document.body.classList.add('has-custom-cursor');

      let mouseX = window.innerWidth / 2;
      let mouseY = window.innerHeight / 2;
      let ringX = mouseX;
      let ringY = mouseY;

      let isAnimatingRing = false;

      function animateRing() {
        const dx = mouseX - ringX;
        const dy = mouseY - ringY;
        ringX += dx * 0.18;
        ringY += dy * 0.18;
        ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

        if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
          requestAnimationFrame(animateRing);
        } else {
          isAnimatingRing = false;
        }
      }

      window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
        if (!isAnimatingRing) {
          isAnimatingRing = true;
          requestAnimationFrame(animateRing);
        }
      }, { passive: true });

      const attachHoverListeners = () => {
        document
          .querySelectorAll('a, button, .filter-btn, .testimonial-dot, .back-to-top, .navbar__resume-btn, .modal-box__close, .project-card__expand')
          .forEach((el) => {
            if (el.dataset.cursorBound) return;
            el.dataset.cursorBound = 'true';
            el.addEventListener('mouseenter', () => {
              ring.classList.add('cursor-ring--hover');
              dot.style.opacity = '0';
            });
            el.addEventListener('mouseleave', () => {
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
              ring.classList.add('cursor-ring--card');
            });
            el.addEventListener('mouseleave', () => {
              ring.classList.remove('cursor-ring--card');
            });
          });
      };
      attachHoverListeners();
      // Re-scan after content is injected/filtered (modal, testimonials, filters)
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
        btn.style.transform = `translate(${x * 0.2}px, ${y * 0.3}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     9. Ambient particle background
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion && window.innerWidth > 768) {
    const canvas = document.getElementById('particles-canvas');

    if (canvas) {
      const ctx = canvas.getContext('2d');
      let width, height, particles;
      const PARTICLE_COUNT = 22;
      const LINK_DIST = 110;
      const LINK_DIST_SQ = LINK_DIST * LINK_DIST;

      function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      }

      function initParticles() {
        particles = Array.from({ length: PARTICLE_COUNT }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          r: Math.random() * 1.2 + 0.5,
        }));
      }

      resize();
      initParticles();
      window.addEventListener('resize', resize);

      let isRunning = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          isRunning = false;
        } else if (!isRunning) {
          isRunning = true;
          requestAnimationFrame(draw);
        }
      });

      function draw() {
        if (!isRunning) return;
        ctx.clearRect(0, 0, width, height);

        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(92, 200, 255, 0.28)';
          ctx.fill();
        });

        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distSq = dx * dx + dy * dy;
            if (distSq < LINK_DIST_SQ) {
              const dist = Math.sqrt(distSq);
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(56, 214, 192, ${0.11 * (1 - dist / LINK_DIST)})`;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(draw);
      }
      draw();
    }
  }
})();
