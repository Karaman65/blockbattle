// ═══════════════════════════════════════════
//  BLOCK BATTLE — Audio Manager (Web Audio API)
// ═══════════════════════════════════════════

class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported');
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  _playTone(freq, duration, type = 'sine', volume = 0.15, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(this.ctx.currentTime + delay);
    osc.stop(this.ctx.currentTime + delay + duration);
  }

  _playNoise(duration, volume = 0.08, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime + delay);
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(this.ctx.currentTime + delay);
  }

  pickup() {
    this._playTone(800, 0.08, 'sine', 0.1);
    this._playTone(1200, 0.06, 'sine', 0.06, 0.03);
  }

  place() {
    this._playTone(300, 0.12, 'triangle', 0.15);
    this._playNoise(0.06, 0.06);
  }

  invalid() {
    this._playTone(200, 0.15, 'sawtooth', 0.06);
    this._playTone(150, 0.15, 'sawtooth', 0.06, 0.08);
  }

  clear(lineCount) {
    const baseFreq = 500;
    for (let i = 0; i < Math.min(lineCount, 4); i++) {
      this._playTone(baseFreq + i * 150, 0.2, 'sine', 0.12, i * 0.06);
    }
    this._playTone(baseFreq + lineCount * 200, 0.3, 'triangle', 0.08, lineCount * 0.06);
  }

  combo(level) {
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    for (let i = 0; i < Math.min(level + 1, 4); i++) {
      this._playTone(notes[i], 0.25, 'sine', 0.1, i * 0.08);
    }
  }

  gameOver() {
    const notes = [400, 350, 300, 200];
    for (let i = 0; i < notes.length; i++) {
      this._playTone(notes[i], 0.3, 'triangle', 0.12, i * 0.15);
    }
  }

  win() {
    const notes = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < notes.length; i++) {
      this._playTone(notes[i], 0.2, 'sine', 0.12, i * 0.1);
    }
    this._playTone(1319, 0.5, 'sine', 0.08, 0.5);
  }

  countdown() {
    this._playTone(600, 0.1, 'square', 0.08);
  }

  countdownGo() {
    this._playTone(900, 0.15, 'square', 0.1);
    this._playTone(1200, 0.2, 'square', 0.08, 0.1);
  }
}
