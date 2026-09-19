/**
 * script.js — Portfolio Interactions & Animations
 * ─────────────────────────────────────────────────
 * - Typing effect in hero tagline
 * - IntersectionObserver scroll-reveal
 * - Sticky nav styling
 * - Active nav link tracking
 * - Mobile nav toggle
 * - Subtle parallax on decorative shapes
 * - All animations respect prefers-reduced-motion
 */

(function () {
  'use strict';

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ══════════════════════════════════════════════════════
     1. Typing Effect
     ══════════════════════════════════════════════════════ */

  const typedEl = document.getElementById('typed-text');
  if (typedEl) {
    const phrases = [
      'Full Stack Developer',
      'AI Enthusiast',
      'Open to Collaborate',
      'Building with LLMs & LangChain',
      'Passionate Problem Solver',
    ];

    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const TYPING_SPEED = 80;
    const DELETING_SPEED = 40;
    const PAUSE_AFTER_TYPE = 2000;
    const PAUSE_AFTER_DELETE = 500;

    function typeLoop() {
      const current = phrases[phraseIndex];

      if (!isDeleting) {
        typedEl.textContent = current.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === current.length) {
          isDeleting = true;
          setTimeout(typeLoop, PAUSE_AFTER_TYPE);
          return;
        }
        setTimeout(typeLoop, TYPING_SPEED + Math.random() * 40);
      } else {
        typedEl.textContent = current.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          setTimeout(typeLoop, PAUSE_AFTER_DELETE);
          return;
        }
        setTimeout(typeLoop, DELETING_SPEED);
      }
    }

    // Start typing after a short delay
    if (!prefersReducedMotion) {
      setTimeout(typeLoop, 1200);
    } else {
      // Static fallback
      typedEl.textContent = phrases[0];
    }
  }

  /* ══════════════════════════════════════════════════════
     2. Scroll-Reveal (IntersectionObserver)
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion) {
    const revealEls = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -60px 0px',
      }
    );

    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    // Make everything visible immediately
    document.querySelectorAll('.reveal').forEach((el) => {
      el.classList.add('visible');
    });
  }

  /* ══════════════════════════════════════════════════════
     3. Navbar — Scroll-aware styling
     ══════════════════════════════════════════════════════ */

  const navbar = document.getElementById('navbar');

  function updateNavbar() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar();

  /* ══════════════════════════════════════════════════════
     4. Active nav link tracking
     ══════════════════════════════════════════════════════ */

  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.navbar__links a[href^="#"]');

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach((link) => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${id}`) {
              link.classList.add('active');
            }
          });
        }
      });
    },
    {
      threshold: 0.2,
      rootMargin: '-64px 0px -40% 0px',
    }
  );

  sections.forEach((section) => sectionObserver.observe(section));

  /* ══════════════════════════════════════════════════════
     5. Mobile nav toggle
     ══════════════════════════════════════════════════════ */

  const navToggle = document.getElementById('nav-toggle');
  const navLinksEl = document.getElementById('nav-links');

  if (navToggle && navLinksEl) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinksEl.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen);

      // Swap icon between hamburger and X
      if (isOpen) {
        navToggle.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>`;
      } else {
        navToggle.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>`;
      }
    });

    // Close menu when a link is clicked
    navLinksEl.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinksEl.classList.remove('open');
        navToggle.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>`;
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     6. Smooth scroll for anchor links (fallback + offset)
     ══════════════════════════════════════════════════════ */

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const offsetTop = target.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({
          top: offsetTop,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }
    });
  });

  /* ══════════════════════════════════════════════════════
     7. Decorative floating shapes are animated smoothly
        via pure GPU CSS keyframes (orbFloat) with 0 JS overhead
     ══════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════
     8. Card hover tilt micro-interaction
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion) {
    const tiltCards = document.querySelectorAll(
      '.project-card, .research-card, .stat-card, .cert-card, .achievement-card'
    );

    tiltCards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);

        const rotateX = ((y - centerY) / centerY) * -2.5;
        const rotateY = ((x - centerX) / centerX) * 2.5;

        card.style.transform =
          `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     9. Skill tag stagger animation on scroll
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion) {
    const skillTags = document.querySelectorAll('.skill-tag');
    skillTags.forEach((tag, i) => {
      tag.style.opacity = '0';
      tag.style.transform = 'translateY(10px) scale(0.95)';
      tag.style.transition = `opacity 0.4s ease ${i * 30}ms, transform 0.4s ease ${i * 30}ms`;
    });

    const skillsSection = document.getElementById('skills');
    if (skillsSection) {
      const skillObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              skillTags.forEach((tag) => {
                tag.style.opacity = '1';
                tag.style.transform = 'translateY(0) scale(1)';
              });
              skillObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      skillObserver.observe(skillsSection);
    }
  }

  /* ══════════════════════════════════════════════════════
     10. Timeline dot animation
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion) {
    const timelineDots = document.querySelectorAll('.timeline__dot');
    timelineDots.forEach((dot) => {
      dot.style.transform = 'scale(0)';
      dot.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });

    const timelineItems = document.querySelectorAll('.timeline__item');
    const dotObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const dot = entry.target.querySelector('.timeline__dot');
            if (dot) dot.style.transform = 'scale(1)';
            dotObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );
    timelineItems.forEach((item) => dotObserver.observe(item));
  }

  /* ══════════════════════════════════════════════════════
     11. Strength pills hover ripple
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion) {
    const strengthPills = document.querySelectorAll('.strength-pill');
    strengthPills.forEach((pill, i) => {
      pill.style.opacity = '0';
      pill.style.transform = 'translateY(8px)';
      pill.style.transition = `opacity 0.4s ease ${i * 60}ms, transform 0.4s ease ${i * 60}ms, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease`;
    });

    const strengthsContainer = document.querySelector('.strengths');
    if (strengthsContainer) {
      const strengthObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              strengthPills.forEach((pill) => {
                pill.style.opacity = '1';
                pill.style.transform = 'translateY(0)';
              });
              strengthObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      strengthObserver.observe(strengthsContainer);
    }
  }

  /* ══════════════════════════════════════════════════════
     12. Certification items stagger
     ══════════════════════════════════════════════════════ */

  if (!prefersReducedMotion) {
    const certItems = document.querySelectorAll('.cert-item');
    certItems.forEach((item, i) => {
      item.style.opacity = '0';
      item.style.transform = 'translateX(-12px)';
      item.style.transition = `opacity 0.35s ease ${i * 50}ms, transform 0.35s ease ${i * 50}ms, border-color 0.3s ease`;
    });

    const certsContainer = document.querySelector('.certs-list');
    if (certsContainer) {
      const certObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              certItems.forEach((item) => {
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
              });
              certObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );
      certObserver.observe(certsContainer);
    }
  }

  /* ══════════════════════════════════════════════════════
     13. Hero content fade-in on load
     ══════════════════════════════════════════════════════ */

  // Hero reveals are triggered immediately since they're in the viewport
  window.addEventListener('load', () => {
    document.querySelectorAll('.hero .reveal').forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('visible');
      }, 200 + i * 150);
    });
  });

})();
