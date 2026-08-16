// voice.js — Web Speech API manager for Mentora
// Handles: SpeechRecognition (STT), speechSynthesis (TTS), real audio reactivity
// Includes: voice/accent selection, persistence, faster VAD

class VoiceManager {
  constructor(appState) {
    this.appState = appState;
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.isSpeaking = false;
    this.audioContext = null;
    this.analyser = null;
    this.micStream = null;
    this.onTranscript = null; // callback(transcript)
    this.onListeningChange = null; // callback(isListening)
    this.onSpeakingChange = null; // callback(isSpeaking)
    this.amplitudeInterval = null;
    this.isContinuousMuted = false;
    this.listenStartedAt = 0;
    this.hasDetectedSpeech = false;

    // Voice/accent selection
    this.selectedVoice = null;
    this.selectedRate = 1.0;
    this.autoListen = true;
    this.availableVoices = [];
    this.voicesByAccent = {};

    this._initSpeechRecognition();
    this._loadVoicePreferences();
    this._initVoiceList();
  }

  // ──────────────────────────────────────────────
  // SPEECH RECOGNITION (STT)
  // ──────────────────────────────────────────────
  _initSpeechRecognition() {
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  /**
   * Start listening for speech input via MediaRecorder
   */
  async startListening() {
    if (this.isListening) return true;

    // Stop any ongoing tutor speech
    if (this.isSpeaking) {
      this.cancelSpeech();
    }

    try {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      const ok = await this.initContinuousVoice();
      if (!ok) return false;

      this.audioChunks = [];

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch(e) {}
      }

      this.mediaRecorder = new MediaRecorder(this.micStream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        if (audioBlob.size > 500) {
          await this._transcribeAudio(audioBlob);
        } else {
          console.warn('[Voice] Audio recording was empty');
        }
      };

      this.mediaRecorder.start(250);
      this.isListening = true;
      this.isContinuousMuted = false;
      if (this.onListeningChange) this.onListeningChange(true);
      return true;

    } catch (err) {
      console.error('[Voice] Failed to start listening:', err);
      this._showError('Microphone access failed. Please check permissions.');
      return false;
    }
  }

  /**
   * Stop listening and trigger transcription
   */
  stopListening() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.isListening = false;
    if (this.onListeningChange) this.onListeningChange(false);
  }

  async initContinuousVoice() {
    if (this.micStream && this.micStream.active) return true;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });
      this._setupAudioAnalyser(this.micStream);
      this._startContinuousAmplitudeTracking();
      return true;
    } catch (err) {
      console.warn('[Voice] Microphone stream access notice:', err.message);
      this._showError('Could not access microphone.');
      return false;
    }
  }

  async _transcribeAudio(blob) {
    try {
      if (this.appState) {
        this.appState.update({ agentState: 'THINKING', agentStateLabel: 'PROCESSING VOICE INPUT' });
      }

      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not read recorded audio'));
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/session/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio })
      });

      if (!res.ok) throw new Error('Transcription service error');

      const data = await res.json();

      if (data.transcript && data.transcript.trim()) {
        const text = data.transcript.trim();
        if (this.onTranscript) {
          this.onTranscript(text);
        }
      } else {
        if (this.onListeningChange) this.onListeningChange(false);
        this._showError('Could not catch speech. Please try speaking again or type.');
      }
    } catch (e) {
      console.warn('[Voice] Transcription error:', e.message);
      if (this.onListeningChange) this.onListeningChange(false);
      this._showError('Voice transcription failed. Try again or type.');
    }
  }

  async _transcribeAudio(blob) {
    try {
      if (this.appState) {
        this.appState.update({ agentState: 'THINKING', agentStateLabel: 'PROCESSING YOUR WORDS' });
      }

      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not read recorded audio'));
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/session/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio })
      });

      if (!res.ok) throw new Error('Transcription error');

      const data = await res.json();

      if (data.transcript && data.transcript.trim() && this.onTranscript) {
        this.onTranscript(data.transcript.trim());
      } else if (this.autoListen && !this.isSpeaking && !this.isContinuousMuted) {
        if (this.appState) {
          this.appState.update({ agentState: 'LISTENING', agentStateLabel: 'YOUR TURN' });
        }
        this.startListening();
      } else if (this.onListeningChange) {
        this.onListeningChange(false);
      }
    } catch (e) {
      console.warn('[Voice] Transcription fallback retry:', e.message);
      if (this.autoListen && !this.isSpeaking && !this.isContinuousMuted) {
        if (this.appState) {
          this.appState.update({ agentState: 'LISTENING', agentStateLabel: 'YOUR TURN' });
        }
        this.startListening();
      } else if (this.onListeningChange) {
        this.onListeningChange(false);
      }
    }
  }

  // ──────────────────────────────────────────────
  // VOICE / ACCENT SELECTION
  // ──────────────────────────────────────────────

  /**
   * Initialize voice list from speechSynthesis
   */
  _initVoiceList() {
    const loadVoices = () => {
      this.availableVoices = this.synthesis ? this.synthesis.getVoices() : [];
      this._categorizeVoicesByAccent();
      this._restoreSelectedVoice();
      window.dispatchEvent(new CustomEvent('voices-loaded', { detail: { voices: this.availableVoices, byAccent: this.voicesByAccent } }));
    };

    // Voices may load asynchronously
    if (this.synthesis) {
      loadVoices();
      this.synthesis.addEventListener('voiceschanged', loadVoices);
    }
  }

  /**
   * Group available voices by accent/region
   */
  _categorizeVoicesByAccent() {
    const accentMap = {
      'en-US': 'US English',
      'en-GB': 'British English',
      'en-AU': 'Australian English',
      'en-IN': 'Indian English',
      'en-ZA': 'South African English',
      'en-IE': 'Irish English',
      'en-NZ': 'New Zealand English',
      'en-CA': 'Canadian English',
      'en-SG': 'Singapore English',
    };

    this.voicesByAccent = {};

    this.availableVoices.forEach(voice => {
      let accent = 'Other';

      // Try exact match first
      if (accentMap[voice.lang]) {
        accent = accentMap[voice.lang];
      } else if (voice.lang.startsWith('en')) {
        // Generic English
        accent = 'English (Other)';
      } else {
        // Non-English voices
        accent = voice.lang;
      }

      if (!this.voicesByAccent[accent]) {
        this.voicesByAccent[accent] = [];
      }
      this.voicesByAccent[accent].push(voice);
    });
  }

  /**
   * Get available accents list
   */
  getAccents() {
    return Object.keys(this.voicesByAccent).sort();
  }

  /**
   * Get voices for a specific accent (or all English voices)
   */
  getVoicesForAccent(accent) {
    if (!accent || accent === 'all') {
      // Return all English voices
      const englishVoices = [];
      for (const [key, voices] of Object.entries(this.voicesByAccent)) {
        if (key.includes('English') || key.startsWith('en')) {
          englishVoices.push(...voices);
        }
      }
      return englishVoices.length > 0 ? englishVoices : this.availableVoices;
    }
    return this.voicesByAccent[accent] || [];
  }

  /**
   * Set the active voice by name and update speech live if speaking
   */
  setVoice(voiceName) {
    this.selectedVoiceName = voiceName || null;
    this._saveVoicePreferences();

    // If currently speaking, dynamically restart speech with the new voice immediately
    if (this.isSpeaking && this.currentSpeechText) {
      this.speak(this.currentSpeechText);
    }
  }

  /**
   * Set the speech rate and update speech live if speaking
   */
  setRate(rate) {
    this.selectedRate = Math.max(0.5, Math.min(2.0, parseFloat(rate) || 1.0));
    this._saveVoicePreferences();

    // If currently speaking, dynamically restart speech with the new rate immediately
    if (this.isSpeaking && this.currentSpeechText) {
      this.speak(this.currentSpeechText);
    }
  }

  /**
   * Speak a short sample to test voice and speed settings
   */
  speakSample() {
    const active = this.getActiveVoice();
    const name = active ? active.name : 'British English';
    const rateText = this.selectedRate !== 1.0 ? ` at ${this.selectedRate.toFixed(1)} speed` : '';
    this.speak(`Hello! I am Mentora, testing voice ${name}${rateText}.`, true);
  }

  /**
   * Dynamically get the current live voice object from speechSynthesis
   */
  getActiveVoice() {
    if (!this.synthesis) return null;
    const voices = this.synthesis.getVoices() || [];
    if (voices.length === 0) return null;

    if (this.selectedVoiceName) {
      const match = voices.find(v => v.name === this.selectedVoiceName);
      if (match) return match;
    }

    return this._getDefaultBritishVoice(voices);
  }

  /**
   * Set auto-listen preference
   */
  setAutoListen(enabled) {
    this.autoListen = !!enabled;
    this._saveVoicePreferences();
  }

  /**
   * Save preferences to localStorage
   */
  _saveVoicePreferences() {
    try {
      localStorage.setItem('mentora-voice-prefs', JSON.stringify({
        voiceName: this.selectedVoiceName,
        rate: this.selectedRate,
        autoListen: this.autoListen
      }));
    } catch (e) { /* ignore */ }
  }

  /**
   * Load preferences from localStorage
   */
  _loadVoicePreferences() {
    try {
      const saved = localStorage.getItem('mentora-voice-prefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        this.selectedRate = typeof prefs.rate === 'number' ? prefs.rate : (parseFloat(prefs.rate) || 1.0);
        this.autoListen = prefs.autoListen !== false;
        this.selectedVoiceName = prefs.voiceName || null;
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Get default high quality British English voice
   */
  _getDefaultBritishVoice(voicesList) {
    const list = voicesList || (this.synthesis ? this.synthesis.getVoices() : []) || [];
    if (list.length === 0) return null;

    // Filter all British English voices
    const britishVoices = list.filter(v => 
      v.lang === 'en-GB' || 
      (v.lang && v.lang.replace('_', '-').startsWith('en-GB')) || 
      v.name.includes('UK English') || 
      v.name.includes('United Kingdom') || 
      v.name.includes('British') || 
      v.name.includes('Great Britain')
    );

    if (britishVoices.length > 0) {
      // Find highest quality natural / Google UK English voices
      const preferred = britishVoices.find(v => 
        v.name.includes('Google UK English Female') || 
        v.name.includes('Natural') || 
        v.name.includes('Google UK English Male') || 
        v.name.includes('Libby') || 
        v.name.includes('Sonia') ||
        v.name.includes('Daniel') ||
        v.name.includes('Hazel') ||
        v.name.includes('George')
      );
      return preferred || britishVoices[0];
    }

    // Fallback: search for any natural or english voice
    return list.find(v =>
      v.name.includes('Google') || v.name.includes('Natural') ||
      v.name.includes('Daniel') || v.name.includes('Samantha')
    ) || list.find(v => v.lang && v.lang.startsWith('en')) || list[0] || null;
  }

  /**
   * Restore voice selection after voices load
   */
  _restoreSelectedVoice() {
    if (this.selectedVoiceName && this.availableVoices.length > 0) {
      const match = this.availableVoices.find(v => v.name === this.selectedVoiceName);
      if (!match) {
        // If saved voice name is not available, default to British English
        const def = this._getDefaultBritishVoice(this.availableVoices);
        if (def) this.selectedVoiceName = def.name;
      }
    } else if (!this.selectedVoiceName && this.availableVoices.length > 0) {
      const def = this._getDefaultBritishVoice(this.availableVoices);
      if (def) this.selectedVoiceName = def.name;
    }
  }

  // ──────────────────────────────────────────────
  // SPEECH SYNTHESIS (TTS)
  // ──────────────────────────────────────────────

  /**
   * Speak text aloud via TTS
   * @param {string} text
   * @returns {Promise} resolves when speech ends
   */
  speak(text, isPreview = false) {
    return new Promise((resolve) => {
      if (!this.synthesis) {
        console.warn('[Voice] speechSynthesis not available');
        resolve(); // Don't block — text will be shown visually
        return;
      }

      this.isPreviewSpeaking = !!isPreview;
      if (!isPreview) {
        this.currentSpeechText = text;
      }

      // Cancel any ongoing speech
      this.cancelSpeech();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Number(this.selectedRate) || 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Dynamically resolve live voice to prevent stale browser references
      const activeVoice = this.getActiveVoice();
      if (activeVoice) {
        utterance.voice = activeVoice;
        utterance.lang = activeVoice.lang || 'en-GB';
      } else {
        utterance.lang = 'en-GB';
      }

      let watchdogTimer = null;

      const cleanup = () => {
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        this.isSpeaking = false;
        this._speechCooldownUntil = Date.now() + 400; // Guard against speaker reverberation
        if (this._ttsKeepAliveInterval) {
          clearInterval(this._ttsKeepAliveInterval);
          this._ttsKeepAliveInterval = null;
        }
        if (this.onSpeakingChange) this.onSpeakingChange(false);
        this._stopTTSAmplitudeSimulation();
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.onSpeakingChange) this.onSpeakingChange(true);
        this._startTTSAmplitudeSimulation();

        // Safety Watchdog: Prevent stuck speech synthesis if onend never fires
        const wordCount = (text || '').split(/\s+/).length;
        const rate = Number(this.selectedRate) || 1.0;
        const estimatedDurationMs = Math.max(4000, (wordCount / (120 * rate)) * 60 * 1000 + 3000);
        watchdogTimer = setTimeout(() => {
          if (this.isSpeaking) {
            console.warn('[Voice] Speech watchdog timeout triggered — releasing state');
            cleanup();
            resolve();
          }
        }, estimatedDurationMs);
      };

      utterance.onend = () => {
        cleanup();
        resolve();
      };

      utterance.onerror = (event) => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.warn('[Voice] TTS error:', event.error);
        }
        cleanup();
        resolve();
      };

      // Slight delay helps with Chrome TTS initialization
      setTimeout(() => {
        try {
          this.synthesis.speak(utterance);
        } catch (err) {
          console.warn('[Voice] Synthesis speak error:', err);
          cleanup();
          resolve();
        }
      }, 50);
    });
  }

  /**
   * Cancel ongoing speech
   */
  cancelSpeech() {
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch (e) { /* ignore */ }
    }
    this.isSpeaking = false;
    this._speechCooldownUntil = Date.now() + 300;
    if (this._ttsKeepAliveInterval) {
      clearInterval(this._ttsKeepAliveInterval);
      this._ttsKeepAliveInterval = null;
    }
    if (this.onSpeakingChange) this.onSpeakingChange(false);
    this._stopTTSAmplitudeSimulation();
  }

  // ──────────────────────────────────────────────
  // REAL AUDIO REACTIVITY (VISUAL ONLY)
  // ──────────────────────────────────────────────

  _setupAudioAnalyser(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        const unlock = () => {
          if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
          }
          document.removeEventListener('click', unlock);
          document.removeEventListener('keydown', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
      }
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
    } catch (e) {
      console.warn('[Voice] AudioContext setup failed:', e);
    }
  }

  _startContinuousAmplitudeTracking() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const track = () => {
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;
      const amplitude = Math.min(1, rms * 3.5);

      // Pass amplitude to visual core only while listening to user mic
      if (this.appState && this.isListening && !this.isSpeaking) {
        this.appState.audioAmplitude = this.appState.audioAmplitude * 0.6 + amplitude * 0.4;
      }

      this.amplitudeInterval = requestAnimationFrame(track);
    };

    track();
  }

  /**
   * Simulate voice amplitude during TTS (since we can't easily capture TTS audio)
   */
  _startTTSAmplitudeSimulation() {
    if (this._ttsSimInterval) clearInterval(this._ttsSimInterval);
    this._ttsSimInterval = setInterval(() => {
      if (this.appState && this.isSpeaking) {
        const simAmp = 0.35 + Math.sin(Date.now() * 0.007) * 0.25 + Math.random() * 0.15;
        this.appState.audioAmplitude = this.appState.audioAmplitude * 0.6 + simAmp * 0.4;
      }
    }, 50);
  }

  _stopTTSAmplitudeSimulation() {
    if (this._ttsSimInterval) {
      clearInterval(this._ttsSimInterval);
      this._ttsSimInterval = null;
    }
  }

  // ──────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────

  _showError(message) {
    // Dispatch custom event for the UI to handle
    window.dispatchEvent(new CustomEvent('voice-error', { detail: { message } }));
  }

  /**
   * Check if speech recognition is supported
   */
  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Check if TTS is supported
   */
  static isTTSSupported() {
    return !!window.speechSynthesis;
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.stopListening();
    this.cancelSpeech();
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

window.VoiceManager = VoiceManager;
