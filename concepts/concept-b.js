// Concept B — Minimal AI Core JS

class ConceptBMinimal {
  constructor() {
    this.orbCore = document.getElementById('minimal-orb-core');
    this.currentConcepts = [];
    this.activeConceptId = null;
    this.agentState = 'IDLE';

    this.init();
  }

  init() {
    // Initial setups
  }

  onStateChange(globalState) {
    this.agentState = globalState.agentState;
    this.activeConceptId = globalState.currentConceptId;

    // 1. Sync speech text
    const aiSpeechEl = document.getElementById('minimal-ai-speech');
    const userSpeechEl = document.getElementById('minimal-user-speech');
    const stateLabelEl = document.getElementById('minimal-state-label');

    aiSpeechEl.textContent = globalState.aiSpeech ? `"${globalState.aiSpeech}"` : '...';
    userSpeechEl.textContent = globalState.userSpeech ? `"${globalState.userSpeech}"` : '';
    
    // Hide user speech block if empty
    userSpeechEl.style.display = globalState.userSpeech ? 'block' : 'none';

    stateLabelEl.textContent = globalState.agentStateLabel || 'Standby';

    // 2. Animate organic fluid orb properties based on system states
    let orbBg = '#ffffff';
    let scale = 1.0;
    let animSpeed = '6s';
    let blurVal = '14px';

    switch (globalState.agentState) {
      case 'IDLE':
        orbBg = '#ffffff';
        scale = 0.9;
        animSpeed = '9s';
        break;
      case 'LISTENING':
        orbBg = '#d1d1d6'; // neutral light grey
        scale = 1.15;
        animSpeed = '3s';
        break;
      case 'THINKING':
      case 'ANALYZING UNDERSTANDING':
        orbBg = '#e5e5ea';
        scale = 0.95;
        animSpeed = '1.5s';
        blurVal = '18px';
        break;
      case 'SPEAKING':
        orbBg = '#ffffff';
        scale = 1.08;
        animSpeed = '4.5s';
        break;
      case 'GAP DETECTED':
        orbBg = '#f59e0b'; // Amber warning
        scale = 1.25;
        animSpeed = '1.2s';
        break;
      case 'CORRECTING':
        orbBg = '#ec4899'; // Lavender repair
        scale = 1.05;
        animSpeed = '3.5s';
        break;
      case 'CONFIRMED':
      case 'ADVANCING':
        orbBg = '#3a3a3c'; // Settle dark
        scale = 1.1;
        animSpeed = '5s';
        break;
    }

    if (this.orbCore) {
      this.orbCore.style.backgroundColor = orbBg;
      this.orbCore.style.transform = `scale(${scale})`;
      this.orbCore.style.filter = `blur(${blurVal})`;
      
      // Update anim speed of pseudo elements
      this.orbCore.style.setProperty('--anim-speed-1', animSpeed);
    }

    // 3. Render minimal progress bar
    const curriculum = window.learningPaths[globalState.currentCurriculum];
    const progressContainer = document.getElementById('minimal-progress-container');
    
    if (curriculum && curriculum.concepts.length > 0) {
      progressContainer.classList.add('active');
      document.getElementById('minimal-progress-topic').textContent = curriculum.title.toUpperCase();
      
      // Find active concept index
      const activeIdx = curriculum.concepts.findIndex(c => c.id === this.activeConceptId);
      const total = curriculum.concepts.length;
      document.getElementById('minimal-progress-percent').textContent = `Concept ${activeIdx >= 0 ? activeIdx + 1 : 0} of ${total}`;

      this.currentConcepts = curriculum.concepts.map(node => ({
        ...node,
        status: globalState.conceptsStatus[node.id] || node.status
      }));

      this.renderProgressDots();
    } else {
      progressContainer.classList.remove('active');
      document.getElementById('minimal-progress-dots').innerHTML = '';
    }
  }

  renderProgressDots() {
    const container = document.getElementById('minimal-progress-dots');
    if (!container) return;
    container.innerHTML = '';

    this.currentConcepts.forEach((concept) => {
      const dot = document.createElement('div');
      dot.className = `minimal-dot status-${concept.status}`;
      
      if (concept.id === this.activeConceptId) {
        dot.classList.add('active');
      }

      // Contextual tooltip
      const tooltip = document.createElement('span');
      tooltip.className = 'minimal-dot-tooltip';
      tooltip.textContent = `${concept.name} (${concept.status.replace('-', ' ')})`;
      dot.appendChild(tooltip);

      container.appendChild(dot);
    });
  }
}

// Instantiate on window load
window.addEventListener('load', () => {
  window.conceptB = new ConceptBMinimal();
});
