// Concept D — Unified Core JS

class ConceptDUnified {
  constructor() {
    this.orbCanvas = document.getElementById('unified-orb-canvas-d');
    this.nodesLayer = document.getElementById('unified-nodes-layer');
    this.svgContainer = document.getElementById('unified-svg-lines');
    
    this.orbCtx = this.orbCanvas ? this.orbCanvas.getContext('2d') : null;
    
    this.currentConcepts = [];
    this.activeConceptId = null;
    this.agentState = 'IDLE';

    this.telemetryTimeout = null;
    this.waveInterval = null;
    this.waveTime = 0;
    this.time = 0;

    // Default parameters
    this.orbParams = {
      orbColor: '#00f2fe',
      scale: 1.0,
      warpOffset: 0
    };

    this.init();
  }

  init() {
    this.startVoiceBarsAnimation();
    this.startOrbAnimation();
    
    // Bind resize handler to redraw connections correctly
    window.addEventListener('resize', () => this.drawConnections());
  }

  // Receives updates from appState
  onStateChange(globalState) {
    this.agentState = globalState.agentState;
    this.activeConceptId = globalState.currentConceptId;

    // 1. Dialogue Updates
    const aiSpeechEl = document.getElementById('unified-ai-speech');
    const userSpeechEl = document.getElementById('unified-user-speech');
    
    aiSpeechEl.textContent = globalState.aiSpeech ? `"${globalState.aiSpeech}"` : '...';
    userSpeechEl.textContent = globalState.userSpeech ? `"${globalState.userSpeech}"` : '';
    userSpeechEl.style.display = globalState.userSpeech ? 'block' : 'none';

    // Hide text containers in summary mode
    const dialogueSpace = document.querySelector('.unified-dialogue-space');
    if (globalState.agentState === 'SUMMARY') {
      dialogueSpace.style.opacity = '0';
      dialogueSpace.style.pointerEvents = 'none';
      document.getElementById('unified-summary-panel').classList.add('active');
    } else {
      dialogueSpace.style.opacity = '1';
      dialogueSpace.style.pointerEvents = 'auto';
      document.getElementById('unified-summary-panel').classList.remove('active');
    }

    // 2. Canvas Orb Parameters
    let orbColor = '#00f2fe';
    let scale = 1.0;
    let warpOffset = 0;
    
    switch (globalState.agentState) {
      case 'IDLE':
        orbColor = '#00f2fe';
        scale = 0.95;
        warpOffset = 0;
        break;
      case 'LISTENING':
        orbColor = '#3b82f6';
        scale = 1.15;
        warpOffset = 6;
        break;
      case 'THINKING':
      case 'ANALYZING UNDERSTANDING':
        orbColor = '#8b5cf6';
        scale = 0.92;
        warpOffset = 14;
        break;
      case 'SPEAKING':
        orbColor = '#ffffff';
        scale = 1.08;
        warpOffset = 3;
        break;
      case 'GAP DETECTED':
        orbColor = '#f59e0b'; // Amber gap indicator (restrained)
        scale = 1.2;
        warpOffset = 18;
        break;
      case 'CORRECTING':
        orbColor = '#ec4899'; // Lavender retest
        scale = 1.02;
        warpOffset = 8;
        break;
      case 'CONFIRMED':
      case 'ADVANCING':
        orbColor = '#10b981'; // Settle green glow
        scale = 1.1;
        warpOffset = 2;
        break;
      case 'SUMMARY':
        orbColor = '#00f2fe';
        scale = 0.8;
        warpOffset = 0;
        break;
    }

    this.orbParams = { orbColor, scale, warpOffset };

    // 3. Sparse Contextual Jarvis Telemetry (Triggered only during state changes, then fades)
    const telemetryContainer = document.getElementById('unified-telemetry-container');
    const telemetryState = document.getElementById('unified-telemetry-state');
    
    // Clear any active telemetry timer
    if (this.telemetryTimeout) {
      clearTimeout(this.telemetryTimeout);
    }

    // Check if the current state labels represent an active process worth displaying
    const showTelemetry = [
      'UNDERSTANDING YOUR GOAL',
      'BUILDING ROADMAP',
      'Roadmap Materialized',
      'ANALYZING UNDERSTANDING',
      'CONCEPTUAL GAP DETECTED',
      'PROBING UNDERSTANDING',
      'CORRECTING',
      'MASTERY CONFIRMED',
      'SESSION COMPLETE'
    ].includes(globalState.agentStateLabel);

    if (showTelemetry) {
      telemetryState.textContent = globalState.agentStateLabel.toUpperCase();
      telemetryContainer.classList.add('active');
      
      // Auto fade-out after 3.5 seconds to avoid persistent clutter
      this.telemetryTimeout = setTimeout(() => {
        telemetryContainer.classList.remove('active');
      }, 3500);
    } else {
      telemetryContainer.classList.remove('active');
    }

    // 4. Render Orbital nodes
    const curriculum = window.learningPaths[globalState.currentCurriculum];
    if (curriculum && curriculum.concepts.length > 0) {
      this.currentConcepts = curriculum.concepts.map(node => ({
        ...node,
        status: globalState.conceptsStatus[node.id] || node.status
      }));
      
      // Control node visibility based on step
      // Step 3 or lower: path is building, do not show concepts yet
      const showPath = globalState.stepIndex >= 4;
      this.renderOrbitNodes(showPath);
    } else {
      this.nodesLayer.innerHTML = '';
      this.svgContainer.innerHTML = '';
    }
  }

  // Render minimal nodes in snapped concentric orbital rings with asymmetric offsets
  renderOrbitNodes(showPath) {
    if (!this.nodesLayer) return;
    this.nodesLayer.innerHTML = '';

    const width = this.nodesLayer.clientWidth;
    const height = this.nodesLayer.clientHeight;
    const cx = width / 2;
    const cy = height / 2;

    this.currentConcepts.forEach((node, index) => {
      const card = document.createElement('div');
      card.className = `unified-concept-node status-${node.status}`;
      
      if (node.id === this.activeConceptId) {
        card.classList.add('active');
      }

      // Add concept dot and text
      card.innerHTML = `
        <span class="unified-node-dot"></span>
        <span class="unified-node-text">${node.name}</span>
      `;

      // 1. Calculate angle of the node based on mock data coordinates
      const angle = Math.atan2(node.y, node.x);

      // 2. Select Concentric Orbit Radius (snapping)
      // Inner ring: 90px (mastered)
      // Middle ring: 155px (active, retesting, gap)
      // Outer ring: 220px (unexplored)
      let radius = 220;
      if (node.status === 'mastered') {
        radius = 90;
      } else if (node.status === 'retesting' || node.status === 'partial-gap' || node.id === this.activeConceptId) {
        radius = 155;
      }

      // Add subtle active orbital pull
      if (node.id === this.activeConceptId) {
        radius -= 10;
      }

      // 3. Compute final layout coordinates
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      card.style.left = `${x}px`;
      card.style.top = `${y}px`;

      this.nodesLayer.appendChild(card);

      // Trigger staggered fade-in transition
      if (showPath && this.agentState !== 'SUMMARY') {
        setTimeout(() => {
          card.classList.add('visible');
        }, index * 200); // 200ms stagger delay
      }
    });

    // Draw concentric radar lines and ticks
    this.drawConnections();
  }

  drawConnections() {
    if (!this.svgContainer || !this.nodesLayer) return;
    this.svgContainer.innerHTML = '';

    const width = this.nodesLayer.clientWidth;
    const height = this.nodesLayer.clientHeight;
    const cx = width / 2;
    const cy = height / 2;

    const visibleNodes = document.querySelectorAll('.unified-concept-node.visible');
    // If the path is not active or no concepts are visible, do not draw the radar rings
    if (this.agentState === 'SUMMARY' || visibleNodes.length === 0) return;

    // 1. Draw concentric dashed circles representing orbits
    // Radii: 90, 155, 220
    const radii = [90, 155, 220];
    
    // Find active ring radius to draw highlight line
    let activeRadius = null;
    const activeNode = this.currentConcepts.find(n => n.id === this.activeConceptId);
    if (activeNode) {
      if (activeNode.status === 'mastered') activeRadius = 90;
      else if (activeNode.status === 'retesting' || activeNode.status === 'partial-gap' || activeNode.id === this.activeConceptId) activeRadius = 155;
    }

    radii.forEach(r => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      
      let ringClass = 'unified-edge-line';
      if (r === activeRadius) {
        ringClass += ' unified-active-radar-ring';
      }
      circle.setAttribute('class', ringClass);
      this.svgContainer.appendChild(circle);

      // 2. Draw 8 radial calibration tick lines crossing this ring at 45deg angles
      // (Ticks stretch from r-4 to r+4)
      for (let i = 0; i < 8; i++) {
        const tickAngle = (i * Math.PI) / 4;
        const tickLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const x1 = cx + (r - 4) * Math.cos(tickAngle);
        const y1 = cy + (r - 4) * Math.sin(tickAngle);
        const x2 = cx + (r + 4) * Math.cos(tickAngle);
        const y2 = cy + (r + 4) * Math.sin(tickAngle);

        tickLine.setAttribute('x1', x1);
        tickLine.setAttribute('y1', y1);
        tickLine.setAttribute('x2', x2);
        tickLine.setAttribute('y2', y2);
        tickLine.setAttribute('class', 'unified-radar-tick');
        this.svgContainer.appendChild(tickLine);
      }
    });
  }

  // Voice bars reactive animation
  startVoiceBarsAnimation() {
    const barsContainer = document.getElementById('unified-voice-bars');
    const bars = document.querySelectorAll('#unified-voice-bars .uni-bar');
    
    this.waveInterval = setInterval(() => {
      this.waveTime += 0.2;
      
      const isSpeaking = this.agentState === 'SPEAKING';
      const isListening = this.agentState === 'LISTENING';
      
      if (isSpeaking || isListening) {
        barsContainer.classList.add('active');
        
        bars.forEach((bar, idx) => {
          let height = 3;
          if (isListening) {
            // Loud noisy bounce
            height = Math.floor(Math.random() * 12) + 3;
          } else {
            // Smooth vocal harmonic rhythm
            height = Math.sin(this.waveTime + idx * 0.8) * 6 + 7;
          }
          bar.style.height = `${Math.max(3, height)}px`;
        });
      } else {
        barsContainer.classList.remove('active');
        bars.forEach(bar => {
          bar.style.height = '3px';
        });
      }
    }, 70);
  }

  // Canvas Orb animation loop
  startOrbAnimation() {
    const loop = () => {
      this.time += 0.05;
      this.drawOrb();
      requestAnimationFrame(loop);
    };
    loop();
  }

  drawOrb() {
    if (!this.orbCtx || !this.orbCanvas) return;
    const ctx = this.orbCtx;
    const width = this.orbCanvas.width;
    const height = this.orbCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    
    ctx.clearRect(0, 0, width, height);

    // Draw background concentric grid circles
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.02)';
    ctx.lineWidth = 1;
    for (let r = 15; r < cx; r += 15) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer rotating ticks drawn directly onto canvas
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.08);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.12)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 15, 0);
      ctx.lineTo(cx - 8, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 3);
    }
    ctx.restore();

    // Center Core Reactor Glow sphere
    const pulseScale = this.orbParams.scale + Math.sin(this.time * 2) * 0.02;
    const radius = 40 * pulseScale;
    
    ctx.beginPath();
    const numPoints = 48;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      // Core shape morph overlay (restrained)
      const noise = Math.sin(angle * 6 + this.time * 2.5) * this.orbParams.warpOffset * 0.25;
      const r = radius + noise;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    
    const grad = ctx.createRadialGradient(cx, cy, 3, cx, cy, radius);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, this.orbParams.orbColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.orbParams.orbColor;
    ctx.fill();
    ctx.shadowBlur = 0; // reset
  }
}

// Instantiate on window load
window.addEventListener('load', () => {
  window.conceptD = new ConceptDUnified();
});
