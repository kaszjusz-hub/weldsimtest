/**
 * Audio Engine dla Symulatora Spawania MIG/MAG
 * Wykorzystuje Web Audio API do generowania realistycznego dźwięku łuku
 * oraz wyrazistych tonów metronomu dla treningu i pracy warsztatowej.
 */

class WeldingAudioEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.arcNoiseNode = null;
        this.arcGainNode = null;
        this.arcFilterNode = null;
        this.crackleInterval = null;
        this.isArcPlaying = false;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Prosty dźwięk zajarzenia łuku (elektryczny trzask i wejście)
    playIgnite() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    // Dźwięk zerwania łuku (nagły spadek napięcia i buczenie błędu)
    playArcBreak() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.18);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    // Dźwięk metronomu: Krawędź spoiny (akcent przytrzymania)
    playEdgeTone(isRight = false) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Prawa krawędź nieco wyższy ton od lewej dla orientacji słuchowej w słuchawkach
        const freq = isRight ? 880 : 740;
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    }

    // Dźwięk metronomu: Przejście przez środek
    playCenterTone() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    // Głośny, warsztatowy sygnał pod słuchawki
    playWorkshopPulse(type = 'edge', isRight = false) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        if (type === 'edge') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(isRight ? 950 : 800, now);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.08);
            osc.stop(now + 0.08);
        } else {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.04);
            osc.stop(now + 0.04);
        }

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
    }

    // Ciągły dźwięk jarzącego się łuku MIG/MAG ("skwierczenie boczku")
    startArcSound() {
        if (!this.ctx || this.isMuted || this.isArcPlaying) return;
        this.isArcPlaying = true;

        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }

        this.arcNoiseNode = this.ctx.createBufferSource();
        this.arcNoiseNode.buffer = noiseBuffer;
        this.arcNoiseNode.loop = true;

        this.arcFilterNode = this.ctx.createBiquadFilter();
        this.arcFilterNode.type = 'bandpass';
        this.arcFilterNode.frequency.setValueAtTime(650, this.ctx.currentTime);
        this.arcFilterNode.Q.setValueAtTime(1.5, this.ctx.currentTime);

        this.arcGainNode = this.ctx.createGain();
        this.arcGainNode.gain.setValueAtTime(0.12, this.ctx.currentTime);

        this.arcNoiseNode.connect(this.arcFilterNode);
        this.arcFilterNode.connect(this.arcGainNode);
        this.arcGainNode.connect(this.ctx.destination);

        this.arcNoiseNode.start();

        this.crackleInterval = setInterval(() => {
            if (!this.isArcPlaying || !this.ctx || this.isMuted) return;
            if (Math.random() > 0.4) {
                const crackleOsc = this.ctx.createOscillator();
                const crackleGain = this.ctx.createGain();
                const t = this.ctx.currentTime;
                crackleOsc.type = 'triangle';
                crackleOsc.frequency.setValueAtTime(120 + Math.random() * 200, t);
                crackleGain.gain.setValueAtTime(0.15 * Math.random(), t);
                crackleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
                crackleOsc.connect(crackleGain);
                crackleGain.connect(this.ctx.destination);
                crackleOsc.start(t);
                crackleOsc.stop(t + 0.02);
            }
        }, 30);
    }

    setArcQuality(isGood) {
        if (!this.arcFilterNode || !this.ctx) return;
        const now = this.ctx.currentTime;
        if (isGood) {
            this.arcFilterNode.frequency.setTargetAtTime(650, now, 0.05);
            this.arcGainNode.gain.setTargetAtTime(0.12, now, 0.05);
        } else {
            this.arcFilterNode.frequency.setTargetAtTime(1200, now, 0.05);
            this.arcGainNode.gain.setTargetAtTime(0.2, now, 0.05);
        }
    }

    stopArcSound() {
        if (!this.isArcPlaying) return;
        this.isArcPlaying = false;
        if (this.crackleInterval) {
            clearInterval(this.crackleInterval);
            this.crackleInterval = null;
        }
        if (this.arcGainNode && this.ctx) {
            this.arcGainNode.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.05);
            setTimeout(() => {
                try {
                    if (this.arcNoiseNode) this.arcNoiseNode.stop();
                    if (this.arcNoiseNode) this.arcNoiseNode.disconnect();
                } catch (e) {}
            }, 60);
        }
    }
}

window.weldingAudio = new WeldingAudioEngine();
