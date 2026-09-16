/**
 * Workshop Audio Assistant (Tryb Warsztatowy pod Przyłbicę)
 * Pozwala kursantowi trenować na prawdziwym stanowisku spawalniczym,
 * słuchając precyzyjnego, opcjonalnie przestrzennego (STEREO LEWO / PRAWO / 3D) rytmu w słuchawkach pod maską.
 */

class WorkshopAssistant {
    constructor() {
        this.isRunning = false;
        this.bpm = 50; // Zakosy na minutę
        this.position = 'PF';
        this.soundMode = 'beeps'; // 'beeps' lub 'arc_beeps'
        this.timerSeconds = 0;
        this.timerInterval = null;
        this.audioTimeout = null;
        this.wakeLock = null;

        // Faza cyklu: 0 = Lewa krawędź, 1 = Przejście środek, 2 = Prawa krawędź, 3 = Przejście środek
        this.step = 0;

        // Elementy DOM
        this.startBtn = null;
        this.bpmVal = null;
        this.bpmSlider = null;
        this.timerDisplay = null;
        this.visualLeft = null;
        this.visualCenter = null;
        this.visualRight = null;
        this.wakeLockBadge = null;
    }

    init() {
        this.startBtn = document.getElementById('wsStartBtn');
        this.bpmVal = document.getElementById('wsBpmVal');
        this.bpmSlider = document.getElementById('wsBpmSlider');
        this.timerDisplay = document.getElementById('wsTimerDisplay');

        this.visualLeft = document.getElementById('wsVisLeft');
        this.visualCenter = document.getElementById('wsVisCenter');
        this.visualRight = document.getElementById('wsVisRight');
        this.wakeLockBadge = document.getElementById('wsWakeLockBadge');

        this.bindEvents();
    }

    bindEvents() {
        if (!this.startBtn) return;

        this.startBtn.addEventListener('click', () => {
            this.toggleAssistant();
        });

        this.bpmSlider.addEventListener('input', (e) => {
            this.bpm = parseInt(e.target.value, 10);
            this.bpmVal.innerText = `${this.bpm} BPM`;
        });

        // Presety tempa
        document.querySelectorAll('.preset-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const bpm = parseInt(e.currentTarget.dataset.bpm, 10);
                this.bpm = bpm;
                this.bpmSlider.value = bpm;
                this.bpmVal.innerText = `${bpm} BPM`;
            });
        });

        // Przełącznik Dźwięku 3D (Stereo Lewo/Prawo)
        const toggle3d = document.getElementById('ws3dToggle');
        if (toggle3d) {
            // Ustawienie początkowego stanu
            window.weldingAudio.set3dMode(toggle3d.checked);
            toggle3d.addEventListener('change', (e) => {
                window.weldingAudio.set3dMode(e.target.checked);
            });
        }

        // Wybór pozycji warsztatowej
        const posSel = document.getElementById('wsPosSelect');
        if (posSel) {
            posSel.addEventListener('change', (e) => {
                this.position = e.target.value;
            });
        }

        // Wybór trybu dźwięku
        const soundSel = document.getElementById('wsSoundSelect');
        if (soundSel) {
            soundSel.addEventListener('change', (e) => {
                this.soundMode = e.target.value;
                if (this.isRunning) {
                    if (this.soundMode === 'arc_beeps') {
                        window.weldingAudio.startArcSound();
                    } else {
                        window.weldingAudio.stopArcSound();
                    }
                }
            });
        }
    }

    async toggleAssistant() {
        window.weldingAudio.init();

        if (this.isRunning) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        this.isRunning = true;
        this.step = 0;
        this.timerSeconds = 0;
        this.updateTimerDisplay();

        this.startBtn.innerText = "ZATRZYMAJ ASYSTENTA";
        this.startBtn.classList.add('running');

        if (this.soundMode === 'arc_beeps') {
            window.weldingAudio.startArcSound();
        }

        this.requestWakeLock();

        this.timerInterval = setInterval(() => {
            this.timerSeconds++;
            this.updateTimerDisplay();
        }, 1000);

        this.tick();
    }

    stop() {
        this.isRunning = false;
        if (this.audioTimeout) {
            clearTimeout(this.audioTimeout);
            this.audioTimeout = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        window.weldingAudio.stopArcSound();
        this.releaseWakeLock();
        this.clearVisualIndicators();

        this.startBtn.innerText = "START - ASYSTENT WARSZTATOWY";
        this.startBtn.classList.remove('running');
    }

    tick() {
        if (!this.isRunning) return;

        const fullCycleMs = (60 / this.bpm) * 1000;
        let stepDurationMs;

        if (this.position === 'PF') {
            if (this.step === 0 || this.step === 2) {
                stepDurationMs = fullCycleMs * 0.36;
            } else {
                stepDurationMs = fullCycleMs * 0.14;
            }
        } else {
            stepDurationMs = fullCycleMs * 0.25;
        }

        this.clearVisualIndicators();

        if (this.step === 0) {
            // Lewa krawędź
            window.weldingAudio.playWorkshopPulse('edge', false);
            if (this.soundMode === 'arc_beeps') window.weldingAudio.modulateArcForStep('edge', false);
            this.highlightVisual(this.visualLeft);
            this.vibrate([45]);
        } else if (this.step === 1) {
            // Środek w prawo
            window.weldingAudio.playWorkshopPulse('center');
            if (this.soundMode === 'arc_beeps') window.weldingAudio.modulateArcForStep('center');
            this.highlightVisual(this.visualCenter);
        } else if (this.step === 2) {
            // Prawa krawędź
            window.weldingAudio.playWorkshopPulse('edge', true);
            if (this.soundMode === 'arc_beeps') window.weldingAudio.modulateArcForStep('edge', true);
            this.highlightVisual(this.visualRight);
            this.vibrate([45]);
        } else if (this.step === 3) {
            // Środek w lewo
            window.weldingAudio.playWorkshopPulse('center');
            if (this.soundMode === 'arc_beeps') window.weldingAudio.modulateArcForStep('center');
            this.highlightVisual(this.visualCenter);
        }

        this.step = (this.step + 1) % 4;

        this.audioTimeout = setTimeout(() => {
            this.tick();
        }, stepDurationMs);
    }

    highlightVisual(element) {
        if (element) {
            element.classList.add('active');
        }
    }

    clearVisualIndicators() {
        if (this.visualLeft) this.visualLeft.classList.remove('active');
        if (this.visualCenter) this.visualCenter.classList.remove('active');
        if (this.visualRight) this.visualRight.classList.remove('active');
    }

    vibrate(pattern) {
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {}
        }
    }

    updateTimerDisplay() {
        if (!this.timerDisplay) return;
        const mins = Math.floor(this.timerSeconds / 60);
        const secs = this.timerSeconds % 60;
        this.timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                if (this.wakeLockBadge) {
                    this.wakeLockBadge.innerText = "Ekran aktywny (WakeLock: ON)";
                    this.wakeLockBadge.className = "wake-badge active";
                }
            } catch (err) {
                console.warn("WakeLock niedostępny:", err);
            }
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            try {
                this.wakeLock.release();
                this.wakeLock = null;
            } catch (e) {}
        }
        if (this.wakeLockBadge) {
            this.wakeLockBadge.innerText = "Ekran uśpienie (WakeLock: OFF)";
            this.wakeLockBadge.className = "wake-badge";
        }
    }
}

window.workshopAssistant = new WorkshopAssistant();
