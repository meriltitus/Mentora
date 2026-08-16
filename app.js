// Main application coordinator for Mentora HUD — Voice-Centered Design
// Supports two modes:
//   - LIVE mode (default): driven by real API + voice
//   - DEMO mode (?demo=1): scripted walkthrough from data.js

const CONFIG = {
  productName: 'MENTORA',
  tagline: 'VOICE-FIRST AI TUTOR'
};

class AppState {
  constructor() {
    // Detect mode from URL params
    const params = new URLSearchParams(window.location.search);
    this.mode = params.get('demo') === '1' ? 'demo' : 'live';

    // Demo mode properties (only used in demo)
    this.currentCurriculum = 'unifiedJourney';
    this.currentStepIndex = 0;

    // Core state matching the pedagogical loop
    this.state = {
      stepIndex: 0,
      agentState: 'IDLE',
      agentStateLabel: 'Awaiting Curiosity',
      aiSpeech: '',
      userSpeech: '',
      currentConceptId: 'core',
      conceptsStatus: {},
      generatedConcepts: [],
      // Live mode state
      learningPath: [],        // [{ id, label, description, ... }]
      masteryMap: {},           // { conceptId: { status, confidence, cssStatus } }
      activeConceptId: null,
      currentGapConceptId: null,
      topic: null,
      understandingPct: 0,
      phase: null,
      summary: null
    };

    // Live mode dialogue history
    this.dialogueHistory = [];

    // Reactivity variables
    this.audioAmplitude = 0;
    this.innerCoreScale = 1.0;
    this.boundaryScale = 1.0;
    this.waveformScale = 1.0;
    this.glitchFrameCount = 0;
    this.masteryAnimFrame = 0;

    this.initCanvasCore();
  }

  // ──────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────

  // Update app state and notify individual visual segments
  update(newState) {
    this.state = { ...this.state, ...newState };

    // 1. Update living core state params (morph variables, target HSL colors)
    this.updateCoreParams(this.state.agentState);

    // 2. Re-render transcript (bottom floating area)
    this.reconstructDialogueFeed();

    // 3. Re-render roadmap (in drawer)
    this.renderSpatialRoadmap();

    // 4. Update core state label HUD
    const stateLabel = document.getElementById('core-state-label');
    if (stateLabel) {
      stateLabel.textContent = this.state.agentStateLabel.toUpperCase();

      // Update label color to match active state HSLs
      let stateColor = '#00f2fe';
      switch (this.state.agentState) {
        case 'LISTENING': stateColor = '#3b82f6'; break;
        case 'THINKING':
        case 'ANALYZING UNDERSTANDING': stateColor = '#8b5cf6'; break;
        case 'SPEAKING': stateColor = '#ffffff'; break;
        case 'GAP DETECTED':
        case 'CONCEPTUAL GAP DETECTED': stateColor = '#f59e0b'; break;
        case 'CORRECTING':
        case 'RETESTING': stateColor = '#ec4899'; break;
        case 'CONFIRMED':
        case 'ADVANCING':
        case 'MASTERY CONFIRMED': stateColor = '#10b981'; break;
        case 'SUMMARY': stateColor = '#00f2fe'; break;
      }
      stateLabel.style.color = stateColor;
      stateLabel.style.textShadow = `0 0 20px ${stateColor}40`;
    }

    // 5. Update understanding percentage (live mode)
    if (this.mode === 'live') {
      this._updateUnderstandingDisplay();
      this._updateLearningPlanDisplay();
    }
  }

  /**
   * Add a message to the dialogue history (live mode only)
   */
  addDialogueMessage(sender, text) {
    if (!text || !text.trim()) return;

    this.dialogueHistory.push({
      role: sender, // 'tutor', 'user', or 'system'
      text: text.trim(),
      timestamp: Date.now()
    });

    this.reconstructDialogueFeed();
  }

  /**
   * Go to a specific scripted step (demo mode only)
   */
  goToStep(index) {
    if (this.mode !== 'demo') {
      console.warn('[AppState] goToStep() only works in demo mode (?demo=1)');
      return;
    }

    if (!window.learningPaths) {
      console.warn('[AppState] data.js not loaded. Demo mode requires ?demo=1');
      return;
    }

    const path = window.learningPaths[this.currentCurriculum];
    if (index >= 0 && index < path.steps.length) {
      this.currentStepIndex = index;
      const step = path.steps[index];

      this.update({
        agentState: step.agentState,
        agentStateLabel: step.agentStateLabel,
        aiSpeech: step.aiSpeech,
        userSpeech: step.userSpeech,
        currentConceptId: step.currentConcept,
        conceptsStatus: step.conceptsStatus || {},
        generatedConcepts: step.generatedConcepts || []
      });
    }
  }

  // ──────────────────────────────────────────────
  // TRANSCRIPT: Compact bottom floating area
  // ──────────────────────────────────────────────

  reconstructDialogueFeed() {
    const stream = document.getElementById('dialogue-stream');
    if (!stream) return;

    // Check scroll position
    const isAtBottom = stream.scrollHeight - stream.clientHeight - stream.scrollTop < 100;

    if (this.mode === 'demo') {
      this._renderDemoDialogue(stream);
    } else {
      this._renderLiveDialogue(stream);
    }

    // Scroll to bottom
    if (isAtBottom || (this.mode === 'demo' && this.currentStepIndex === 0) ||
        (this.mode === 'live' && this.dialogueHistory.length <= 1)) {
      setTimeout(() => {
        stream.scrollTop = stream.scrollHeight;
      }, 50);
    }
  }

  _renderDemoDialogue(stream) {
    stream.innerHTML = '';

    if (!window.learningPaths) return;
    const steps = window.learningPaths[this.currentCurriculum].steps;

    for (let i = 0; i <= this.currentStepIndex; i++) {
      const step = steps[i];

      if (step.aiSpeech && step.aiSpeech !== "..." && !step.aiSpeech.includes("SYS //")) {
        stream.appendChild(this._createBubble('tutor', step.aiSpeech));
      }

      if (step.userSpeech && step.userSpeech !== "..." && !step.userSpeech.includes("SYS //") && step.userSpeech !== "") {
        stream.appendChild(this._createBubble('user', `"${step.userSpeech}"`));
      }
    }
  }

  _renderLiveDialogue(stream) {
    stream.innerHTML = '';

    for (const entry of this.dialogueHistory) {
      if (entry.role === 'system') {
        stream.appendChild(this._createBubble('system', entry.text));
      } else if (entry.role === 'tutor') {
        stream.appendChild(this._createBubble('tutor', entry.text));
      } else {
        stream.appendChild(this._createBubble('user', `"${entry.text}"`));
      }
    }
  }

  _createBubble(type, text) {
    const bubble = document.createElement('div');

    if (type === 'system') {
      bubble.className = 'message-bubble system';
      bubble.innerHTML = `
        <span class="message-sender">// SYSTEM</span>
        <div class="message-content">${text}</div>
      `;
    } else if (type === 'tutor') {
      bubble.className = 'message-bubble tutor';
      bubble.innerHTML = `
        <span class="message-sender">// TUTOR</span>
        <div class="message-content">${text}</div>
      `;
    } else {
      bubble.className = 'message-bubble you';
      bubble.innerHTML = `
        <span class="message-sender">// YOU</span>
        <div class="message-content">${text}</div>
      `;
    }

    return bubble;
  }

  // ──────────────────────────────────────────────
  // ROADMAP: Rendered inside the drawer
  // ──────────────────────────────────────────────

  renderSpatialRoadmap() {
    const topicHeader = document.getElementById('roadmap-topic');
    const listContainer = document.getElementById('roadmap-nodes-list');
    const svgOverlay = document.getElementById('roadmap-svg-overlay');
    if (!listContainer || !topicHeader || !svgOverlay) return;

    if (this.mode === 'demo') {
      this._renderDemoRoadmap(topicHeader, listContainer, svgOverlay);
    } else {
      this._renderLiveRoadmap(topicHeader, listContainer, svgOverlay);
    }
  }

  _renderDemoRoadmap(topicHeader, listContainer, svgOverlay) {
    if (!window.learningPaths) return;

    const curriculum = window.learningPaths[this.currentCurriculum];
    const currentStep = curriculum.steps[this.currentStepIndex];

    const roadmapMaterialized = this.currentStepIndex >= 3;

    if (!roadmapMaterialized) {
      topicHeader.innerHTML = `<span style="color: #444; font-family: var(--font-mono); font-size: 0.8rem; font-weight: 400;">// AWAITING TOPIC...</span>`;
      listContainer.innerHTML = '';
      svgOverlay.innerHTML = '';
      const globalSvg = document.getElementById('global-svg-overlay');
      if (globalSvg) globalSvg.innerHTML = '';
      return;
    }

    topicHeader.textContent = curriculum.title.toUpperCase();
    listContainer.innerHTML = '';

    curriculum.concepts.forEach((concept) => {
      let status = 'locked';
      if (currentStep.conceptsStatus && currentStep.conceptsStatus[concept.id]) {
        status = currentStep.conceptsStatus[concept.id];
      }

      const isActive = (concept.id === currentStep.currentConcept);
      this._appendRoadmapNode(listContainer, concept.name, status, isActive, concept.id);
    });

    this.drawRoadmapPaths();
    this.drawGlobalConnector();
  }

  _renderLiveRoadmap(topicHeader, listContainer, svgOverlay) {
    const learningPath = this.state.learningPath;
    const masteryMap = this.state.masteryMap;
    const activeId = this.state.activeConceptId;

    if (!learningPath || learningPath.length === 0) {
      topicHeader.innerHTML = `<span style="color: #444; font-family: var(--font-mono); font-size: 0.8rem; font-weight: 400;">// AWAITING TOPIC...</span>`;
      listContainer.innerHTML = '';
      svgOverlay.innerHTML = '';
      const globalSvg = document.getElementById('global-svg-overlay');
      if (globalSvg) globalSvg.innerHTML = '';
      return;
    }

    topicHeader.textContent = (this.state.topic || 'LEARNING PATH').toUpperCase();
    listContainer.innerHTML = '';

    learningPath.forEach((concept) => {
      const mastery = masteryMap[concept.id];
      let status = 'locked';
      if (mastery) {
        status = mastery.cssStatus || this._masteryToCss(mastery.status);
      }

      const isActive = (concept.id === activeId);
      this._appendRoadmapNode(listContainer, concept.label, status, isActive, concept.id);
    });

    this.drawRoadmapPaths();
    this.drawGlobalConnector();
  }

  _appendRoadmapNode(container, name, status, isActive, conceptId) {
    const nodeEl = document.createElement('div');
    nodeEl.className = `roadmap-node status-${status} ${isActive ? 'active' : ''}`;
    nodeEl.dataset.conceptId = conceptId;

    let bulletSymbol = '◌';
    if (status === 'mastered') bulletSymbol = '✓';
    else if (status === 'gap-detected') bulletSymbol = '⚠';
    else if (status === 'retesting') bulletSymbol = '🔄';
    else if (status === 'in-progress') bulletSymbol = '◉';
    else if (isActive) bulletSymbol = '◉';

    let statusLabel = '';
    if (status === 'gap-detected') statusLabel = '[GAP DETECTED]';
    else if (status === 'mastered') statusLabel = '[MASTERED]';
    else if (status === 'retesting') statusLabel = '[RETESTING]';
    else if (status === 'in-progress' && isActive) statusLabel = '[ACTIVE]';

    nodeEl.innerHTML = `
      <div class="node-bullet-wrapper">
        <div class="node-bullet"></div>
      </div>
      <span class="roadmap-node-text">
        ${bulletSymbol} ${name}
        <span class="roadmap-node-label-status">${statusLabel}</span>
      </span>
    `;

    container.appendChild(nodeEl);
  }

  _masteryToCss(status) {
    const map = {
      'NOT_TESTED': 'locked',
      'IN_PROGRESS': 'in-progress',
      'GAP': 'gap-detected',
      'RETESTING': 'retesting',
      'MASTERED': 'mastered'
    };
    return map[status] || 'locked';
  }

  // ──────────────────────────────────────────────
  // UNDERSTANDING & LEARNING PLAN DISPLAY
  // ──────────────────────────────────────────────

  _updateUnderstandingDisplay() {
    const pct = this.state.understandingPct !== undefined ? this.state.understandingPct : 0;

    // 1. Drawer understanding display
    const pctEl = document.getElementById('understanding-pct');
    if (pctEl) {
      pctEl.textContent = `${pct}%`;

      if (pct >= 80) pctEl.style.color = 'var(--color-mastered)';
      else if (pct >= 50) pctEl.style.color = 'var(--color-idle)';
      else if (pct > 0) pctEl.style.color = 'var(--color-gap)';
      else pctEl.style.color = 'var(--color-locked)';
    }

    // 2. Top-Right Progress HUD
    const topBarProgress = document.getElementById('top-bar-progress');
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');

    if (topBarProgress) {
      const path = this.state.learningPath;
      if (path && path.length > 0) {
        topBarProgress.style.display = 'flex';

        const mastered = Object.values(this.state.masteryMap || {})
          .filter(m => (m.status || m.cssStatus) === 'mastered' || m.status === 'MASTERED').length;

        if (progressText) {
          progressText.textContent = `${mastered}/${path.length} • ${pct}%`;
        }
        if (progressFill) {
          progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        }
      } else {
        topBarProgress.style.display = 'none';
      }
    }
  }

  _updateLearningPlanDisplay() {
    const planEl = document.getElementById('learning-plan-content');
    if (!planEl) return;

    const activeId = this.state.activeConceptId;
    const path = this.state.learningPath;
    const masteryMap = this.state.masteryMap;

    if (!activeId || !path || path.length === 0) {
      planEl.innerHTML = '<span style="color: #555;">No active plan</span>';
      return;
    }

    const activeConcept = path.find(c => c.id === activeId);
    if (!activeConcept) return;

    // Count progress
    const mastered = Object.values(masteryMap).filter(m => (m.status || m.cssStatus) === 'mastered' || m.status === 'MASTERED').length;
    const total = path.length;

    planEl.innerHTML = `
      <div class="plan-current">
        <span class="plan-label">CURRENT FOCUS</span>
        <span class="plan-concept">${activeConcept.label}</span>
      </div>
      <div class="plan-progress">
        <span class="plan-label">PROGRESS</span>
        <span class="plan-value">${mastered} / ${total} concepts</span>
      </div>
    `;
  }

  // ──────────────────────────────────────────────
  // SVG CONNECTORS
  // ──────────────────────────────────────────────

  drawRoadmapPaths() {
    const svg = document.getElementById('roadmap-svg-overlay');
    if (!svg) return;
    svg.innerHTML = '';

    const nodes = document.querySelectorAll('.roadmap-node');
    if (nodes.length < 2) return;

    const dots = [];
    const svgRect = svg.getBoundingClientRect();

    nodes.forEach(node => {
      const bullet = node.querySelector('.node-bullet');
      if (bullet) {
        const rect = bullet.getBoundingClientRect();
        dots.push({
          x: rect.left + rect.width / 2 - svgRect.left,
          y: rect.top + rect.height / 2 - svgRect.top
        });
      }
    });

    if (dots.length < 2) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let pathD = `M ${dots[0].x} ${dots[0].y}`;
    for (let i = 1; i < dots.length; i++) {
      pathD += ` L ${dots[i].x} ${dots[i].y}`;
    }

    line.setAttribute('d', pathD);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.04)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '3 3');
    line.setAttribute('fill', 'none');
    svg.appendChild(line);
  }

  drawGlobalConnector() {
    const svg = document.getElementById('global-svg-overlay');
    if (!svg) return;
    svg.innerHTML = '';

    // Global connector only makes sense when drawer is open and roadmap is visible
    const roadmapDrawer = document.getElementById('roadmap-drawer');
    if (!roadmapDrawer || !roadmapDrawer.classList.contains('open')) return;

    const activeNodeEl = document.querySelector('.roadmap-node.active');
    const coreWrapper = document.querySelector('.living-core-wrapper');
    if (!activeNodeEl || !coreWrapper) return;

    const bullet = activeNodeEl.querySelector('.node-bullet');
    if (!bullet) return;

    const rBullet = bullet.getBoundingClientRect();
    const rCore = coreWrapper.getBoundingClientRect();
    const rSvg = svg.getBoundingClientRect();

    const startX = rBullet.left - rSvg.left;
    const startY = rBullet.top + rBullet.height / 2 - rSvg.top;
    const endX = rCore.left + rCore.width / 2 - rSvg.left;
    const endY = rCore.top + rCore.height / 2 - rSvg.top;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const cp1X = startX - 120;
    const cp1Y = startY;
    const cp2X = endX + 120;
    const cp2Y = endY;

    path.setAttribute('d', `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`);

    // Determine connector color based on state
    let strokeColor = 'rgba(0, 242, 254, 0.35)';
    let isGap = false;

    if (this.mode === 'demo' && window.learningPaths) {
      const steps = window.learningPaths[this.currentCurriculum].steps;
      const currentStep = steps[this.currentStepIndex];
      if (currentStep.conceptsStatus && currentStep.conceptsStatus[currentStep.currentConcept] === 'gap-detected') {
        strokeColor = 'rgba(245, 158, 11, 0.75)';
        isGap = true;
      } else if (currentStep.agentState === 'CONFIRMED' || currentStep.agentState === 'ADVANCING' || currentStep.agentState === 'MASTERY CONFIRMED') {
        strokeColor = 'rgba(16, 185, 129, 0.55)';
      }
    } else {
      // Live mode — check mastery map
      const activeId = this.state.activeConceptId;
      const mastery = activeId ? this.state.masteryMap[activeId] : null;

      if (mastery) {
        const cssStatus = mastery.cssStatus || this._masteryToCss(mastery.status);
        if (cssStatus === 'gap-detected') {
          strokeColor = 'rgba(245, 158, 11, 0.75)';
          isGap = true;
        } else if (cssStatus === 'mastered') {
          strokeColor = 'rgba(16, 185, 129, 0.55)';
        } else if (cssStatus === 'retesting') {
          strokeColor = 'rgba(236, 72, 153, 0.55)';
        }
      }

      // Also check agent state
      if (this.state.agentState === 'CONFIRMED' || this.state.agentState === 'MASTERY CONFIRMED') {
        strokeColor = 'rgba(16, 185, 129, 0.55)';
      } else if (this.state.agentState === 'GAP DETECTED' || this.state.agentState === 'CONCEPTUAL GAP DETECTED') {
        strokeColor = 'rgba(245, 158, 11, 0.75)';
        isGap = true;
      }
    }

    path.setAttribute('stroke', strokeColor);
    path.setAttribute('class', `hud-glowing-connector ${isGap ? 'gap-pulse' : ''}`);
    svg.appendChild(path);
  }

  // ──────────────────────────────────────────────
  // CANVAS ENGINE (COMPLETELY UNCHANGED)
  // ──────────────────────────────────────────────

  initCanvasCore() {
    this.canvas = document.getElementById('living-core-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.time = 0;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Initialize 45 info dust particles floating
    this.particles = [];
    for (let i = 0; i < 45; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        distance: 40 + Math.random() * 110,
        speed: 0.15 + Math.random() * 0.4,
        size: 0.8 + Math.random() * 1.5,
        alpha: 0.25 + Math.random() * 0.5
      });
    }

    // Default target properties
    this.coreParams = {
      color: '#00f2fe',
      scale: 1.0,
      warp: 2,
      rotSpeed: 0.005,
      waveAmp: 3,
      waveFreq: 0.05
    };

    // Animated interpolation parameters
    this.currentParams = { ...this.coreParams };

    this.startCoreAnimation();
  }

  resizeCanvas() {
    if (this.canvas) {
      // Canvas now covers the full viewport
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;

      // Initialize sparse ambient particles
      this.generateAmbientParticles();

      // Initialize flow data traces
      this.dataTraces = [];
      for (let i = 0; i < 3; i++) {
        this.dataTraces.push(this.createDataTrace());
      }
    }
  }

  generateAmbientParticles() {
    if (!this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h * 0.38;

    this.ambientParticles = [];
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const maxDist = Math.max(w, h);
      const distance = 80 + Math.pow(Math.random(), 1.5) * (maxDist / 2 - 80);

      this.ambientParticles.push({
        x: cx + distance * Math.cos(angle),
        y: cy + distance * Math.sin(angle),
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        size: 0.6 + Math.random() * 1.2,
        alpha: 0.01 + Math.random() * 0.025
      });
    }
  }

  createDataTrace() {
    if (!this.canvas) return null;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -40 : w + 40;
    const startY = Math.random() * h;

    return {
      x: startX,
      y: startY,
      progress: 0,
      speed: 0.0015 + Math.random() * 0.0025,
      alpha: 0.02 + Math.random() * 0.045
    };
  }

  updateCoreParams(state) {
    let color = '#00f2fe';
    let scale = 1.0;
    let warp = 2;
    let rotSpeed = 0.005;
    let waveAmp = 3;
    let waveFreq = 0.05;

    // Trigger state transition visual behaviors
    if (state === 'GAP DETECTED' || state === 'CONCEPTUAL GAP DETECTED') {
      this.glitchFrameCount = 20;

      if (this.ambientParticles) {
        this.ambientParticles.forEach(p => {
          p.x += (Math.random() - 0.5) * 120;
          p.y += (Math.random() - 0.5) * 120;
        });
      }
    }
    if (state === 'CONFIRMED' || state === 'MASTERY CONFIRMED') {
      this.masteryAnimFrame = 65;
    }

    switch (state) {
      case 'IDLE':
        color = '#00f2fe';
        scale = 0.95;
        warp = 2;
        rotSpeed = 0.003;
        waveAmp = 3;
        waveFreq = 0.05;
        break;
      case 'LISTENING':
        color = '#3b82f6';
        scale = 1.05;
        warp = 8;
        rotSpeed = 0.015;
        waveAmp = 12;
        waveFreq = 0.2;
        break;
      case 'THINKING':
      case 'ANALYZING UNDERSTANDING':
        color = '#8b5cf6';
        scale = 0.98;
        warp = 22;
        rotSpeed = 0.05;
        waveAmp = 5;
        waveFreq = 0.25;
        break;
      case 'SPEAKING':
        color = '#ffffff';
        scale = 1.04;
        warp = 5;
        rotSpeed = 0.008;
        waveAmp = 20;
        waveFreq = 0.1;
        break;
      case 'GAP DETECTED':
      case 'CONCEPTUAL GAP DETECTED':
        color = '#f59e0b';
        scale = 1.1;
        warp = 28;
        rotSpeed = 0.002;
        waveAmp = 10;
        waveFreq = 0.04;
        break;
      case 'CORRECTING':
      case 'RETESTING':
        color = '#ec4899';
        scale = 1.02;
        warp = 14;
        rotSpeed = 0.018;
        waveAmp = 9;
        waveFreq = 0.18;
        break;
      case 'CONFIRMED':
      case 'ADVANCING':
      case 'MASTERY CONFIRMED':
        color = '#10b981';
        scale = 1.12;
        warp = 1.5;
        rotSpeed = 0.012;
        waveAmp = 6;
        waveFreq = 0.07;
        break;
      case 'SUMMARY':
        color = '#00f2fe';
        scale = 0.85;
        warp = 1;
        rotSpeed = 0.002;
        waveAmp = 2;
        waveFreq = 0.04;
        break;
    }

    this.coreParams = { color, scale, warp, rotSpeed, waveAmp, waveFreq };
  }

  startCoreAnimation() {
    const loop = () => {
      this.time += 0.05;
      this.simulateAudioReactivity();
      this.animateCore();
      requestAnimationFrame(loop);
    };
    loop();
  }

  // Simulate or passthrough audio amplitude
  simulateAudioReactivity() {
    const state = this.state.agentState;
    const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

    // In live mode, audioAmplitude is driven by real mic/TTS via VoiceManager
    // Only simulate if no real amplitude is being fed
    if (this.mode === 'demo' || this.audioAmplitude < 0.01) {
      let targetAmp = 0.04;

      if (state === 'LISTENING') {
        targetAmp = 0.12 + Math.sin(this.time * 9.5) * 0.35 + Math.random() * 0.52;
      } else if (state === 'SPEAKING') {
        targetAmp = 0.22 + Math.sin(this.time * 6.0) * 0.45 + Math.random() * 0.25;
      } else if (state === 'THINKING' || state === 'ANALYZING UNDERSTANDING') {
        targetAmp = 0.1 + Math.sin(this.time * 15.0) * 0.08;
      }

      this.audioAmplitude = lerp(this.audioAmplitude, Math.max(0, targetAmp), 0.15);
    }

    // Apply different responsiveness speeds to scale variables
    this.innerCoreScale = lerp(this.innerCoreScale, this.coreParams.scale + this.audioAmplitude * 0.14, 0.06);
    this.boundaryScale = lerp(this.boundaryScale, this.coreParams.scale + this.audioAmplitude * 0.28, 0.14);
    this.waveformScale = lerp(this.waveformScale, this.coreParams.scale + this.audioAmplitude * 0.55, 0.35);
  }

  animateCore() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const cx = width / 2;
    const cy = height * 0.38;

    ctx.clearRect(0, 0, width, height);

    // LERP variables for transitions
    const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
    this.currentParams.warp = lerp(this.currentParams.warp, this.coreParams.warp, 0.08);
    this.currentParams.rotSpeed = lerp(this.currentParams.rotSpeed, this.coreParams.rotSpeed, 0.08);
    this.currentParams.waveAmp = lerp(this.currentParams.waveAmp, this.coreParams.waveAmp, 0.08);
    this.currentParams.waveFreq = lerp(this.currentParams.waveFreq, this.coreParams.waveFreq, 0.08);

    let activeColor = this.coreParams.color;
    let computedWarp = this.currentParams.warp;
    let scaleSurge = 1.0;

    // Handle temporary visual behaviors (Glitch and Mastery expansion)
    if (this.glitchFrameCount > 0) {
      this.glitchFrameCount--;
      activeColor = Math.random() > 0.5 ? '#ef4444' : '#f59e0b';
      computedWarp *= 1.8;
      scaleSurge = 1.0 + (Math.random() - 0.5) * 0.08;
    }

    if (this.masteryAnimFrame > 0) {
      this.masteryAnimFrame--;
      const progress = (65 - this.masteryAnimFrame) / 65;
      scaleSurge = 1.0 + Math.sin(progress * Math.PI) * 0.38;
      activeColor = '#10b981';
    }

    const state = this.state.agentState;

    // ==========================================
    // LAYER 1: Large Soft Radial Ambient Glow
    // ==========================================
    const glowRadius = 260 * (this.waveformScale * scaleSurge);
    const radialGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, glowRadius);

    let glowOpacity = 0.04;
    if (state === 'SPEAKING') {
      glowOpacity = 0.04 + this.audioAmplitude * 0.06;
    } else if (state === 'LISTENING') {
      glowOpacity = 0.03 + this.audioAmplitude * 0.03;
    } else if (state === 'GAP DETECTED' || state === 'CONCEPTUAL GAP DETECTED') {
      glowOpacity = 0.08;
    } else if (this.masteryAnimFrame > 0) {
      glowOpacity = 0.12;
    }

    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    radialGlow.addColorStop(0, hexToRgba(activeColor, glowOpacity));
    radialGlow.addColorStop(0.5, hexToRgba(activeColor, glowOpacity * 0.35));
    radialGlow.addColorStop(1, 'transparent');

    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // ==========================================
    // LAYER 2: Sparse Ambient Background Particles
    // ==========================================
    this.ambientParticles.forEach(p => {
      let speedMult = 1.0;
      if (state === 'THINKING' || state === 'ANALYZING UNDERSTANDING') speedMult = 2.2;
      else if (state === 'LISTENING') speedMult = 0.4;
      else if (state === 'SUMMARY') speedMult = 0.2;

      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      if (state === 'LISTENING') {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 80) {
          p.x += (dx / dist) * 0.22;
          p.y += (dy / dist) * 0.22;
        }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // ==========================================
    // LAYER 3: Faint Flowing Data Traces
    // ==========================================
    this.dataTraces.forEach((trace, idx) => {
      if (!trace) return;

      let flowSpeed = trace.speed;
      if (state === 'THINKING' || state === 'ANALYZING UNDERSTANDING') flowSpeed = trace.speed * 2.2;
      else if (state === 'LISTENING') flowSpeed = trace.speed * 1.5;

      trace.progress += flowSpeed;
      if (trace.progress >= 0.82) {
        this.dataTraces[idx] = this.createDataTrace();
        return;
      }

      const t = trace.progress;
      const tTail = Math.max(0, t - 0.09);

      const getBezierPoint = (pct) => {
        const cp1X = trace.x + (cx - trace.x) * 0.3;
        const cp1Y = trace.y + (cy - trace.y) * 0.1;
        const cp2X = trace.x + (cx - trace.x) * 0.7;
        const cp2Y = trace.y + (cy - trace.y) * 0.9;

        const x = Math.pow(1-pct, 3)*trace.x + 3*Math.pow(1-pct, 2)*pct*cp1X + 3*(1-pct)*Math.pow(pct, 2)*cp2X + Math.pow(pct, 3)*cx;
        const y = Math.pow(1-pct, 3)*trace.y + 3*Math.pow(1-pct, 2)*pct*cp1Y + 3*(1-pct)*Math.pow(pct, 2)*cp2Y + Math.pow(pct, 3)*cy;
        return { x, y };
      };

      const head = getBezierPoint(t);
      const tail = getBezierPoint(tTail);

      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 1.0;

      let traceAlpha = trace.alpha;
      if (t < 0.2) traceAlpha *= (t / 0.2);
      if (t > 0.6) traceAlpha *= (1.0 - (t - 0.6) / 0.22);

      ctx.globalAlpha = Math.max(0, traceAlpha);

      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(head.x, head.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });

    // ==========================================
    // LAYER 4: 3 concentric Circular Waveforms
    // ==========================================
    ctx.save();
    const waveRadii = [98, 130, 162];
    const waveOpacities = [0.28, 0.16, 0.08];
    const baseWarp = this.currentParams.waveAmp * this.audioAmplitude;

    waveRadii.forEach((baseRadius, wIdx) => {
      ctx.strokeStyle = activeColor;
      ctx.globalAlpha = waveOpacities[wIdx] * (state === 'IDLE' ? 0.3 : 1.0);
      ctx.beginPath();

      const numPoints = 120;
      const radiusScale = this.waveformScale * scaleSurge;
      const radius = baseRadius * radiusScale;

      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const phase = this.time * (4 + wIdx * 2) + angle * (6 + wIdx * 4);
        const noise = Math.sin(phase) * baseWarp * (1.2 - wIdx * 0.3);
        const r = radius + noise;

        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();
    ctx.globalAlpha = 1.0;

    // ==========================================
    // LAYER 5: Core orbiting particles
    // ==========================================
    this.particles.forEach(p => {
      let orbitFactor = 1.0;
      if (this.coreParams.rotSpeed > 0.04) orbitFactor = 3.5;
      else if (this.coreParams.rotSpeed < 0.003) orbitFactor = 0.45;

      p.angle += 0.015 * p.speed * orbitFactor;

      let pullDistance = p.distance;
      if (state === 'LISTENING') {
        pullDistance = lerp(p.distance, 45 + Math.sin(this.time * 3 + p.angle) * 15, 0.2);
      }

      const x = cx + pullDistance * Math.cos(p.angle) * scaleSurge;
      const y = cy + pullDistance * Math.sin(p.angle) * scaleSurge;

      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = activeColor;
      ctx.globalAlpha = p.alpha * (state === 'IDLE' ? 0.25 : 0.5);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // ==========================================
    // LAYER 6: Surrounding slow-moving satellites
    // ==========================================
    const orbits = [
      { radius: 195, speed: 0.12, size: 3, color: activeColor },
      { radius: 230, speed: -0.08, size: 2, color: '#ffffff', opacity: 0.2 }
    ];
    orbits.forEach(orb => {
      const angle = this.time * orb.speed;
      const x = cx + orb.radius * Math.cos(angle) * scaleSurge;
      const y = cy + orb.radius * Math.sin(angle) * scaleSurge;
      ctx.beginPath();
      ctx.arc(x, y, orb.size, 0, Math.PI * 2);
      ctx.fillStyle = orb.color;
      ctx.globalAlpha = orb.opacity || 0.45;
      ctx.shadowBlur = 6;
      ctx.shadowColor = orb.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    });

    // ==========================================
    // LAYER 7: Organic/Fluid Inner Core
    // ==========================================
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Layer A (Back boundary)
    const scaleA = this.boundaryScale * scaleSurge;
    const radiusA = 68 * scaleA;
    ctx.beginPath();
    for (let i = 0; i < 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const noise = Math.sin(angle * 6 + this.time * 2.5) * computedWarp * 0.24;
      const r = radiusA + noise;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const gradA = ctx.createRadialGradient(cx, cy, 2, cx, cy, radiusA);
    gradA.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradA.addColorStop(0.4, activeColor);
    gradA.addColorStop(1, 'transparent');
    ctx.fillStyle = gradA;
    ctx.globalAlpha = 0.4;
    ctx.fill();

    // Layer B (Front Core)
    const scaleB = this.innerCoreScale * scaleSurge;
    const radiusB = 52 * scaleB;
    ctx.beginPath();
    for (let i = 0; i < 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const noise = Math.cos(angle * 5 - this.time * 3.2) * computedWarp * 0.16;
      const r = radiusB + noise;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const gradB = ctx.createRadialGradient(cx, cy, 2, cx, cy, radiusB);
    gradB.addColorStop(0, '#ffffff');
    gradB.addColorStop(0.35, activeColor);
    gradB.addColorStop(1, 'transparent');
    ctx.fillStyle = gradB;
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur = 28;
    ctx.shadowColor = activeColor;
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1.0;
  }
}

// ──────────────────────────────────────────────
// DRAWER MANAGEMENT
// ──────────────────────────────────────────────

function initDrawers() {
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsClose = document.getElementById('settings-close');

  const roadmapToggle = document.getElementById('roadmap-toggle');
  const roadmapDrawer = document.getElementById('roadmap-drawer');
  const roadmapClose = document.getElementById('roadmap-close');

  const historyToggle = document.getElementById('history-toggle');
  const historyDrawer = document.getElementById('history-drawer');
  const historyClose = document.getElementById('history-close');

  const backdrop = document.getElementById('drawer-backdrop');

  function openDrawer(drawer) {
    // Close any other open drawer first
    document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open'));
    drawer.classList.add('open');
    backdrop.classList.add('visible');
  }

  function closeAllDrawers() {
    document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open'));
    backdrop.classList.remove('visible');
    if (window.appState) {
      window.appState.drawGlobalConnector();
    }
  }

  if (settingsToggle) {
    settingsToggle.addEventListener('click', () => {
      if (settingsDrawer.classList.contains('open')) {
        closeAllDrawers();
      } else {
        openDrawer(settingsDrawer);
      }
    });
  }

  if (roadmapToggle) {
    roadmapToggle.addEventListener('click', () => {
      if (roadmapDrawer.classList.contains('open')) {
        closeAllDrawers();
      } else {
        openDrawer(roadmapDrawer);
        // Re-render roadmap paths when drawer opens (for correct positioning)
        setTimeout(() => {
          if (window.appState) {
            window.appState.drawRoadmapPaths();
            window.appState.drawGlobalConnector();
          }
        }, 400);
      }
    });
  }

  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      if (historyDrawer.classList.contains('open')) {
        closeAllDrawers();
      } else {
        openDrawer(historyDrawer);
        if (window.mentorClient) {
          window.mentorClient.fetchHistory();
        }
      }
    });
  }

  if (settingsClose) settingsClose.addEventListener('click', closeAllDrawers);
  if (roadmapClose) roadmapClose.addEventListener('click', closeAllDrawers);
  if (historyClose) historyClose.addEventListener('click', closeAllDrawers);
  if (backdrop) backdrop.addEventListener('click', closeAllDrawers);
}

// ──────────────────────────────────────────────
// INITIALIZATION
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const app = new AppState();
  window.appState = app;

  // 1. Dynamic configs mapping
  const brandName = document.getElementById('brand-name');
  if (brandName) brandName.textContent = CONFIG.productName;
  const brandTagline = document.getElementById('brand-tagline');
  if (brandTagline) brandTagline.textContent = CONFIG.tagline;
  document.title = CONFIG.productName;

  // 2. Initialize drawer system
  initDrawers();

  // 3. Handle resize to keep paths aligned
  window.addEventListener('resize', () => {
    app.drawRoadmapPaths();
    app.drawGlobalConnector();
  });

  // 4. Mode-specific initialization
  if (app.mode === 'demo') {
    // Demo mode: start scripted walkthrough
    console.log('[Mentora] Demo mode — use window.appState.goToStep(n) to navigate');
    app.goToStep(0);

    // Show demo controls
    const demoControls = document.getElementById('demo-controls');
    if (demoControls) demoControls.style.display = 'flex';
    document.body.classList.add('demo-mode');
  } else {
    // Live mode: initialize mentor client
    console.log('[Mentora] Live mode — voice-first AI tutor active');

    // Show goal input overlay
    const goalSection = document.getElementById('goal-section');
    if (goalSection) goalSection.style.display = 'flex';

    // Hide demo controls
    const demoControls = document.getElementById('demo-controls');
    if (demoControls) demoControls.style.display = 'none';

    // Initialize mentor client (requires voice.js and mentor.js)
    if (window.VoiceManager && window.MentorClient) {
      window.mentorClient = new MentorClient(app);
    } else {
      console.warn('[Mentora] VoiceManager or MentorClient not loaded');
    }

    // Initialize state
    app.update({
      agentState: 'IDLE',
      agentStateLabel: 'AWAITING CURIOSITY'
    });
  }
});
