/**
 * Simulator Engine dla Treningu Spawania MIG/MAG
 * Obsługuje generowanie trajektorii, specyfikę pozycji (PA, PF, PB),
 * zajarzenie łuku, PŁYNNY RUCH BEZ ZATRZYMYWANIA oraz stały rozmiar interfejsu (brak przesuwania płótna).
 */

class WeldingSimulator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.evalCanvas = null;
        this.evalCtx = null;

        this.configScreen = null;
        this.simScreen = null;
        this.reportModal = null;

        this.state = 'IDLE';
        this.isArcActive = false;
        this.animationId = null;

        this.config = {
            position: 'PF',
            pattern: 'zigzag',
            weldWidth: 20,
            wireDiameter: 1.0,
            speedMultiplier: 1.0
        };

        this.points = [];
        this.currentPointIdx = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.edgeHoldTimer = 0;
        this.baseEdgeHold = 25;
        this.baseCrossSpeed = 3.5;
        this.poolRadius = 12;
        this.toleranceRadius = 24;

        this.userPos = { x: -100, y: -100 };
        this.isPointerDown = false;

        this.stats = {
            totalFrames: 0,
            onTargetFrames: 0,
            arcBreaks: 0,
            leftEdgeTimeRecorded: [],
            rightEdgeTimeRecorded: [],
            currentEdgeTime: 0,
            userTrail: [],
            idealTrail: []
        };

        this.statusText = null;
        this.accuracyBadge = null;
        this.arcStateBadge = null;
        this.speedVal = null;
        this.speedSlider = null;
    }

    init() {
        this.canvas = document.getElementById('weldCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.evalCanvas = document.getElementById('evalCanvas');
        if (this.evalCanvas) this.evalCtx = this.evalCanvas.getContext('2d');

        this.configScreen = document.getElementById('configScreen');
        this.simScreen = document.getElementById('simScreen');
        this.reportModal = document.getElementById('reportModal');

        this.statusText = document.getElementById('statusText');
        this.accuracyBadge = document.getElementById('accuracyBadge');
        this.arcStateBadge = document.getElementById('arcStateBadge');
        this.speedVal = document.getElementById('speedVal');
        this.speedSlider = document.getElementById('speedSlider');

        this.bindEvents();
        this.updateCalculatedRecommendations();
    }

    bindEvents() {
        document.getElementById('posSelect').addEventListener('change', (e) => {
            this.config.position = e.target.value;
            this.updatePositionHints();
            this.updateCalculatedRecommendations();
        });

        document.getElementById('patternSelect').addEventListener('change', (e) => {
            this.config.pattern = e.target.value;
            this.updateCalculatedRecommendations();
        });

        const widthSlider = document.getElementById('widthSlider');
        const widthVal = document.getElementById('widthVal');
        widthSlider.addEventListener('input', (e) => {
            widthVal.innerText = `${e.target.value} mm`;
            this.config.weldWidth = parseInt(e.target.value, 10);
            this.updateCalculatedRecommendations();
        });

        const wireSlider = document.getElementById('wireSlider');
        const wireVal = document.getElementById('wireVal');
        wireSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value).toFixed(1);
            wireVal.innerText = `${val} mm`;
            this.config.wireDiameter = parseFloat(val);
            this.updateCalculatedRecommendations();
        });

        this.speedSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            this.speedVal.innerText = `${val}%`;
            this.config.speedMultiplier = val / 100;
        });

        document.getElementById('startSimBtn').addEventListener('click', () => {
            this.startSimulationSession();
        });

        document.getElementById('backToConfigBtn').addEventListener('click', () => {
            this.stopSimulation();
            this.simScreen.style.display = 'none';
            this.configScreen.style.display = 'block';
        });

        document.getElementById('restartBtn').addEventListener('click', () => {
            this.reportModal.classList.remove('active');
            this.startSimulationSession();
        });

        document.getElementById('closeReportBtn').addEventListener('click', () => {
            this.reportModal.classList.remove('active');
            this.simScreen.style.display = 'none';
            this.configScreen.style.display = 'block';
        });

        const updateCoords = (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            this.userPos = {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        };

        this.canvas.addEventListener('mousedown', (e) => {
            this.isPointerDown = true;
            updateCoords(e);
            this.handlePointerDown();
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPointerDown) {
                updateCoords(e);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isPointerDown) {
                this.isPointerDown = false;
                this.handlePointerUp();
            }
        });

        this.canvas.addEventListener('touchstart', (e) => {
            this.isPointerDown = true;
            updateCoords(e);
            this.handlePointerDown();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (this.isPointerDown) {
                updateCoords(e);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isPointerDown = false;
            this.handlePointerUp();
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', () => {
            this.isPointerDown = false;
            this.handlePointerUp();
        });
    }

    updatePositionHints() {
        const hintEl = document.getElementById('posDescription');
        if (!hintEl) return;
        if (this.config.position === 'PF') {
            hintEl.innerText = "Pionowa w górę (PF): Wymaga wyraźnego zatrzymania na krawędziach (eliminacja podtopień) i błyskawicznego przeskoku przez środek (by jeziorko nie spłynęło).";
            hintEl.className = "hint-box warning";
        } else if (this.config.position === 'PA') {
            hintEl.innerText = "Podolna (PA): Naturalne ułożenie, stałe i jednostajne tempo, krótkie zatrzymanie na brzegach dla równego lica.";
            hintEl.className = "hint-box info";
        } else {
            hintEl.innerText = "Pachwinowa / pozioma (PB): Wymaga delikatnej kompensacji grawitacji (nieco dłuższe przytrzymanie ścianki górnej).";
            hintEl.className = "hint-box info";
        }
    }

    updateCalculatedRecommendations() {
        const wire = this.config.wireDiameter;
        const currentRec = document.getElementById('calcCurrent');
        const voltRec = document.getElementById('calcVoltage');
        const feedRec = document.getElementById('calcFeed');

        if (!currentRec) return;

        let cur = 120, volt = 18.5, feed = 6.0;
        if (wire <= 0.8) {
            cur = 90; volt = 17.5; feed = 6.5;
        } else if (wire <= 1.0) {
            cur = 140; volt = 19.5; feed = 5.8;
        } else if (wire <= 1.2) {
            cur = 190; volt = 22.0; feed = 5.2;
        } else {
            cur = 250; volt = 25.0; feed = 4.5;
        }

        if (this.config.position === 'PF') {
            cur = Math.round(cur * 0.82);
            volt = (volt * 0.95).toFixed(1);
            feed = (feed * 0.85).toFixed(1);
        }

        currentRec.innerText = `${cur} A`;
        voltRec.innerText = `${volt} V`;
        feedRec.innerText = `${feed} m/min`;
    }

    startSimulationSession() {
        window.weldingAudio.init();

        this.configScreen.style.display = 'none';
        this.simScreen.style.display = 'block';
        if (this.reportModal) this.reportModal.classList.remove('active');

        this.poolRadius = Math.round(this.config.wireDiameter * 11);
        this.toleranceRadius = Math.round(this.poolRadius * 1.8);

        if (this.config.position === 'PF') {
            this.baseEdgeHold = 36;
            this.baseCrossSpeed = 6.0;
        } else if (this.config.position === 'PA') {
            this.baseEdgeHold = 10;
            this.baseCrossSpeed = 2.6;
        } else {
            this.baseEdgeHold = 20;
            this.baseCrossSpeed = 3.5;
        }

        this.generatePath();

        this.state = 'WAITING_FOR_IGNITION';
        this.isArcActive = false;
        this.currentPointIdx = 0;
        this.targetX = this.points[0].x;
        this.targetY = this.points[0].y;
        this.edgeHoldTimer = this.baseEdgeHold;
        this.userPos = { x: -100, y: -100 };
        this.isPointerDown = false;

        this.stats = {
            totalFrames: 0,
            onTargetFrames: 0,
            arcBreaks: 0,
            leftEdgeTimeRecorded: [],
            rightEdgeTimeRecorded: [],
            currentEdgeTime: 0,
            userTrail: [],
            idealTrail: []
        };

        this.updateHUD("Dotknij punktu na dole, aby zajarzyć łuk!", "waiting");
        this.arcStateBadge.innerText = "Łuk wygaszony";
        this.arcStateBadge.className = "badge badge-off";
        this.accuracyBadge.innerText = "Precyzja: 100%";

        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animate();
    }

    generatePath() {
        this.points = [];
        const centerX = this.canvas.width / 2;
        const widthPx = this.config.weldWidth * 4;
        let y = this.canvas.height - 50;
        const endY = 60;
        let left = true;

        if (this.config.pattern === 'stringer') {
            while (y >= endY) {
                this.points.push({ x: centerX, y: y, isEdge: false, side: 'center' });
                y -= 8;
            }
            return;
        }

        while (y >= endY) {
            const edgeX = left ? (centerX - widthPx / 2) : (centerX + widthPx / 2);
            const side = left ? 'left' : 'right';

            if (this.config.pattern === 'crescent') {
                this.points.push({ x: edgeX, y: y, isEdge: true, side: side });
                this.points.push({ x: centerX, y: y - 10, isEdge: false, side: 'center' });
            } else if (this.config.pattern === 'triangle') {
                this.points.push({ x: edgeX, y: y, isEdge: true, side: side });
                this.points.push({ x: centerX, y: y - 16, isEdge: false, side: 'center' });
            } else {
                this.points.push({ x: edgeX, y: y, isEdge: true, side: side });
            }

            y -= 14;
            left = !left;
        }
    }

    handlePointerDown() {
        const dist = Math.hypot(this.userPos.x - this.targetX, this.userPos.y - this.targetY);

        if (this.state === 'WAITING_FOR_IGNITION') {
            if (dist <= this.toleranceRadius * 1.5) {
                this.state = 'WELDING';
                this.isArcActive = true;
                window.weldingAudio.playIgnite();
                window.weldingAudio.startArcSound();
                this.updateHUD("Spawaj! Prowadź rękę w rytmie metronomu", "active");
                this.arcStateBadge.innerText = "ŁUK ZAJARZONY";
                this.arcStateBadge.className = "badge badge-active";
            }
        }
    }

    handlePointerUp() {
        if (this.state === 'WELDING' && this.isArcActive) {
            this.setArcActive(false, "Oderwano palec");
        }
    }

    setArcActive(active, reason = "") {
        if (this.isArcActive === active) return;
        this.isArcActive = active;

        if (active) {
            window.weldingAudio.playIgnite();
            window.weldingAudio.startArcSound();
            this.updateHUD("Łuk wznowiony! Spawaj dalej", "active");
            this.arcStateBadge.innerText = "ŁUK ZAJARZONY";
            this.arcStateBadge.className = "badge badge-active";
        } else {
            this.stats.arcBreaks++;
            window.weldingAudio.playArcBreak();
            window.weldingAudio.stopArcSound();
            // Zwięzły komunikat mieszczący się w 1 linii
            this.updateHUD("ZERWANIE ŁUKU! Przyłóż palec do jeziorka", "error");
            this.arcStateBadge.innerText = "ŁUK ZERWANY!";
            this.arcStateBadge.className = "badge badge-danger";
        }
    }

    updateHUD(msg, type) {
        if (!this.statusText) return;
        this.statusText.innerText = msg;
        this.statusText.className = `status-msg ${type}`;
    }

    stopSimulation() {
        this.state = 'IDLE';
        this.isArcActive = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        window.weldingAudio.stopArcSound();
    }

    animate() {
        if (this.state === 'IDLE') return;

        this.renderCanvas();

        if (this.state === 'WELDING') {
            this.updateWeldingLogic();
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updateWeldingLogic() {
        const dist = Math.hypot(this.userPos.x - this.targetX, this.userPos.y - this.targetY);
        const isInTolerance = (this.isPointerDown && dist <= this.toleranceRadius);

        if (isInTolerance) {
            if (!this.isArcActive) {
                this.setArcActive(true);
            }
        } else {
            if (this.isArcActive) {
                const reason = !this.isPointerDown ? "Oderwano palec" : "Zeszło z toru";
                this.setArcActive(false, reason);
            }
        }

        this.stats.totalFrames++;

        if (this.isArcActive && isInTolerance) {
            this.stats.onTargetFrames++;
            window.weldingAudio.setArcQuality(true);
        } else if (this.isArcActive) {
            window.weldingAudio.setArcQuality(false);
        }

        this.stats.userTrail.push({
            x: this.isPointerDown ? this.userPos.x : -100,
            y: this.isPointerDown ? this.userPos.y : -100,
            accurate: this.isArcActive && isInTolerance
        });
        this.stats.idealTrail.push({
            x: this.targetX,
            y: this.targetY
        });

        const acc = Math.round((this.stats.onTargetFrames / this.stats.totalFrames) * 100);
        this.accuracyBadge.innerText = `Precyzja: ${acc}%`;

        const currentP = this.points[this.currentPointIdx];

        if (this.edgeHoldTimer > 0) {
            this.edgeHoldTimer -= 1 * this.config.speedMultiplier;
            this.stats.currentEdgeTime++;

            if (this.edgeHoldTimer <= 0) {
                if (currentP.side === 'left') {
                    this.stats.leftEdgeTimeRecorded.push(this.stats.currentEdgeTime);
                } else if (currentP.side === 'right') {
                    this.stats.rightEdgeTimeRecorded.push(this.stats.currentEdgeTime);
                }
                this.stats.currentEdgeTime = 0;
            }
        } else if (this.currentPointIdx < this.points.length - 1) {
            const nextP = this.points[this.currentPointIdx + 1];
            const dx = nextP.x - this.targetX;
            const dy = nextP.y - this.targetY;
            const distance = Math.hypot(dx, dy);

            let currentMoveSpeed = this.baseCrossSpeed;
            if (this.config.position === 'PF' && !nextP.isEdge) {
                currentMoveSpeed *= 1.4;
            }
            const moveAmount = currentMoveSpeed * this.config.speedMultiplier;

            if (distance <= moveAmount) {
                this.targetX = nextP.x;
                this.targetY = nextP.y;
                this.currentPointIdx++;

                if (nextP.isEdge) {
                    this.edgeHoldTimer = this.baseEdgeHold;
                    window.weldingAudio.playEdgeTone(nextP.side === 'right');
                } else {
                    window.weldingAudio.playCenterTone();
                }
            } else {
                this.targetX += (dx / distance) * moveAmount;
                this.targetY += (dy / distance) * moveAmount;
            }
        } else {
            this.completeSimulation();
        }
    }

    completeSimulation() {
        this.state = 'COMPLETED';
        this.isArcActive = false;
        window.weldingAudio.stopArcSound();
        this.updateHUD("Trening zakończony pomyślnie!", "active");
        this.arcStateBadge.innerText = "SPOINA UKOŃCZONA";
        this.arcStateBadge.className = "badge badge-active";

        setTimeout(() => {
            this.generateReport();
        }, 500);
    }

    renderCanvas() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;

        ctx.fillStyle = '#181a1f';
        ctx.fillRect(0, 0, width, height);

        const grooveWidth = (this.config.weldWidth * 4) + 10;
        const grad = ctx.createLinearGradient(centerX - grooveWidth / 2, 0, centerX + grooveWidth / 2, 0);
        grad.addColorStop(0, '#282b30');
        grad.addColorStop(0.5, '#121316');
        grad.addColorStop(1, '#282b30');
        ctx.fillStyle = grad;
        ctx.fillRect(centerX - grooveWidth / 2, 0, grooveWidth, height);

        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.strokeStyle = '#474d57';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#383d47';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - grooveWidth / 2, 0, grooveWidth, height);

        if (this.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (let i = 1; i < this.points.length; i++) {
                ctx.lineTo(this.points[i].x, this.points[i].y);
            }
            ctx.strokeStyle = 'rgba(255, 170, 0, 0.18)';
            ctx.lineWidth = this.poolRadius * 1.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 170, 0, 0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (this.stats.idealTrail.length > 2) {
            ctx.beginPath();
            ctx.moveTo(this.stats.idealTrail[0].x, this.stats.idealTrail[0].y);
            for (let i = 1; i < this.stats.idealTrail.length; i++) {
                ctx.lineTo(this.stats.idealTrail[i].x, this.stats.idealTrail[i].y);
            }
            ctx.strokeStyle = '#636b78';
            ctx.lineWidth = this.poolRadius * 1.4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            ctx.strokeStyle = '#4d535e';
            ctx.lineWidth = 1;
            for (let i = 0; i < this.stats.idealTrail.length; i += 6) {
                const pt = this.stats.idealTrail[i];
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, this.poolRadius * 0.7, 0, Math.PI);
                ctx.stroke();
            }
        }

        const isWaiting = (this.state === 'WAITING_FOR_IGNITION');
        const isArcOn = this.isArcActive;

        if (isArcOn) {
            const glowGrad = ctx.createRadialGradient(
                this.targetX, this.targetY, 2,
                this.targetX, this.targetY, this.poolRadius * 3.5
            );
            glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            glowGrad.addColorStop(0.2, 'rgba(255, 210, 80, 0.8)');
            glowGrad.addColorStop(0.6, 'rgba(255, 80, 0, 0.35)');
            glowGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, this.poolRadius * 3.5, 0, Math.PI * 2);
            ctx.fill();

            for (let s = 0; s < 3; s++) {
                const sparkAngle = Math.random() * Math.PI * 2;
                const sparkDist = this.poolRadius + Math.random() * 25;
                ctx.fillStyle = '#fff4a3';
                ctx.fillRect(
                    this.targetX + Math.cos(sparkAngle) * sparkDist,
                    this.targetY + Math.sin(sparkAngle) * sparkDist,
                    2, 2
                );
            }
        }

        ctx.beginPath();
        ctx.arc(this.targetX, this.targetY, this.poolRadius, 0, Math.PI * 2);
        if (isWaiting) {
            const pulse = 1 + 0.15 * Math.sin(Date.now() / 150);
            ctx.arc(this.targetX, this.targetY, this.poolRadius * pulse, 0, Math.PI * 2);
            ctx.fillStyle = '#ffea00';
            ctx.shadowColor = '#ffea00';
            ctx.shadowBlur = 18;
        } else if (isArcOn) {
            ctx.fillStyle = '#ff9100';
            ctx.shadowColor = '#ff3d00';
            ctx.shadowBlur = 20;
        } else {
            ctx.fillStyle = '#442222';
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = 12;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(this.targetX, this.targetY, this.toleranceRadius, 0, Math.PI * 2);
        ctx.strokeStyle = isArcOn ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 23, 68, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (this.isPointerDown && this.userPos.x > 0) {
            const dist = Math.hypot(this.userPos.x - this.targetX, this.userPos.y - this.targetY);
            const isGood = dist <= this.toleranceRadius;

            ctx.beginPath();
            ctx.arc(this.userPos.x, this.userPos.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = isGood ? '#00e5ff' : '#ff1744';
            ctx.shadowColor = isGood ? '#00e5ff' : '#ff1744';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (!isGood) {
                ctx.beginPath();
                ctx.moveTo(this.userPos.x, this.userPos.y);
                ctx.lineTo(this.targetX, this.targetY);
                ctx.strokeStyle = 'rgba(255, 23, 68, 0.7)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }

    generateReport() {
        if (!this.reportModal) return;

        const rawAcc = this.stats.totalFrames > 0
            ? (this.stats.onTargetFrames / this.stats.totalFrames) * 100
            : 0;

        const finalScore = Math.max(0, Math.round(rawAcc - (this.stats.arcBreaks * 5)));

        document.getElementById('reportScore').innerText = `${finalScore}%`;
        document.getElementById('reportBreaks').innerText = `${this.stats.arcBreaks}`;

        const badge = document.getElementById('reportGrade');
        if (finalScore >= 85) {
            badge.innerText = "Spoina klasy B (Znakomita)";
            badge.className = "grade-badge grade-b";
        } else if (finalScore >= 70) {
            badge.innerText = "Spoina klasy C (Dobra, dopuszczalna)";
            badge.className = "grade-badge grade-c";
        } else {
            badge.innerText = "Wymaga poprawy (Niezgodności spawalnicze)";
            badge.className = "grade-badge grade-d";
        }

        const avgLeft = this.getAverage(this.stats.leftEdgeTimeRecorded);
        const avgRight = this.getAverage(this.stats.rightEdgeTimeRecorded);
        const targetHold = this.baseEdgeHold / this.config.speedMultiplier;

        const leftFeedback = document.getElementById('leftEdgeFeedback');
        const rightFeedback = document.getElementById('rightEdgeFeedback');

        if (this.config.position === 'PF') {
            if (avgLeft < targetHold * 0.7) {
                leftFeedback.innerHTML = "<span class='text-danger'>Za krótki czas!</span> Ryzyko podtopień rowka (undercut).";
            } else {
                leftFeedback.innerHTML = "<span class='text-success'>Prawidłowy.</span> Dobre wtopienie w ściankę.";
            }

            if (avgRight < targetHold * 0.7) {
                rightFeedback.innerHTML = "<span class='text-danger'>Za krótki czas!</span> Ryzyko podtopień prawej ścianki.";
            } else {
                rightFeedback.innerHTML = "<span class='text-success'>Prawidłowy.</span> Dobre wypełnienie krawędzi.";
            }
        } else {
            leftFeedback.innerHTML = "<span class='text-success'>Optymalny.</span>";
            rightFeedback.innerHTML = "<span class='text-success'>Optymalny.</span>";
        }

        this.renderEvaluationCanvas();
        this.reportModal.classList.add('active');
    }

    getAverage(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    renderEvaluationCanvas() {
        if (!this.evalCanvas || !this.evalCtx) return;
        const ctx = this.evalCtx;
        const w = this.evalCanvas.width;
        const h = this.evalCanvas.height;

        ctx.fillStyle = '#1a1c22';
        ctx.fillRect(0, 0, w, h);

        const scaleX = w / this.canvas.width;
        const scaleY = h / this.canvas.height;

        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.strokeStyle = '#333842';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (this.stats.idealTrail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.stats.idealTrail[0].x * scaleX, this.stats.idealTrail[0].y * scaleY);
            for (let i = 1; i < this.stats.idealTrail.length; i++) {
                ctx.lineTo(this.stats.idealTrail[i].x * scaleX, this.stats.idealTrail[i].y * scaleY);
            }
            ctx.strokeStyle = 'rgba(255, 193, 7, 0.4)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        for (let i = 0; i < this.stats.userTrail.length; i++) {
            const pt = this.stats.userTrail[i];
            if (pt.x > 0) {
                ctx.fillStyle = pt.accurate ? 'rgba(0, 229, 255, 0.6)' : 'rgba(255, 23, 68, 0.8)';
                ctx.fillRect(pt.x * scaleX, pt.y * scaleY, 2, 2);
            }
        }
    }
}

window.weldingSimulator = new WeldingSimulator();
