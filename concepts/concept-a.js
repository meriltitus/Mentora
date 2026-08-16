// Concept A — JARVIS HUD JS

class ConceptAHUD {
  constructor() {
    this.orbCanvas = document.getElementById('hud-orb-canvas');
    this.waveCanvas = document.getElementById('hud-wave-canvas');
    
    this.orbCtx = this.orbCanvas ? this.orbCanvas.getContext('2d') : null;
    this.waveCtx = this.waveCanvas ? this.waveCanvas.getContext('2d') : null;
    
    this.animationFrameId = null;
    this.time = 0;
    
    // Core parameters that change with tutor state
    this.stateParams = {
      orbColor: '#00f2fe',
      orbScale: 1.0,
      waveColor: 'rgba(0, 242, 254, 0.4)',
      waveSpeed: 0.08,
      waveAmp: 8,
      waveFreq: 0.03,
      warpOffset: 0
    };

    this.currentConcepts = [];
    this.activeConceptId = null;
    this.agentState = 'IDLE';

    this.init();
  }

  init() {
    this.onResize();
    this.startAnimation();
  }

  onResize() {
    // Canvas dimensions are set static in HTML for high density,
    // but we can ensure correctness here.
  }

  // Receives updates from appState
  onStateChange(globalState) {
    this.agentState = globalState.agentState;
    this.activeConceptId = globalState.currentConceptId;
    
    // Synchronize text read-outs
    document.getElementById('hud-ai-speech').textContent = globalState.aiSpeech || 'SYS // STANDBY...';
    document.getElementById('hud-user-speech').textContent = globalState.userSpeech || 'SYS // STANDBY_INPUT...';
    document.getElementById('hud-status-text').textContent = `SYS_STATE: ${globalState.agentState}`;
    
    // Sync indicator dot color
    const dot = document.getElementById('hud-status-dot');
    let dotColor = '#00f2fe';
    let pedMode = 'DIRECT_INSTRUCTION';
    
    // Adjust colors and waves based on state
    switch (globalState.agentState) {
      case 'IDLE':
        this.stateParams = {
          orbColor: '#00f2fe',
          orbScale: 1.0,
          waveColor: 'rgba(0, 242, 254, 0.2)',
          waveSpeed: 0.02,
          waveAmp: 3,
          waveFreq: 0.015,
          warpOffset: 0
        };
        dotColor = '#00f2fe';
        pedMode = 'STANDBY_LISTEN';
        break;
      case 'LISTENING':
        this.stateParams = {
          orbColor: '#3b82f6',
          orbScale: 1.1,
          waveColor: 'rgba(59, 130, 246, 0.6)',
          waveSpeed: 0.15,
          waveAmp: 18,
          waveFreq: 0.05,
          warpOffset: 4
        };
        dotColor = '#3b82f6';
        pedMode = 'AWAITING_STUDENT_RESPONSE';
        break;
      case 'THINKING':
      case 'ANALYZING UNDERSTANDING':
        this.stateParams = {
          orbColor: '#8b5cf6',
          orbScale: 0.95,
          waveColor: 'rgba(139, 92, 246, 0.5)',
          waveSpeed: 0.2,
          waveAmp: 6,
          waveFreq: 0.08,
          warpOffset: 12
        };
        dotColor = '#8b5cf6';
        pedMode = 'EVALUATING_SEMANTIC_GAPS';
        break;
      case 'SPEAKING':
        this.stateParams = {
          orbColor: '#10b981',
          orbScale: 1.08,
          waveColor: 'rgba(16, 185, 129, 0.6)',
          waveSpeed: 0.09,
          waveAmp: 14,
          waveFreq: 0.025,
          warpOffset: 2
        };
        dotColor = '#10b981';
        pedMode = 'PEDAGOGICAL_DELIVERY';
        break;
      case 'GAP DETECTED':
        this.stateParams = {
          orbColor: '#f59e0b',
          orbScale: 1.15,
          waveColor: 'rgba(245, 158, 11, 0.7)',
          waveSpeed: 0.25,
          waveAmp: 22,
          waveFreq: 0.06,
          warpOffset: 18
        };
        dotColor = '#f59e0b';
        pedMode = 'PEDAGOGICAL_RECONSTRUCT';
        break;
      case 'CORRECTING':
        this.stateParams = {
          orbColor: '#ec4899',
          orbScale: 1.05,
          waveColor: 'rgba(236, 72, 153, 0.6)',
          waveSpeed: 0.12,
          waveAmp: 10,
          waveFreq: 0.035,
          warpOffset: 6
        };
        dotColor = '#ec4899';
        pedMode = 'PEDAGOGICAL_REPAIR';
        break;
      case 'CONFIRMED':
      case 'ADVANCING':
        this.stateParams = {
          orbColor: '#06b6d4',
          orbScale: 1.1,
          waveColor: 'rgba(6, 182, 212, 0.5)',
          waveSpeed: 0.1,
          waveAmp: 12,
          waveFreq: 0.03,
          warpOffset: 3
        };
        dotColor = '#06b6d4';
        pedMode = 'CURRICULUM_TRANSITION';
        break;
    }

    dot.style.backgroundColor = dotColor;
    dot.style.boxShadow = `0 0 8px ${dotColor}`;
    document.getElementById('hud-pedagogical-mode').textContent = pedMode;
    document.getElementById('hud-pedagogical-mode').style.color = dotColor;

    // Load curriculum path data
    const curriculum = window.learningPaths[globalState.currentCurriculum];
    if (curriculum) {
      // Build concept nodes map
      const mockNodes = curriculum.concepts.map(node => {
        return {
          ...node,
          status: globalState.conceptsStatus[node.id] || node.status
        };
      });
      this.currentConcepts = mockNodes;
      this.renderRadialRoadmap();
    }
  }

  // Draw radial concentric roadmap nodes
  renderRadialRoadmap() {
    const container = document.getElementById('hud-radial-nodes');
    if (!container) return;
    container.innerHTML = '';

    const width = 350;
    const height = 280;
    const centerX = width / 2;
    const centerY = height / 2;

    this.currentConcepts.forEach((node, index) => {
      // Concentric target orbit radii based on status
      let radius = 125; // Default Outer (Unexplored)
      if (node.status === 'mastered') {
        radius = 45;   // Inner (Mastered)
      } else if (node.status === 'retesting' || node.status === 'partial-gap') {
        radius = 85;   // Middle (Probing)
      }

      // Distribute nodes evenly around the orbit based on index
      const angle = (index / this.currentConcepts.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Create Node dot
      const nodeEl = document.createElement('div');
      nodeEl.className = `hud-radial-node status-${node.status} ${node.id === this.activeConceptId ? 'active' : ''}`;
      nodeEl.style.left = `${x}px`;
      nodeEl.style.top = `${y}px`;
      nodeEl.style.borderColor = this.stateParams.orbColor;

      // Click to select node diagnostic
      nodeEl.addEventListener('click', () => {
        this.selectNodeDiagnostic(node);
      });

      // Label positioning offsets
      const labelEl = document.createElement('div');
      labelEl.className = 'hud-node-label';
      labelEl.textContent = node.name;
      
      // Offset labels outward
      const labelX = x + 10 * Math.cos(angle);
      const labelY = y + 10 * Math.sin(angle) - 15;
      labelEl.style.left = `${labelX}px`;
      labelEl.style.top = `${labelY}px`;

      container.appendChild(nodeEl);
      container.appendChild(labelEl);

      // Default initial diagnostic view to active concept
      if (node.id === this.activeConceptId) {
        this.selectNodeDiagnostic(node);
      }
    });
  }

  selectNodeDiagnostic(node) {
    document.getElementById('hud-active-concept-name').textContent = node.name;
    document.getElementById('hud-active-concept-desc').textContent = node.description || 'System syllabus subconcept file.';
    
    const statusEl = document.getElementById('hud-active-concept-status');
    statusEl.textContent = node.status.toUpperCase().replace('-', '_');
    
    // Set color matching node state
    if (node.status === 'mastered') statusEl.className = 'hud-val-accent';
    else if (node.status === 'not-tested') statusEl.className = 'hud-val-normal';
    else statusEl.className = 'hud-val-warning';
  }

  startAnimation() {
    const loop = () => {
      this.time += 0.05;
      
      this.drawOrb();
      this.drawWave();
      
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  drawOrb() {
    if (!this.orbCtx) return;
    const ctx = this.orbCtx;
    const width = this.orbCanvas.width;
    const height = this.orbCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    // Draw grid rings background
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.03)';
    ctx.lineWidth = 1;
    for (let r = 20; r < cx; r += 20) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer rotating ticks
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.1);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 20, 0);
      ctx.lineTo(cx - 10, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
    }
    ctx.restore();

    // Center Core Reactor Glow sphere
    const pulseScale = this.stateParams.orbScale + Math.sin(this.time * 2) * 0.03;
    const radius = 60 * pulseScale;
    
    // Draw fluid warp boundary (warpOffset creates geometric jitter)
    ctx.beginPath();
    const numPoints = 64;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      // Synthesize noise offset
      const noise = Math.sin(angle * 8 + this.time * 3) * this.stateParams.warpOffset * 0.3;
      const r = radius + noise;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    
    // Fill core with rich HUD gradient
    const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, radius);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, this.stateParams.orbColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.stateParams.orbColor;
    ctx.fill();
    ctx.shadowBlur = 0; // reset

    // Draw secondary orbiting dots around reactor core
    const orbitalAngle = -this.time * 0.5;
    ctx.fillStyle = this.stateParams.orbColor;
    for (let i = 0; i < 3; i++) {
      const dotAngle = orbitalAngle + (i * Math.PI * 2 / 3);
      const dotX = cx + (radius + 20) * Math.cos(dotAngle);
      const dotY = cy + (radius + 20) * Math.sin(dotAngle);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWave() {
    if (!this.waveCtx) return;
    const ctx = this.waveCtx;
    const width = this.waveCanvas.width;
    const height = this.waveCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // Technical grid overlay inside wave container
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.02)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += 30) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += 15) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw central zero line
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Render multi-layered soundwaves
    const drawSine = (ampMultiplier, speedOffset, opacity, lineWidth) => {
      ctx.strokeStyle = this.stateParams.waveColor.replace('rgba', 'rgba').replace(/[\d\.]+\)$/, `${opacity})`);
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      
      const speed = this.time * this.stateParams.waveSpeed * speedOffset;
      
      for (let x = 0; x < width; x++) {
        // Multi-frequency synthesis
        const y = height / 2 + 
          Math.sin(x * this.stateParams.waveFreq + speed) * this.stateParams.waveAmp * ampMultiplier +
          Math.sin(x * 0.08 - speed * 1.5) * 2;
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    // Draw three layers with different frequency harmonics
    if (this.agentState !== 'IDLE') {
      drawSine(0.5, 1.4, 0.15, 1);
      drawSine(0.8, -0.8, 0.25, 1);
    }
    drawSine(1.0, 1.0, 0.5, 1.5);
  }
}

// Instantiate on window load
window.addEventListener('load', () => {
  window.conceptA = new ConceptAHUD();
});
