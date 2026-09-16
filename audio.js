/**
 * Audio Engine dla Symulatora Spawania MIG/MAG (WeldMaster 2D)
 * Wykorzystuje Web Audio API z opcjonalnym przestrzennym panoramowaniem stereo (Dźwięk 3D / Stereo).
 */

class WeldingAudioEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.is3dEnabled = true; // Flaga trybu Dźwięku 3D (Stereo Lewo/Prawo)

        // Elementy dźwięku łuku
        this.arcGainNode = null;
        this.arcFilterNode = null;
        this.arcPannerNode = null;
        this.arcPulseOsc = null;
        this.arcPulseGain = null;
        this.noiseSource = null;
        this.isArcPlaying = false;

        // Głośność metronomu i łuku
        this.metronomeVolume = 0.85;
        this.arcVolume = 0.35;
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

    set3dMode(enabled) {
        this.is3dEnabled = !!enabled;
        if (!this.is3dEnabled && this.arcPannerNode && this.arcPannerNode.pan) {
            try {
                this.arcPannerNode.pan.setValueAtTime(0.0, this.ctx ? this.ctx.currentTime : 0);
            } catch (e) {}
        }
    }

    createPannerNode(panValue = 0) {
        if (!this.ctx) return null;
        if (this.ctx.createStereoPanner) {
            const panner = this.ctx.createStereoPanner();
            const actualPan = this.is3dEnabled ? panValue : 0.0;
            panner.pan.setValueAtTime(actualPan, this.ctx.currentTime);
            return panner;
        }
        return null;
    }

    playTone(freq, duration, type = 'sine', volume = 0.5, pan = 0) {
        this.init();
        if (!this.ctx || this.isMuted) return;

        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const actualPan = this.is3dEnabled ? pan : 0.0;
            const panner = this.createPannerNode(actualPan);

            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);

            const finalVol = volume * this.metronomeVolume;
            gain.gain.setValueAtTime(finalVol, now);
            gain.gain.linearRampToValueAtTime(0.001, now + duration);

            if (panner) {
                osc.connect(gain);
                gain.connect(panner);
                panner.connect(this.ctx.destination);
            } else {
                osc.connect(gain);
                gain.connect(this.ctx.destination);
            }

            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {
            console.error("Audio playTone error:", e);
        }
    }

    playEdgeTone(isRight = false) {
        const freq = isRight ? 960 : 800;
        const pan = isRight ? 1.0 : -1.0;

        this.playTone(freq, 0.1, 'square', 0.6, pan);
        setTimeout(() => {
            this.playTone(freq * 1.2, 0.06, 'sawtooth', 0.4, pan);
        }, 30);
    }

    playCenterTone() {
        this.playTone(480, 0.05, 'triangle', 0.35, 0.0);
    }

    playWorkshopPulse(type = 'edge', isRight = false) {
        this.init();
        if (!this.ctx || this.isMuted) return;

        try {
            const now = this.ctx.currentTime;

            if (type === 'edge') {
                const panVal = this.is3dEnabled ? (isRight ? 1.0 : -1.0) : 0.0;
                const freq1 = isRight ? 1080 : 820;
                const freq2 = isRight ? 1450 : 1100;

                const osc1 = this.ctx.createOscillator();
                const osc2 = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const panner = this.createPannerNode(panVal);

                osc1.type = 'sawtooth';
                osc2.type = 'square';

                osc1.frequency.setValueAtTime(freq1, now);
                osc2.frequency.setValueAtTime(freq2, now);

                const vol = 0.75 * this.metronomeVolume;
                gain.gain.setValueAtTime(vol, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.12);

                osc1.connect(gain);
                osc2.connect(gain);

                if (panner) {
                    gain.connect(panner);
                    panner.connect(this.ctx.destination);
                } else {
                    gain.connect(this.ctx.destination);
                }

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.12);
                osc2.stop(now + 0.12);
            } else {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const panner = this.createPannerNode(0.0);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

                gain.gain.setValueAtTime(0.4 * this.metronomeVolume, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.05);

                osc.connect(gain);
                if (panner) {
                    gain.connect(panner);
                    panner.connect(this.ctx.destination);
                } else {
                    gain.connect(this.ctx.destination);
                }

                osc.start(now);
                osc.stop(now + 0.05);
            }
        } catch (e) {
            console.error("Workshop pulse error:", e);
        }
    }

    playIgnite() {
        this.playTone(320, 0.08, 'sawtooth', 0.7, 0);
        setTimeout(() => this.playTone(640, 0.06, 'square', 0.5, 0), 40);
    }

    playArcBreak() {
        this.playTone(180, 0.18, 'sawtooth', 0.8, 0);
    }

    startArcSound() {
        this.init();
        if (!this.ctx || this.isMuted || this.isArcPlaying) return;
        this.isArcPlaying = true;

        try {
            const now = this.ctx.currentTime;

            const bufferSize = 2 * this.ctx.sampleRate;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);

            let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                output[i] = b0 + b1 + b2 + b3 + white * 0.5362;
                output[i] *= 0.11;
            }

            this.noiseSource = this.ctx.createBufferSource();
            this.noiseSource.buffer = noiseBuffer;
            this.noiseSource.loop = true;

            this.arcFilterNode = this.ctx.createBiquadFilter();
            this.arcFilterNode.type = 'bandpass';
            this.arcFilterNode.frequency.setValueAtTime(750, now);
            this.arcFilterNode.Q.setValueAtTime(2.0, now);

            this.arcPulseOsc = this.ctx.createOscillator();
            this.arcPulseOsc.type = 'sawtooth';
            this.arcPulseOsc.frequency.setValueAtTime(95, now);

            this.arcPulseGain = this.ctx.createGain();
            this.arcPulseGain.gain.setValueAtTime(0.18, now);

            this.arcGainNode = this.ctx.createGain();
            this.arcGainNode.gain.setValueAtTime(this.arcVolume, now);

            this.arcPannerNode = this.createPannerNode(0.0);

            this.noiseSource.connect(this.arcFilterNode);
            this.arcFilterNode.connect(this.arcGainNode);

            this.arcPulseOsc.connect(this.arcPulseGain);
            this.arcPulseGain.connect(this.arcGainNode);

            if (this.arcPannerNode) {
                this.arcGainNode.connect(this.arcPannerNode);
                this.arcPannerNode.connect(this.ctx.destination);
            } else {
                this.arcGainNode.connect(this.ctx.destination);
            }

            this.noiseSource.start(now);
            this.arcPulseOsc.start(now);
        } catch (e) {
            console.error("Start arc sound error:", e);
        }
    }

    modulateArcForStep(stepType, isRight = false) {
        if (!this.isArcPlaying || !this.ctx || !this.arcFilterNode) return;
        const now = this.ctx.currentTime;

        try {
            if (stepType === 'edge') {
                this.arcFilterNode.frequency.setTargetAtTime(600, now, 0.04);
                if (this.arcPulseOsc) this.arcPulseOsc.frequency.setTargetAtTime(110, now, 0.04);
                if (this.arcGainNode) this.arcGainNode.gain.setTargetAtTime(this.arcVolume * 1.2, now, 0.04);

                if (this.arcPannerNode && this.arcPannerNode.pan) {
                    const targetPan = this.is3dEnabled ? (isRight ? 0.7 : -0.7) : 0.0;
                    this.arcPannerNode.pan.setTargetAtTime(targetPan, now, 0.04);
                }
            } else {
                this.arcFilterNode.frequency.setTargetAtTime(950, now, 0.04);
                if (this.arcPulseOsc) this.arcPulseOsc.frequency.setTargetAtTime(80, now, 0.04);
                if (this.arcGainNode) this.arcGainNode.gain.setTargetAtTime(this.arcVolume * 0.7, now, 0.04);

                if (this.arcPannerNode && this.arcPannerNode.pan) {
                    this.arcPannerNode.pan.setTargetAtTime(0.0, now, 0.04);
                }
            }
        } catch (e) {}
    }

    setArcQuality(isGood) {
        if (!this.arcFilterNode || !this.ctx) return;
        const now = this.ctx.currentTime;
        try {
            if (isGood) {
                this.arcFilterNode.frequency.setTargetAtTime(750, now, 0.05);
            } else {
                this.arcFilterNode.frequency.setTargetAtTime(1400, now, 0.05);
            }
        } catch (e) {}
    }

    stopArcSound() {
        if (!this.isArcPlaying) return;
        this.isArcPlaying = false;

        try {
            const now = this.ctx ? this.ctx.currentTime : 0;
            if (this.arcGainNode && this.ctx) {
                this.arcGainNode.gain.setTargetAtTime(0.001, now, 0.03);
            }
            setTimeout(() => {
                try {
                    if (this.noiseSource) {
                        this.noiseSource.stop();
                        this.noiseSource.disconnect();
                    }
                    if (this.arcPulseOsc) {
                        this.arcPulseOsc.stop();
                        this.arcPulseOsc.disconnect();
                    }
                } catch (e) {}
            }, 50);
        } catch (e) {}
    }
}

window.weldingAudio = new WeldingAudioEngine();
