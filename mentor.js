// mentor.js — Client-side orchestrator for Mentora
// Bridges voice/UI ↔ backend API ↔ AppState

class MentorClient {
  constructor(appState) {
    this.appState = appState;
    this.voice = new VoiceManager(appState);
    this.sessionId = null;
    this.sessionState = null;
    this.isProcessing = false;
    this.apiBase = ''; // Same origin for Vercel
    this._listenTimeout = null;

    this._bindVoiceCallbacks();
    this._bindUIEvents();
    this._bindVoiceErrors();
    this._bindSettingsUI();
  }

  // ──────────────────────────────────────────────
  // VOICE CALLBACKS
  // ──────────────────────────────────────────────
  _bindVoiceCallbacks() {
    // When speech recognition produces live interim text
    this.voice.onInterimTranscript = (text) => {
      if (!this.sessionId && text) {
        const goalInput = document.getElementById('goal-input');
        if (goalInput) goalInput.value = text;
        this._setGoalMicState(true, `Hearing: "${text}"`);
      }
    };

    // When speech recognition produces a final transcript
    this.voice.onTranscript = async (transcript) => {
      if (this.isProcessing || !transcript || !transcript.trim()) return;
      if (!this.sessionId) {
        const goalInput = document.getElementById('goal-input');
        if (goalInput) goalInput.value = transcript.trim();
        this._setGoalMicState(false);
        await this.startSession(transcript.trim());
      } else {
        await this.handleUserInput(transcript.trim());
      }
    };

    // When listening state changes
    this.voice.onListeningChange = (isListening) => {
      if (isListening) {
        this.appState.update({ agentState: 'LISTENING', agentStateLabel: 'LISTENING' });
        this._setMicButtonState('listening');
        if (!this.sessionId) this._setGoalMicState(true);
      } else if (!this.isProcessing) {
        this._setMicButtonState('idle');
        if (!this.sessionId) {
          this._setGoalMicState(false);
        }
      }
    };

    // When speaking state changes
    this.voice.onSpeakingChange = (isSpeaking) => {
      if (isSpeaking) {
        const currentState = this.appState ? this.appState.state.agentState : 'IDLE';
        // Only override to generic SPEAKING if not already showing a diagnostic pedagogical state
        const isPedagogical = ['CONFIRMED', 'GAP DETECTED', 'CORRECTING', 'RETESTING', 'SUMMARY'].includes(currentState);
        if (!isPedagogical) {
          this.appState.update({ agentState: 'SPEAKING', agentStateLabel: 'SPEAKING' });
        }
      }
      
      if (!isSpeaking && !this.isProcessing) {
        // If this was just a preview sample from settings, don't trigger auto-listen
        if (this.voice.isPreviewSpeaking) {
          this.voice.isPreviewSpeaking = false;
          return;
        }

        // Speech finished — immediately switch to listening
        if (this._listenTimeout) clearTimeout(this._listenTimeout);
        this._listenTimeout = setTimeout(() => {
          if (!this.isProcessing && this.sessionId && this.voice.autoListen) {
            this.appState.update({ agentState: 'LISTENING', agentStateLabel: 'YOUR TURN' });
            this.voice.startListening();
          } else if (!this.isProcessing) {
            this.appState.update({ agentState: 'IDLE', agentStateLabel: 'WAITING FOR INPUT' });
          }
        }, 200);
      }
    };
  }

  // ──────────────────────────────────────────────
  // UI EVENT BINDINGS
  // ──────────────────────────────────────────────
  _bindUIEvents() {
    // Mic button
    const micBtn = document.getElementById('mic-button');
    if (micBtn) {
      micBtn.addEventListener('click', () => this._handleMicClick());
    }

    // Text input
    const textInput = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-button');

    if (textInput) {
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._handleTextSubmit();
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this._handleTextSubmit());
    }

    // Goal input field (text)
    const goalInput = document.getElementById('goal-input');
    const goalBtn = document.getElementById('goal-submit');

    if (goalInput) {
      goalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._handleGoalSubmit();
        }
      });
    }

    if (goalBtn) {
      goalBtn.addEventListener('click', () => this._handleGoalSubmit());
    }

    // Goal mic button (voice goal input)
    const goalMicBtn = document.getElementById('goal-mic-btn');
    if (goalMicBtn) {
      goalMicBtn.addEventListener('click', () => this._handleGoalMicClick());
    }

    // Add Clear All Memory
    const clearMemBtn = document.getElementById('history-clear-btn') || document.getElementById('clear-history-btn');
    if (clearMemBtn) {
      clearMemBtn.addEventListener('click', () => {
        this._clearAllMemory();
      });
    }
  }

  _bindVoiceErrors() {
    window.addEventListener('voice-error', (e) => {
      if (!this.sessionId) {
        this._setGoalMicState(false, e.detail.message || 'Voice input failed. Please type your topic.', true);
      }
      this.appState.addDialogueMessage('system', e.detail.message);
    });
  }

  // ──────────────────────────────────────────────
  // SETTINGS UI BINDINGS
  // ──────────────────────────────────────────────
  _bindSettingsUI() {
    const accentSelect = document.getElementById('accent-select');
    const voiceSelect = document.getElementById('voice-select');
    const voiceTestBtn = document.getElementById('voice-test-btn');
    const speechRate = document.getElementById('speech-rate');
    const speechRateValue = document.getElementById('speech-rate-value');
    const autoListenToggle = document.getElementById('auto-listen-toggle');
    const showTranscriptToggle = document.getElementById('show-transcript-toggle');

    const syncVoiceControls = (byAccent) => {
      if (!byAccent || Object.keys(byAccent).length === 0) return;
      this._populateAccentSelect(accentSelect, byAccent);

      const currentVoiceName = this.voice.selectedVoiceName;
      let matchingAccent = 'all';

      if (currentVoiceName) {
        for (const [accent, voices] of Object.entries(byAccent)) {
          if (voices.some(v => v.name === currentVoiceName)) {
            matchingAccent = accent;
            break;
          }
        }
      } else if (accentSelect && accentSelect.querySelector('option[value="British English"]')) {
        matchingAccent = 'British English';
      }

      if (accentSelect) accentSelect.value = matchingAccent;
      this._populateVoiceSelect(voiceSelect, matchingAccent);
    };

    // Populate voices when they load
    window.addEventListener('voices-loaded', (e) => {
      syncVoiceControls(e.detail.byAccent);
    });

    // Also attempt immediately in case voices were already loaded synchronously
    if (this.voice.availableVoices.length > 0) {
      syncVoiceControls(this.voice.voicesByAccent);
    }

    // Accent change → repopulate voice list and switch live
    if (accentSelect) {
      accentSelect.addEventListener('change', () => {
        this._populateVoiceSelect(voiceSelect, accentSelect.value);
        if (voiceSelect && voiceSelect.value) {
          this.voice.setVoice(voiceSelect.value);
        }
      });
    }

    // Voice change → update voice live
    if (voiceSelect) {
      voiceSelect.addEventListener('change', () => {
        this.voice.setVoice(voiceSelect.value);
      });
    }

    // Test Voice Sample button
    if (voiceTestBtn) {
      voiceTestBtn.addEventListener('click', () => {
        this.voice.speakSample();
      });
    }

    // Speech rate slider → live speed change
    if (speechRate) {
      speechRate.value = this.voice.selectedRate;
      if (speechRateValue) speechRateValue.textContent = `${this.voice.selectedRate.toFixed(1)}×`;

      speechRate.addEventListener('input', () => {
        const rate = parseFloat(speechRate.value);
        this.voice.setRate(rate);
        if (speechRateValue) speechRateValue.textContent = `${rate.toFixed(1)}×`;
      });
    }

    // Auto-listen toggle
    if (autoListenToggle) {
      autoListenToggle.checked = this.voice.autoListen;
      autoListenToggle.addEventListener('change', () => {
        this.voice.setAutoListen(autoListenToggle.checked);
      });
    }

    // Show/hide transcript
    if (showTranscriptToggle) {
      showTranscriptToggle.addEventListener('change', () => {
        const transcript = document.getElementById('dialogue-stream');
        if (transcript) {
          transcript.classList.toggle('hidden', !showTranscriptToggle.checked);
        }
      });
    }
  }

  _populateAccentSelect(select, byAccent) {
    if (!select || !byAccent) return;
    select.innerHTML = '<option value="all">All English Voices</option>';

    // Sort accents with British English first as default
    const priority = ['British English', 'US English', 'Australian English', 'Indian English'];
    const accents = Object.keys(byAccent).sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    accents.forEach(accent => {
      if (!accent.includes('English') && !accent.startsWith('en')) return;
      const opt = document.createElement('option');
      opt.value = accent;
      opt.textContent = `${accent} (${byAccent[accent].length})`;
      select.appendChild(opt);
    });
  }

  _populateVoiceSelect(select, accent) {
    if (!select) return;
    select.innerHTML = '<option value="">Default (British English)</option>';

    const voices = this.voice.getVoicesForAccent(accent);
    const activeVoiceName = this.voice.selectedVoiceName;

    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name;
      if (activeVoiceName && activeVoiceName === v.name) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    // If active voice is not set or matches nothing in this accent, auto-select first available voice
    if (select.value === '' && voices.length > 0 && accent !== 'all') {
      select.value = voices[0].name;
    }
  }

  // ──────────────────────────────────────────────
  // SESSION START
  // ──────────────────────────────────────────────
  async startSession(goal) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Warm up microphone / AudioContext on user gesture
    this.voice.initContinuousVoice().catch(() => {});

    this._setGoalLoadingState(true, 'Designing your learning path...');

    this.appState.update({
      agentState: 'THINKING',
      agentStateLabel: 'UNDERSTANDING YOUR GOAL'
    });

    this.appState.addDialogueMessage('user', goal);

    try {
      const response = await this._apiCall('/api/session/start', { goal });

      this.sessionId = response.session_id;
      if (response.session_state) {
        this._saveSessionState(response.session_state);
      }
      this._handleAPIResponse(response);

      // Clear input on success and transition to conversation HUD
      const input = document.getElementById('goal-input');
      if (input) input.value = '';
      this._setGoalLoadingState(false);
      this._showConversationUI();

    } catch (error) {
      console.error('[Mentor] Session start failed:', error);
      const goalSection = document.getElementById('goal-section');
      if (goalSection) goalSection.style.display = 'flex';
      this._setGoalLoadingState(false, 'Could not start session. Please tap → to retry.', true);
      this.appState.addDialogueMessage('system', 'Failed to start session. Please try again.');
      this.appState.update({ agentState: 'IDLE', agentStateLabel: 'ERROR — TRY AGAIN' });
    } finally {
      this.isProcessing = false;
    }
  }

  // ──────────────────────────────────────────────
  // HISTORY / MEMORY MANAGEMENT
  // ──────────────────────────────────────────────
  
  _saveSessionState(state) {
    this.sessionState = state;
    try {
      const stored = JSON.parse(localStorage.getItem('mentora_sessions') || '{}');
      stored[state.id] = state;
      localStorage.setItem('mentora_sessions', JSON.stringify(stored));
    } catch(e) { console.error('Failed to save to localStorage', e); }
  }

  _clearAllMemory() {
    localStorage.removeItem('mentora_sessions');
    this.sessionId = null;
    this.sessionState = null;
    this.fetchHistory();
    // Reset UI to homepage
    const goalSection = document.getElementById('goal-section');
    const conversationSection = document.getElementById('conversation-controls');
    if (goalSection) goalSection.style.display = 'flex';
    if (conversationSection) conversationSection.style.display = 'none';
    this.appState.update({ agentState: 'IDLE', agentStateLabel: 'AWAITING CURIOSITY' });
  }

  async fetchHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="history-empty">Loading memory...</div>';
    
    try {
      const stored = JSON.parse(localStorage.getItem('mentora_sessions') || '{}');
      const sessions = Object.values(stored).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      
      if (sessions.length === 0) {
        listEl.innerHTML = '<div class="history-empty">No memories found. Start a session!</div>';
        return;
      }
      
      listEl.innerHTML = '';
      sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const date = new Date(session.createdAt).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        
        let score = 0;
        if (session.learningPath && session.learningPath.length > 0 && session.masteryMap) {
            session.learningPath.forEach(c => {
                const m = session.masteryMap[c.id];
                if (!m) return;
                switch (m.status) {
                    case 'MASTERED': score += 1.0; break;
                    case 'RETESTING': score += 0.5; break;
                    case 'IN_PROGRESS': score += 0.3; break;
                    case 'GAP': score += 0.1; break;
                }
            });
            score = Math.round((score / session.learningPath.length) * 100);
        } else {
            score = session.understanding_pct || 0;
        }
        
        item.innerHTML = `
          <div class="history-item-goal">${session.goal || session.topic || 'No goal specified'}</div>
          <div class="history-item-meta">
            <span>${date}</span>
            <span>${score}% Understanding</span>
          </div>
          <button class="history-item-delete" aria-label="Delete memory" data-id="${session.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        `;
        
        item.addEventListener('click', (e) => {
          if (e.target.closest('.history-item-delete')) {
            this.deleteMemory(session.id);
            return;
          }
          this.restoreSession(session.id);
        });
        
        listEl.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load memory:', error);
      listEl.innerHTML = '<div class="history-empty">Error loading memory.</div>';
    }
  }

  async restoreSession(sessionId) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    this.appState.update({
      agentState: 'THINKING',
      agentStateLabel: 'RECALLING MEMORY'
    });

    try {
      const stored = JSON.parse(localStorage.getItem('mentora_sessions') || '{}');
      const session = stored[sessionId];
      if (!session) throw new Error("Session not found in local memory");

      this.sessionId = session.id;
      this.sessionState = session;
      
      const mappedMastery = {};
      let restoredScore = 0;
      if (session.masteryMap) {
        for (const [id, m] of Object.entries(session.masteryMap)) {
          let cssStatus = 'locked';
          switch (m.status) {
            case 'MASTERED': cssStatus = 'mastered'; break;
            case 'RETESTING': cssStatus = 'retesting'; break;
            case 'GAP': cssStatus = 'gap-detected'; break;
            case 'IN_PROGRESS': cssStatus = 'in-progress'; break;
            default: cssStatus = 'locked'; break;
          }
          mappedMastery[id] = { ...m, cssStatus };
        }
      }

      if (session.learningPath && session.learningPath.length > 0 && session.masteryMap) {
        let score = 0;
        session.learningPath.forEach(c => {
          const m = session.masteryMap[c.id];
          if (!m) return;
          switch (m.status) {
            case 'MASTERED': score += 1.0; break;
            case 'RETESTING': score += 0.5; break;
            case 'IN_PROGRESS': score += 0.3; break;
            case 'GAP': score += 0.1; break;
          }
        });
        restoredScore = Math.round((score / session.learningPath.length) * 100);
      }

      if (Array.isArray(session.dialogueHistory) && session.dialogueHistory.length > 0) {
        this.appState.dialogueHistory = [...session.dialogueHistory];
        this.appState.reconstructDialogueFeed();
      }

      this._handleAPIResponse({
        session_id: session.id,
        session_state: session,
        tutor_state: 'IDLE',
        action: 'SPEAK',
        reply_text: 'I have restored your session. What would you like to discuss?',
        active_concept_id: session.activeConcept,
        current_gap_concept_id: session.currentGapConcept,
        mastery_map: mappedMastery,
        learning_path: session.learningPath,
        understanding_pct: restoredScore,
        phase: session.phase,
        topic: session.topic
      });
      
      this._showConversationUI();
      this._updateRoadmapBadge();
      
      setTimeout(() => {
        this.appState.update({ agentState: 'IDLE', agentStateLabel: 'LISTENING' });
        this.appState.drawRoadmapPaths();
        this.appState.drawGlobalConnector();
      }, 1000);
      
    } catch (err) {
      console.error('[Mentor] Restore failed:', err);
      this.appState.addDialogueMessage('system', 'Failed to restore session.');
      this.appState.update({ agentState: 'IDLE', agentStateLabel: 'ERROR' });
    } finally {
      this.isProcessing = false;
    }
  }

  async deleteMemory(sessionId) {
    try {
      const stored = JSON.parse(localStorage.getItem('mentora_sessions') || '{}');
      delete stored[sessionId];
      localStorage.setItem('mentora_sessions', JSON.stringify(stored));
      
      if (this.sessionId === sessionId) {
         this.sessionId = null;
         this.sessionState = null;
      }
      this.fetchHistory();
    } catch (err) {
      console.error('[Mentor] Delete failed:', err);
    }
  }

  // ──────────────────────────────────────────────
  // CONVERSATION TURN
  // ──────────────────────────────────────────────
  async handleUserInput(transcript) {
    if (this._listenTimeout) clearTimeout(this._listenTimeout);

    if (this.isProcessing || !transcript.trim()) return;

    // If no session yet, treat as goal
    if (!this.sessionId) {
      return this.startSession(transcript);
    }

    this.isProcessing = true;
    this.voice.stopListening();

    // Show the user's message
    this.appState.addDialogueMessage('user', transcript);

    // Set thinking state
    this.appState.update({
      agentState: 'THINKING',
      agentStateLabel: 'ANALYZING'
    });

    try {
      const response = await this._apiCall('/api/session/turn', {
        session_id: this.sessionId,
        transcript: transcript,
        session_state: this.sessionState
      });

      if (response.session_state) {
        this._saveSessionState(response.session_state);
      }
      this._handleAPIResponse(response);

    } catch (error) {
      console.error('[Mentor] Turn failed:', error);
      this.appState.addDialogueMessage('system', 'Something went wrong. Try again.');
      this.appState.update({ agentState: 'IDLE', agentStateLabel: 'ERROR — TRY AGAIN' });

      // Auto-retry listening after error
      setTimeout(() => {
        if (this.sessionId && this.voice.autoListen) {
          this.voice.startListening();
        }
      }, 2000);
    } finally {
      this.isProcessing = false;
    }
  }

  // ──────────────────────────────────────────────
  // RESPONSE HANDLER
  // ──────────────────────────────────────────────
  _handleAPIResponse(response) {
    // 1. Map tutor state for canvas
    const canvasState = this._mapToCanvasState(response.tutor_state, response.action);

    // 2. Update learning path in appState
    if (response.learning_path && response.learning_path.length > 0) {
      this.appState.state.learningPath = response.learning_path;
    }

    // 3. Update mastery map
    if (response.mastery_map) {
      this.appState.state.masteryMap = response.mastery_map;
    }

    // 4. Update active concept
    this.appState.state.activeConceptId = response.active_concept_id;
    this.appState.state.currentGapConceptId = response.current_gap_concept_id;

    // 5. Update understanding percentage
    if (response.understanding_pct !== undefined) {
      this.appState.state.understandingPct = response.understanding_pct;
    }

    // 6. Update topic
    if (response.topic) {
      this.appState.state.topic = response.topic;
    }

    // 7. Store phase
    this.appState.state.phase = response.phase;

    // 8. Handle summary
    if (response.summary) {
      this.appState.state.summary = response.summary;
    }

    // 9. Update the canvas and roadmap
    this.appState.update({
      agentState: canvasState,
      agentStateLabel: this._getStateLabel(canvasState, response.action)
    });

    // 10. Update roadmap badge
    this._updateRoadmapBadge();

    // 11. Show the tutor's reply in dialogue
    if (response.reply_text) {
      this.appState.addDialogueMessage('tutor', response.reply_text);

      // 12. Speak the reply
      this.voice.speak(response.reply_text);
    }

    // 13. If session complete, show summary
    if (response.phase === 'complete' && response.summary) {
      this._showSummaryOverlay(response.summary, response.understanding_pct);
    }
  }

  // ──────────────────────────────────────────────
  // STATE MAPPING
  // ──────────────────────────────────────────────
  _mapToCanvasState(tutorState, action) {
    const map = {
      'IDLE': 'IDLE',
      'LISTENING': 'LISTENING',
      'THINKING': 'THINKING',
      'SPEAKING': 'SPEAKING',
      'ANALYZING': 'ANALYZING UNDERSTANDING',
      'GAP_DETECTED': 'GAP DETECTED',
      'PROBING': 'CORRECTING',
      'CORRECTING': 'CORRECTING',
      'RETESTING': 'RETESTING',
      'CONFIRMED': 'CONFIRMED',
      'MASTERY_CONFIRMED': 'CONFIRMED',
      'ADVANCING': 'CONFIRMED',
      'SUMMARY': 'SUMMARY'
    };

    return map[tutorState] || map[action] || 'SPEAKING';
  }

  _getStateLabel(canvasState, action) {
    const labels = {
      'IDLE': 'AWAITING CURIOSITY',
      'LISTENING': 'LISTENING',
      'THINKING': 'ANALYZING',
      'ANALYZING UNDERSTANDING': 'ANALYZING UNDERSTANDING',
      'SPEAKING': this._getSpeakingLabel(action),
      'GAP DETECTED': 'CONCEPTUAL GAP DETECTED',
      'CORRECTING': 'PROBING UNDERSTANDING',
      'RETESTING': 'RETESTING CONCEPT',
      'CONFIRMED': 'MASTERY CONFIRMED',
      'SUMMARY': 'SESSION COMPLETE'
    };
    return labels[canvasState] || canvasState;
  }

  _getSpeakingLabel(action) {
    switch (action) {
      case 'TEACH': return 'TEACHING CONCEPT';
      case 'PROBE': return 'PROBING DEEPER';
      case 'CORRECT_AND_REASK': return 'CORRECTING';
      case 'QUIZ': return 'CHALLENGE QUESTION';
      case 'DISCOVER': return 'UNDERSTANDING YOUR GOAL';
      case 'ADVANCE': return 'ADVANCING';
      default: return 'SPEAKING';
    }
  }

  // ──────────────────────────────────────────────
  // UI CONTROL
  // ──────────────────────────────────────────────
  _handleMicClick() {
    if (this.isProcessing) return;

    if (this.voice.isSpeaking) {
      // Barge-in manually via button
      this.voice.cancelSpeech();
      this.voice.isContinuousMuted = false;
      this.voice.startListening();
      return;
    }

    if (this.voice.isListening) {
      // Manual stop (force send whatever user spoke)
      this.voice.stopListening();
    } else {
      this.voice.isContinuousMuted = false;
      this.voice.startListening();
    }
  }

  _handleGoalMicClick() {
    if (this.isProcessing) return;

    if (this.voice.isListening) {
      this.voice.stopListening();
    } else {
      this._setGoalMicState(true, 'Listening... Speak your topic now!');
      this.voice.isContinuousMuted = false;
      this.voice.startListening();
    }
  }

  _handleTextSubmit() {
    const input = document.getElementById('text-input');
    if (!input || !input.value.trim()) return;

    if (this._listenTimeout) clearTimeout(this._listenTimeout);

    const text = input.value.trim();
    input.value = '';

    // Cancel any TTS
    if (this.voice.isSpeaking) {
      this.voice.cancelSpeech();
    }

    this.voice.initContinuousVoice().catch(() => {});
    this.handleUserInput(text);
  }

  _handleGoalSubmit() {
    const input = document.getElementById('goal-input');
    if (!input || !input.value.trim() || this.isProcessing) return;

    const goal = input.value.trim();
    this._setGoalMicState(false);
    this.startSession(goal);
  }

  _setGoalMicState(isListening, message = '', isError = false) {
    const goalMicBtn = document.getElementById('goal-mic-btn');
    const goalInput = document.getElementById('goal-input');
    const statusEl = document.getElementById('goal-status');

    if (goalMicBtn) {
      goalMicBtn.classList.toggle('listening', isListening);
      goalMicBtn.setAttribute('aria-pressed', isListening ? 'true' : 'false');
      goalMicBtn.innerHTML = isListening
        ? '<span>&#9632;</span> Tap again to send'
        : '<span>&#127908;</span> Speak your goal';
    }

    if (goalInput && !goalInput.disabled) {
      goalInput.placeholder = isListening
        ? 'Listening... speak your topic!'
        : 'e.g. Neural Networks, TCP/IP, Economics...';
    }

    if (statusEl) {
      if (message) {
        statusEl.textContent = message;
        statusEl.className = isError ? 'goal-card-status error' : 'goal-card-status';
        statusEl.style.display = 'block';
      } else if (!isListening) {
        statusEl.style.display = 'none';
      }
    }
  }

  _setGoalLoadingState(isLoading, message = '', isError = false) {
    const input = document.getElementById('goal-input');
    const submitBtn = document.getElementById('goal-submit');
    const statusEl = document.getElementById('goal-status');
    const arrow = submitBtn ? submitBtn.querySelector('.goal-submit-arrow') : null;
    const spinner = submitBtn ? submitBtn.querySelector('.goal-submit-spinner') : null;

    if (input) input.disabled = isLoading;
    if (submitBtn) submitBtn.disabled = isLoading;

    if (arrow) arrow.style.display = isLoading ? 'none' : 'inline-block';
    if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';

    if (statusEl) {
      if (message) {
        statusEl.textContent = message;
        statusEl.className = isError ? 'goal-card-status error' : 'goal-card-status';
        statusEl.style.display = 'block';
      } else {
        statusEl.style.display = 'none';
      }
    }
  }

  _showConversationUI() {
    const goalSection = document.getElementById('goal-section');
    const conversationSection = document.getElementById('conversation-controls');

    if (goalSection) goalSection.style.display = 'none';
    if (conversationSection) conversationSection.style.display = 'flex';
  }

  _setMicButtonState(state) {
    const btn = document.getElementById('mic-button');
    if (!btn) return;

    btn.classList.remove('mic-idle', 'mic-listening', 'mic-processing');
    btn.classList.add(`mic-${state}`);

    const icon = btn.querySelector('.mic-icon');
    if (icon) {
      const micSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
      const pauseSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      const spinnerSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: hudRotate 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
      switch (state) {
        case 'listening':
          icon.innerHTML = pauseSvg;
          break;
        case 'processing':
          icon.innerHTML = spinnerSvg;
          break;
        default:
          icon.innerHTML = micSvg;
      }
    }
  }

  _updateRoadmapBadge() {
    const badge = document.getElementById('top-bar-progress');
    if (!badge) return;

    const path = this.appState.state.learningPath;
    if (path && path.length > 0) {
      const mastered = Object.values(this.appState.state.masteryMap || {})
        .filter(m => (m.status || m.cssStatus) === 'mastered' || m.status === 'MASTERED').length;
      badge.textContent = `PROGRESS: ${mastered} / ${path.length} CONCEPTS`;
      badge.style.display = 'block';
    }
  }

  _showSummaryOverlay(summary, understandingPct) {
    const overlay = document.getElementById('summary-overlay');
    if (!overlay) return;

    const masteredList = (summary.mastered || []).map(c => `<li>✓ ${c}</li>`).join('');
    const needsPracticeList = (summary.needs_practice || []).map(c => `<li>⚠ ${c}</li>`).join('');
    const gapsList = (summary.gaps_fixed || []).map(g => `<li>→ ${g}</li>`).join('');

    overlay.innerHTML = `
      <div class="summary-card">
        <div class="summary-title">SESSION COMPLETE</div>
        <div class="summary-pct">${understandingPct || summary.understanding_pct || 0}%</div>
        <div class="summary-label">Understanding</div>

        ${masteredList ? `
          <div class="summary-section">
            <div class="summary-section-title">Mastered</div>
            <ul>${masteredList}</ul>
          </div>
        ` : ''}

        ${needsPracticeList ? `
          <div class="summary-section">
            <div class="summary-section-title">Needs Practice</div>
            <ul>${needsPracticeList}</ul>
          </div>
        ` : ''}

        ${gapsList ? `
          <div class="summary-section">
            <div class="summary-section-title">What We Fixed</div>
            <ul>${gapsList}</ul>
          </div>
        ` : ''}

        ${summary.next_step ? `
          <div class="summary-section">
            <div class="summary-section-title">Recommended Next Step</div>
            <p>${summary.next_step}</p>
          </div>
        ` : ''}

        <button class="summary-restart-btn" onclick="location.reload()">Start New Session</button>
      </div>
    `;

    overlay.classList.add('visible');
  }

  // ──────────────────────────────────────────────
  // API CALL HELPER
  // ──────────────────────────────────────────────
  async _apiCall(endpoint, body) {
    const res = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errData.error || `API error ${res.status}`);
    }

    return res.json();
  }
}

window.MentorClient = MentorClient;
