// Concept C — Living Knowledge Space JS

class ConceptCLivingSpace {
  constructor() {
    this.nodesLayer = document.getElementById('space-nodes-layer');
    this.svgContainer = document.getElementById('space-svg-connections');
    
    this.currentConcepts = [];
    this.connections = [];
    this.activeConceptId = null;
    this.agentState = 'IDLE';

    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;

    this.waveInterval = null;
    this.init();
  }

  init() {
    this.startWaveformAnimation();
  }

  onResize() {
    this.repositionConnections();
    this.centerOnActiveNode();
  }

  onStateChange(globalState) {
    this.agentState = globalState.agentState;
    this.activeConceptId = globalState.currentConceptId;

    // Sync speech dock texts
    document.getElementById('space-ai-speech').textContent = globalState.aiSpeech || 'Awaiting syllabus...';
    
    const userSpeechEl = document.getElementById('space-user-speech');
    userSpeechEl.textContent = globalState.userSpeech || '';
    userSpeechEl.style.display = globalState.userSpeech ? 'block' : 'none';

    // Sync state badge
    document.getElementById('space-state-text').textContent = globalState.agentStateLabel;
    
    const badgePulse = document.querySelector('.space-state-pulse');
    let stateColor = '#a855f7'; // Purple default
    switch (globalState.agentState) {
      case 'LISTENING': stateColor = '#3b82f6'; break;
      case 'THINKING':
      case 'ANALYZING UNDERSTANDING': stateColor = '#8b5cf6'; break;
      case 'SPEAKING': stateColor = '#10b981'; break;
      case 'GAP DETECTED': stateColor = '#f59e0b'; break;
      case 'CORRECTING': stateColor = '#ec4899'; break;
      case 'CONFIRMED':
      case 'ADVANCING': stateColor = '#06b6d4'; break;
    }
    badgePulse.style.backgroundColor = stateColor;

    // Load curriculum data
    const curriculum = window.learningPaths[globalState.currentCurriculum];
    if (curriculum) {
      // Use generated dynamic concepts from vague path if present, otherwise default path concepts
      const sourceConcepts = (globalState.generatedConcepts && globalState.generatedConcepts.length > 0) 
        ? globalState.generatedConcepts 
        : curriculum.concepts;
        
      this.currentConcepts = sourceConcepts.map(c => ({
        ...c,
        status: globalState.conceptsStatus[c.id] || c.status
      }));

      // Connections are linear for vague curiosity, structured for neuralNetworks
      this.connections = (globalState.generatedConcepts && globalState.generatedConcepts.length > 0)
        ? this.generateLinearConnections(sourceConcepts)
        : (curriculum.connections || []);

      this.renderGraph();
      this.centerOnActiveNode();
    }
  }

  generateLinearConnections(concepts) {
    const list = [];
    for (let i = 0; i < concepts.length - 1; i++) {
      list.push({ from: concepts[i].id, to: concepts[i+1].id });
    }
    return list;
  }

  renderGraph() {
    if (!this.nodesLayer) return;
    this.nodesLayer.innerHTML = '';

    // Draw Node Cards
    this.currentConcepts.forEach((node) => {
      const card = document.createElement('div');
      card.className = `space-node-card status-${node.status}`;
      card.id = `space-node-${node.id}`;
      card.style.left = `${node.x}px`;
      card.style.top = `${node.y}px`;

      if (node.id === this.activeConceptId) {
        card.classList.add('active');
        this.updateFocusPanel(node);
      }

      card.innerHTML = `
        <div class="space-node-header">
          <span class="space-node-title">${node.name}</span>
          <span class="space-node-status-dot"></span>
        </div>
      `;

      card.addEventListener('click', () => {
        // Clear active borders and focus on clicked node
        document.querySelectorAll('.space-node-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.updateFocusPanel(node);
        
        // Temporarily shift center focus to clicked node
        this.activeConceptId = node.id;
        this.centerOnActiveNode();
      });

      this.nodesLayer.appendChild(card);
    });

    // Draw Connection Lines in SVG
    this.repositionConnections();
  }

  repositionConnections() {
    if (!this.svgContainer) return;
    this.svgContainer.innerHTML = '';

    this.connections.forEach((conn) => {
      const fromNode = this.currentConcepts.find(n => n.id === conn.from);
      const toNode = this.currentConcepts.find(n => n.id === conn.to);

      if (fromNode && toNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromNode.x);
        line.setAttribute('y1', fromNode.y);
        line.setAttribute('x2', toNode.x);
        line.setAttribute('y2', toNode.y);

        let edgeClass = 'space-edge-line';
        if (fromNode.status === 'mastered' && toNode.status === 'mastered') {
          edgeClass += ' mastered';
        } else if (fromNode.id === this.activeConceptId || toNode.id === this.activeConceptId) {
          edgeClass += ' active';
        }
        
        line.setAttribute('class', edgeClass);
        this.svgContainer.appendChild(line);
      }
    });
  }

  updateFocusPanel(node) {
    const panel = document.getElementById('space-focus-panel');
    panel.classList.add('active');

    document.getElementById('space-focus-title').textContent = node.name;
    document.getElementById('space-focus-description').textContent = node.description || 'Active subject of the current pedagogical dialogue segment.';
    
    const gaugeFill = document.getElementById('space-focus-gauge');
    const gaugeStatus = document.getElementById('space-focus-status');
    
    let fillWidth = '0%';
    let statusText = 'UNEXPLORED';
    let statusColor = '#64748b';

    switch (node.status) {
      case 'mastered':
        fillWidth = '100%';
        statusText = 'MASTERED';
        statusColor = '#10b981';
        break;
      case 'retesting':
        fillWidth = '75%';
        statusText = 'RETESTING';
        statusColor = '#ec4899';
        break;
      case 'partial-gap':
        fillWidth = '33%';
        statusText = 'GAP DETECTED';
        statusColor = '#f59e0b';
        break;
      case 'not-tested':
        fillWidth = '0%';
        statusText = 'NOT TESTED';
        statusColor = '#475569';
        break;
    }

    gaugeFill.style.width = fillWidth;
    gaugeFill.style.background = `linear-gradient(90deg, ${statusColor}, #a855f7)`;
    gaugeStatus.textContent = statusText;
    gaugeStatus.style.color = statusColor;
  }

  // Physics-like pan and center viewport camera flight
  centerOnActiveNode() {
    const activeNode = this.currentConcepts.find(n => n.id === this.activeConceptId);
    if (!activeNode) return;

    // Get parent viewport bounds
    const viewport = document.getElementById('concept-c-workspace');
    if (!viewport) return;
    
    const viewWidth = viewport.clientWidth;
    const viewHeight = viewport.clientHeight;

    // Target offsets to position active node exactly in viewport center
    // (offsetting slightly left to accommodate the Focus Panel width)
    const offsetX = viewWidth / 2 - activeNode.x + 80;
    const offsetY = viewHeight / 2 - activeNode.y - 30;

    // Apply transformation
    this.nodesLayer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    this.svgContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }

  startWaveformAnimation() {
    const bars = document.querySelectorAll('#space-voice-waveform-c .wave-bar');
    
    this.waveInterval = setInterval(() => {
      bars.forEach((bar, idx) => {
        let height = '3px';
        
        switch (this.agentState) {
          case 'LISTENING':
            // High noisy random bounce
            height = `${Math.floor(Math.random() * 20) + 4}px`;
            break;
          case 'SPEAKING':
            // Periodic harmonic vocal rhythm
            const bounce = Math.sin(Date.now() * 0.015 + idx * 0.5) * 12 + 10;
            height = `${Math.max(3, bounce)}px`;
            break;
          case 'THINKING':
          case 'ANALYZING UNDERSTANDING':
            // Rhythmic scanner scroll
            const speed = (Date.now() * 0.005) % (Math.PI * 2);
            const thinkBounce = Math.sin(speed + idx * 0.6) * 5 + 8;
            height = `${Math.max(3, thinkBounce)}px`;
            break;
          case 'IDLE':
          default:
            // Static flat line
            height = '3px';
            break;
        }
        
        bar.style.height = height;
      });
    }, 80);
  }
}

// Instantiate on window load
window.addEventListener('load', () => {
  window.conceptC = new ConceptCLivingSpace();
});
