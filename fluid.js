/**
 * fluid.js — WebGL2 Navier-Stokes Fluid Simulation
 * ──────────────────────────────────────────────────
 * GPU-accelerated fluid dynamics for the hero section.
 * Reacts to mouse / touch movement; auto-animates when idle.
 * Respects prefers-reduced-motion by falling back to a gentle gradient.
 *
 * Shader pipeline per frame:
 *   1. External forces  →  splat velocity + dye at pointer
 *   2. Advection        →  move velocity field through itself
 *   3. Diffusion        →  (implicit in advection damping)
 *   4. Divergence       →  compute ∇·v
 *   5. Pressure solve   →  Jacobi iterations to find p where ∇²p = ∇·v
 *   6. Gradient sub     →  v ← v − ∇p  (make divergence-free)
 *   7. Advect dye       →  move color through corrected velocity
 *   8. Display          →  render dye to screen
 */

(function () {
  'use strict';

  /* ── configuration ───────────────────────────────────── */

  const CONFIG = {
    SIM_RESOLUTION: 96,         // optimized simulation grid
    DYE_RESOLUTION: 512,        // lightweight dye texture resolution
    PRESSURE_ITERATIONS: 12,    // fast Jacobi solver iterations (reduces GPU passes)
    CURL: 25,                   // vorticity confinement
    SPLAT_RADIUS: 0.22,         // normalised radius of each splat
    SPLAT_FORCE: 5500,
    VELOCITY_DISSIPATION: 0.25,
    DENSITY_DISSIPATION: 1.1,
    // Accent colours (Dark Obsidian + Midnight Navy + Electric Cyan + Teal palette)
    COLORS: [
      [0.36, 0.78, 1.0],   // #5CC8FF  electric cyan
      [0.22, 0.84, 0.75],  // #38D6C0  vibrant teal
      [0.66, 0.91, 1.0],   // #A8E7FF  soft ice-blue highlight
      [0.11, 0.44, 0.65],  // #1D6FA5  deep ocean blue
      [0.15, 0.72, 0.88],  // luminous cyan-teal bridge
    ],
    AUTO_SPLAT_INTERVAL: 2400,  // ms between subtle ambient splats
  };

  /* ── canvas setup ────────────────────────────────────── */

  const canvas = document.getElementById('fluid-canvas');
  if (!canvas) return;

  // Respect prefers-reduced-motion
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    antialias: false,
  });

  if (!gl) {
    // WebGL2 not available — degrade gracefully
    applyFallbackGradient();
    return;
  }

  // Graceful fallback function (Cyan & Teal atmospheric radials)
  function applyFallbackGradient() {
    canvas.style.background =
      'radial-gradient(ellipse at 30% 40%, rgba(92,200,255,0.12), transparent 60%),' +
      'radial-gradient(ellipse at 70% 60%, rgba(56,214,192,0.08), transparent 50%)';
  }

  // Handle WebGL context loss gracefully
  let animFrameId = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(animFrameId);
    applyFallbackGradient();
  });

  /* ── WebGL helpers ───────────────────────────────────── */

  // Always enable float color buffer extension — required for
  // both half-float and full-float render targets in WebGL2
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  const floatLinear = gl.getExtension('OES_texture_half_float_linear');

  // Determine best internal format — try half-float first,
  // fall back to full-float if framebuffer is incomplete
  let texType, formatRG, formatRGBA;

  function testFBO(intFmt, fmt, type) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, intFmt, 4, 4, 0, fmt, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  // Try half-float first, then full-float
  if (testFBO(gl.RG16F, gl.RG, gl.HALF_FLOAT)) {
    texType = gl.HALF_FLOAT;
    formatRG = gl.RG16F;
    formatRGBA = gl.RGBA16F;
  } else if (testFBO(gl.RG32F, gl.RG, gl.FLOAT)) {
    texType = gl.FLOAT;
    formatRG = gl.RG32F;
    formatRGBA = gl.RGBA32F;
  } else {
    // Neither float format works — fall back to gradient
    applyFallbackGradient();
    return;
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vsSource, fsSource) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    // Cache uniform locations
    const uniforms = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { program: prog, uniforms };
  }

  /* ── Framebuffer helpers ─────────────────────────────── */

  function createFBO(w, h, intFmt, fmt, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, intFmt, w, h, 0, fmt, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Verify framebuffer completeness
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn('Fluid sim: Framebuffer incomplete, status:', status);
    }

    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      attach(unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return unit;
      },
    };
  }

  function createDoubleFBO(w, h, intFmt, fmt, type, filter) {
    let fbo1 = createFBO(w, h, intFmt, fmt, type, filter);
    let fbo2 = createFBO(w, h, intFmt, fmt, type, filter);
    return {
      width: w,
      height: h,
      texelSizeX: 1.0 / w,
      texelSizeY: 1.0 / h,
      get read() { return fbo1; },
      set read(v) { fbo1 = v; },
      get write() { return fbo2; },
      set write(v) { fbo2 = v; },
      swap() { const tmp = fbo1; fbo1 = fbo2; fbo2 = tmp; },
    };
  }

  /* ── Shader sources ──────────────────────────────────── */

  const baseVS = `#version 300 es
    precision highp float;
    in vec2 aPosition;
    out vec2 vUv;
    out vec2 vL;
    out vec2 vR;
    out vec2 vT;
    out vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;

  const clearFS = `#version 300 es
    precision mediump float;
    in vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    out vec4 fragColor;
    void main () {
      fragColor = value * texture(uTexture, vUv);
    }`;

  const splatFS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    out vec4 fragColor;
    void main () {
      vec2 p = vUv - point;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture(uTarget, vUv).rgb;
      fragColor = vec4(base + splat, 1.0);
    }`;

  const advectionFS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    out vec4 fragColor;
    void main () {
      vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
      vec4 result = texture(uSource, coord);
      fragColor = dissipation * result;
    }`;

  const divergenceFS = `#version 300 es
    precision mediump float;
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uVelocity;
    out vec4 fragColor;
    void main () {
      float L = texture(uVelocity, vL).x;
      float R = texture(uVelocity, vR).x;
      float T = texture(uVelocity, vT).y;
      float B = texture(uVelocity, vB).y;
      float div = 0.5 * (R - L + T - B);
      fragColor = vec4(div, 0.0, 0.0, 1.0);
    }`;

  const curlFS = `#version 300 es
    precision mediump float;
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uVelocity;
    out vec4 fragColor;
    void main () {
      float L = texture(uVelocity, vL).y;
      float R = texture(uVelocity, vR).y;
      float T = texture(uVelocity, vT).x;
      float B = texture(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }`;

  const vorticityFS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    out vec4 fragColor;
    void main () {
      float L = texture(uCurl, vL).x;
      float R = texture(uCurl, vR).x;
      float T = texture(uCurl, vT).x;
      float B = texture(uCurl, vB).x;
      float C = texture(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 velocity = texture(uVelocity, vUv).xy;
      velocity += force * dt;
      velocity = min(max(velocity, -1000.0), 1000.0);
      fragColor = vec4(velocity, 0.0, 1.0);
    }`;

  const pressureFS = `#version 300 es
    precision mediump float;
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    out vec4 fragColor;
    void main () {
      float L = texture(uPressure, vL).x;
      float R = texture(uPressure, vR).x;
      float T = texture(uPressure, vT).x;
      float B = texture(uPressure, vB).x;
      float divergence = texture(uDivergence, vUv).x;
      float pressure = (L + R + B + T - divergence) * 0.25;
      fragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }`;

  const gradientSubFS = `#version 300 es
    precision mediump float;
    in vec2 vUv;
    in vec2 vL;
    in vec2 vR;
    in vec2 vT;
    in vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    out vec4 fragColor;
    void main () {
      float L = texture(uPressure, vL).x;
      float R = texture(uPressure, vR).x;
      float T = texture(uPressure, vT).x;
      float B = texture(uPressure, vB).x;
      vec2 velocity = texture(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      fragColor = vec4(velocity, 0.0, 1.0);
    }`;

  const displayFS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uAlpha;
    out vec4 fragColor;
    void main () {
      vec3 c = texture(uTexture, vUv).rgb;
      // Tone-map to keep colours subtle & elegant
      float brightness = max(c.r, max(c.g, c.b));
      // Slightly boost low values, clamp high
      c = c * smoothstep(0.0, 0.08, brightness);
      fragColor = vec4(c, uAlpha * min(brightness * 3.0, 1.0));
    }`;

  /* ── Build shader programs ───────────────────────────── */

  const programs = {
    clear:       createProgram(baseVS, clearFS),
    splat:       createProgram(baseVS, splatFS),
    advection:   createProgram(baseVS, advectionFS),
    divergence:  createProgram(baseVS, divergenceFS),
    curl:        createProgram(baseVS, curlFS),
    vorticity:   createProgram(baseVS, vorticityFS),
    pressure:    createProgram(baseVS, pressureFS),
    gradientSub: createProgram(baseVS, gradientSubFS),
    display:     createProgram(baseVS, displayFS),
  };

  // Check all programs compiled
  for (const [name, prog] of Object.entries(programs)) {
    if (!prog) {
      console.warn(`Fluid sim: ${name} program failed to compile.`);
      return;
    }
  }

  /* ── Geometry (full-screen quad) ─────────────────────── */

  const quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  function blit(target) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /* ── Initialise framebuffers ─────────────────────────── */

  let simWidth, simHeight, dyeWidth, dyeHeight;
  let velocity, dye, divergenceFBO, curlFBO, pressure;

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  function initFramebuffers() {
    const isMobile = window.innerWidth < 768;
    const simResTarget = isMobile ? Math.min(CONFIG.SIM_RESOLUTION, 96) : CONFIG.SIM_RESOLUTION;
    const dyeResTarget = isMobile ? Math.min(CONFIG.DYE_RESOLUTION, 512) : CONFIG.DYE_RESOLUTION;
    const simRes = getResolution(simResTarget);
    const dyeRes = getResolution(dyeResTarget);

    simWidth = simRes.width;
    simHeight = simRes.height;
    dyeWidth = dyeRes.width;
    dyeHeight = dyeRes.height;

    const texFilterLinear = floatLinear ? gl.LINEAR : gl.NEAREST;

    velocity     = createDoubleFBO(simWidth,  simHeight, formatRG,    gl.RG,   texType, texFilterLinear);
    dye          = createDoubleFBO(dyeWidth,  dyeHeight, formatRGBA,  gl.RGBA, texType, texFilterLinear);
    divergenceFBO = createFBO(simWidth, simHeight, formatRG, gl.RG, texType, gl.NEAREST);
    curlFBO      = createFBO(simWidth, simHeight, formatRG, gl.RG, texType, gl.NEAREST);
    pressure     = createDoubleFBO(simWidth,  simHeight, formatRG,    gl.RG,   texType, texFilterLinear);
  }

  function resizeCanvas() {
    const dpr = 1; // 1x resolution keeps GPU memory and shader passes lightweight
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      initFramebuffers();
    }
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  /* ── Pointer tracking ────────────────────────────────── */

  const pointer = {
    x: 0, y: 0,
    prevX: 0, prevY: 0,
    dx: 0, dy: 0,
    down: false,
    moved: false,
    color: [0, 0, 0],
  };

  function updatePointerPos(x, y) {
    const rect = canvas.getBoundingClientRect();
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.x = (x - rect.left) / rect.width;
    pointer.y = 1.0 - (y - rect.top) / rect.height;
    pointer.dx = (pointer.x - pointer.prevX) * 5.0;
    pointer.dy = (pointer.y - pointer.prevY) * 5.0;
    pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
  }

  canvas.addEventListener('mousemove', (e) => {
    updatePointerPos(e.clientX, e.clientY);
    pointer.down = true;
  });
  canvas.addEventListener('mouseleave', () => { pointer.down = false; });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    updatePointerPos(t.clientX, t.clientY);
    pointer.down = true;
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    updatePointerPos(t.clientX, t.clientY);
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.down = true;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { pointer.down = false; });

  /* ── Simulation helpers ──────────────────────────────── */

  function randomColor() {
    const c = CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];
    return [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]; // keep subtle
  }

  function splat(x, y, dx, dy, color) {
    const prog = programs.splat;
    gl.useProgram(prog.program);
    gl.uniform1i(prog.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(prog.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(prog.uniforms.point, x, y);
    gl.uniform3f(prog.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(prog.uniforms.radius, correctRadius(CONFIG.SPLAT_RADIUS / 100.0));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(prog.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(prog.uniforms.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  function correctRadius(radius) {
    const aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) return radius * aspectRatio;
    return radius;
  }

  // Auto-splat for ambient animation
  let lastAutoSplat = 0;
  function autoSplat(time) {
    if (time - lastAutoSplat < CONFIG.AUTO_SPLAT_INTERVAL) return;
    lastAutoSplat = time;
    const x = 0.15 + Math.random() * 0.7;
    const y = 0.15 + Math.random() * 0.7;
    const angle = Math.random() * Math.PI * 2;
    const force = CONFIG.SPLAT_FORCE * (0.3 + Math.random() * 0.4);
    const dx = Math.cos(angle) * force;
    const dy = Math.sin(angle) * force;
    splat(x, y, dx * 0.0004, dy * 0.0004, randomColor());
  }

  // Initial burst
  function initialSplats() {
    for (let i = 0; i < 5; i++) {
      const x = 0.2 + Math.random() * 0.6;
      const y = 0.2 + Math.random() * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const dx = Math.cos(angle) * CONFIG.SPLAT_FORCE * 0.0003;
      const dy = Math.sin(angle) * CONFIG.SPLAT_FORCE * 0.0003;
      splat(x, y, dx, dy, randomColor());
    }
  }

  /* ── Simulation step ─────────────────────────────────── */

  function step(dt) {
    gl.disable(gl.BLEND);

    // Curl
    const curlProg = programs.curl;
    gl.useProgram(curlProg.program);
    gl.uniform2f(curlProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0));
    blit(curlFBO);

    // Vorticity confinement
    const vortProg = programs.vorticity;
    gl.useProgram(vortProg.program);
    gl.uniform2f(vortProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vortProg.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vortProg.uniforms.uCurl, curlFBO.attach(1));
    gl.uniform1f(vortProg.uniforms.curl, CONFIG.CURL);
    gl.uniform1f(vortProg.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    // Advect velocity
    const advProg = programs.advection;
    gl.useProgram(advProg.program);
    gl.uniform2f(advProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advProg.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advProg.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(advProg.uniforms.dt, dt);
    gl.uniform1f(advProg.uniforms.dissipation, 1.0 - CONFIG.VELOCITY_DISSIPATION * dt);
    blit(velocity.write);
    velocity.swap();

    // Advect dye
    gl.uniform2f(advProg.uniforms.texelSize, 1.0 / dyeWidth, 1.0 / dyeHeight);
    gl.uniform1i(advProg.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advProg.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advProg.uniforms.dissipation, 1.0 - CONFIG.DENSITY_DISSIPATION * dt);
    blit(dye.write);
    dye.swap();

    // Divergence
    const divProg = programs.divergence;
    gl.useProgram(divProg.program);
    gl.uniform2f(divProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divProg.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergenceFBO);

    // Clear pressure
    const clrProg = programs.clear;
    gl.useProgram(clrProg.program);
    gl.uniform1i(clrProg.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clrProg.uniforms.value, 0.8);
    blit(pressure.write);
    pressure.swap();

    // Pressure solve (Jacobi iterations)
    const preProg = programs.pressure;
    gl.useProgram(preProg.program);
    gl.uniform2f(preProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(preProg.uniforms.uDivergence, divergenceFBO.attach(0));
    for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(preProg.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    // Gradient subtraction
    const gradProg = programs.gradientSub;
    gl.useProgram(gradProg.program);
    gl.uniform2f(gradProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradProg.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradProg.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();
  }

  /* ── Render loop ─────────────────────────────────────── */

  let lastTime = 0;
  let splatColor = randomColor();
  let splatColorTimer = 0;

  function render(time) {
    if (prefersReducedMotion) return; // stop loop entirely

    animFrameId = requestAnimationFrame(render);

    const dt = Math.min((time - lastTime) / 1000, 0.016667);
    lastTime = time;

    resizeCanvas();

    // Change splat colour periodically
    splatColorTimer += dt;
    if (splatColorTimer > 1.5) {
      splatColorTimer = 0;
      splatColor = randomColor();
    }

    // Pointer interaction
    if (pointer.down && pointer.moved) {
      splat(
        pointer.x, pointer.y,
        pointer.dx * CONFIG.SPLAT_FORCE * 0.0004,
        pointer.dy * CONFIG.SPLAT_FORCE * 0.0004,
        splatColor,
      );
      pointer.moved = false;
    }

    // Ambient splats
    autoSplat(time);

    // Simulation step
    step(dt);

    // Display
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const dispProg = programs.display;
    gl.useProgram(dispProg.program);
    gl.uniform2f(dispProg.uniforms.texelSize, 1.0 / canvas.width, 1.0 / canvas.height);
    gl.uniform1i(dispProg.uniforms.uTexture, dye.read.attach(0));
    gl.uniform1f(dispProg.uniforms.uAlpha, 1.0);
    blit(null);
  }

  // Kick off & visibility controls
  initialSplats();

  let isHeroVisible = true;
  let isTabVisible = !document.hidden;

  function resumeLoop() {
    if (prefersReducedMotion || !isHeroVisible || !isTabVisible) return;
    cancelAnimationFrame(animFrameId);
    lastTime = performance.now();
    animFrameId = requestAnimationFrame(render);
  }

  function pauseLoop() {
    cancelAnimationFrame(animFrameId);
  }

  if (!prefersReducedMotion) {
    animFrameId = requestAnimationFrame(render);

    document.addEventListener('visibilitychange', () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) resumeLoop();
      else pauseLoop();
    });

    const heroEl = document.getElementById('hero');
    if (heroEl && 'IntersectionObserver' in window) {
      const heroObserver = new IntersectionObserver((entries) => {
        isHeroVisible = entries[0].isIntersecting;
        if (isHeroVisible) resumeLoop();
        else pauseLoop();
      }, { threshold: 0.05 });
      heroObserver.observe(heroEl);
    }
  }

})();
