   (function(){
    // ----- DOM elements -----
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const homeScreen = document.getElementById('homeScreen');
    const gameHud = document.getElementById('gameHud');
    const pauseMenu = document.getElementById('pauseMenu');
    const gameOverMenu = document.getElementById('gameOverMenu');
    const gameOverTitle = document.getElementById('gameOverTitle');
    const finalScoreDisplay = document.getElementById('finalScoreDisplay');
    const highScoreDisplay = document.getElementById('highScoreDisplay');
    
    const startBtn = document.getElementById('startGameBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const endGameBtn = document.getElementById('endGameBtn');
    const pauseToMenuBtn = document.getElementById('pauseToMenuBtn');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const gameOverToMenuBtn = document.getElementById('gameOverToMenuBtn');
    const soundToggleBtn = document.getElementById('soundToggleBtn');
    
    const targetSpan = document.getElementById('targetVal');
    const scoreSpan = document.getElementById('scoreVal');
    const totalScoreSpan = document.getElementById('totalScoreSpan');
    const fillBar = document.getElementById('fillBar');
    const needSpan = document.getElementById('needSpan');
    const statusDiv = document.getElementById('statusMsg');
    
    // ----- SCORING & HIGH SCORE -----
    let totalScore = 0;
    let highScore = localStorage.getItem('endlessLoopHighScore') ? parseInt(localStorage.getItem('endlessLoopHighScore')) : 0;
    
    function updateTotalScoreUI() { totalScoreSpan.innerText = totalScore; }
    function saveHighScore() { if (totalScore > highScore) { highScore = totalScore; localStorage.setItem('endlessLoopHighScore', highScore); } }
    
    // ----- AUDIO SYSTEM -----
    let audioCtx = null, bgInterval = null, soundEnabled = true, audioInitialized = false;
    function initAudio() { if (audioCtx) return; audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioCtx.suspend(); }
    async function resumeAudio() {
        if (!audioCtx) initAudio();
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        if (!audioInitialized && soundEnabled) { audioInitialized = true; startBackgroundMusic(); }
    }
    function startBackgroundMusic() {
        if (!soundEnabled || !audioCtx) return;
        if (bgInterval) clearInterval(bgInterval);
        const notes = [261.63, 329.63, 392.00, 523.25];
        let noteIndex = 0, lastTime = 0;
        function playNote() {
            if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
            const now = audioCtx.currentTime;
            if (now - lastTime < 0.4) return;
            lastTime = now;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.value = notes[noteIndex % notes.length];
            gain.gain.value = 0.05;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
            osc.stop(now + 0.7);
            noteIndex++;
        }
        bgInterval = setInterval(playNote, 950);
    }
    function stopBackgroundMusic() { if (bgInterval) clearInterval(bgInterval); bgInterval = null; }
    function playShootSound() {
        if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'triangle'; osc.frequency.value = 880; gain.gain.value = 0.12;
        osc.start(); gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        osc.stop(audioCtx.currentTime + 0.2);
    }
    function playHitSound(value) {
        if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.value = 300 + value * 40; gain.gain.value = 0.15;
        osc.start(); gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
        osc.stop(audioCtx.currentTime + 0.25);
    }
    function playTargetClearSound() {
        if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
        const notes = [523.25, 659.25, 783.99];
        let delay = 0;
        for (let f of notes) {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'sine'; osc.frequency.value = f; gain.gain.value = 0.2;
            osc.start(audioCtx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.3);
            osc.stop(audioCtx.currentTime + delay + 0.3);
            delay += 0.12;
        }
    }
    function toggleSound() {
        soundEnabled = !soundEnabled;
        soundToggleBtn.innerText = soundEnabled ? "🔊 SOUND ON" : "🔇 SOUND OFF";
        if (soundEnabled && audioCtx && audioCtx.state === 'running' && !bgInterval) startBackgroundMusic();
        else if (!soundEnabled && bgInterval) stopBackgroundMusic();
    }
    
    // ----- GAME STATE -----
    let targetNumber = 25, currentSum = 0, gameActive = false, isPaused = false, totalClearCount = 0;
    let blocks = [];
    let bullets = [], particles = [], floaters = [];
    
    let baseFallSpeed = 0.09, currentFallSpeed = 0.09, MAX_FALL_SPEED = 0.65;
    const SHOOTER_DEATH_Y_OFFSET = 48;
    
    let cannonX = 0, cannonY = 0, currentAngle = -Math.PI / 2, BULLET_SPEED = 9.0;
    
    const ROWS = 2, COLS = 4;
    const BASE_W = 68, BASE_H = 68;
    
    function getBlockScale() { let s = 1 + totalClearCount * 0.04; return Math.min(s, 1.6); }
    function getBlockSize() { const s = getBlockScale(); return { w: Math.floor(BASE_W * s), h: Math.floor(BASE_H * s) }; }
    
    function getRowY(row) {
        const row1Y = 70, row2Y = 160;
        return row === 0 ? row1Y : row2Y;
    }
    
    function computeGridPositions() {
        const { w, h } = getBlockSize();
        const margin = 45;
        const totalWidth = canvas.width - margin * 2;
        const spacing = (totalWidth - w * COLS) / (COLS + 1);
        const startX = margin + spacing;
        const positions = [];
        for (let row = 0; row < ROWS; row++) {
            const y = getRowY(row);
            for (let col = 0; col < COLS; col++) {
                positions.push({ x: startX + col * (w + spacing), y: y, row: row, col: col });
            }
        }
        return positions;
    }
    
    function initBlocks() {
        const positions = computeGridPositions();
        blocks = [];
        for (let i = 0; i < ROWS * COLS; i++) {
            const pos = positions[i];
            blocks.push({
                x: pos.x, y: pos.y, row: pos.row, col: pos.col,
                w: BASE_W, h: BASE_H,
                value: Math.floor(Math.random() * 9) + 1,
                vy: currentFallSpeed
            });
        }
        const { w, h } = getBlockSize();
        for (let b of blocks) { b.w = w; b.h = h; }
        repositionAllBlocks();
    }
    
    function repositionAllBlocks() {
        const positions = computeGridPositions();
        const { w, h } = getBlockSize();
        for (let i = 0; i < blocks.length; i++) {
            blocks[i].x = positions[i].x;
            blocks[i].y = positions[i].y;
            blocks[i].w = w;
            blocks[i].h = h;
            blocks[i].row = positions[i].row;
            blocks[i].col = positions[i].col;
            blocks[i].vy = currentFallSpeed;
        }
    }
    
    function shiftColumn(col) {
        const columnBlocks = blocks.filter(b => b.col === col).sort((a,b) => a.row - b.row);
        if (columnBlocks.length !== 2) return;
        const topBlock = columnBlocks[0];
        const bottomBlock = columnBlocks[1];
        bottomBlock.value = topBlock.value;
        topBlock.value = Math.floor(Math.random() * 9) + 1;
        const { w, h } = getBlockSize();
        const margin = 45;
        const totalWidth = canvas.width - margin * 2;
        const spacing = (totalWidth - w * COLS) / (COLS + 1);
        const startX = margin + spacing;
        topBlock.x = startX + col * (w + spacing);
        bottomBlock.x = startX + col * (w + spacing);
        topBlock.y = getRowY(0);
        bottomBlock.y = getRowY(1);
        topBlock.w = w; bottomBlock.w = w;
        topBlock.h = h; bottomBlock.h = h;
        topBlock.vy = currentFallSpeed;
        bottomBlock.vy = currentFallSpeed;
    }
    
    function updateFallingBlocks() {
        for (let b of blocks) {
            b.y += b.vy;
        }
    }
    
    function checkCrushLoss() {
        if (!gameActive) return false;
        const deathY = cannonY - SHOOTER_DEATH_Y_OFFSET;
        for (let b of blocks) {
            if (b.y + b.h >= deathY) {
                endGame(false, "💀 CRUSHED! Block reached you");
                return true;
            }
        }
        return false;
    }
    
    function endGame(win, msg) {
        if (!gameActive) return;
        gameActive = false;
        isPaused = false;
        pauseMenu.style.display = 'none';
        gameOverTitle.innerText = msg;
        gameOverTitle.style.color = win ? "#b3ffa7" : "#ffab8a";
        saveHighScore();
        finalScoreDisplay.innerHTML = `🏆 YOUR SCORE: ${totalScore}`;
        highScoreDisplay.innerHTML = `⭐ HIGH SCORE: ${highScore}`;
        gameOverMenu.style.display = "flex";
        gameHud.style.display = "none";
        stopBackgroundMusic();
    }
    
    function checkOvershoot() {
        if (!gameActive) return false;
        if (currentSum > targetNumber) {
            // reset sum and continue — overshoot just resets, not a loss
            currentSum = 0;
            updateUI();
            addFloater(canvas.width/2, cannonY - 60, "OVERSHOOT! Reset ↺");
            return false;
        }
        return false;
    }
    
    function onTargetCleared() {
        const aliveCount = blocks.length;
        let pointsEarned = 10;
        if (aliveCount < 4) pointsEarned = 15;
        totalScore += pointsEarned;
        updateTotalScoreUI();
        saveHighScore();
        
        totalClearCount++;
        currentFallSpeed = Math.min(baseFallSpeed + totalClearCount * 0.018, MAX_FALL_SPEED);
        for (let b of blocks) b.vy = currentFallSpeed;
        
        let newTargetMin = 15 + Math.floor(totalClearCount * 0.8);
        let newTargetMax = 40 + Math.floor(totalClearCount * 1.5);
        newTargetMin = Math.min(newTargetMin, 40);
        newTargetMax = Math.min(newTargetMax, 70);
        targetNumber = Math.floor(Math.random() * (newTargetMax - newTargetMin + 1)) + newTargetMin;
        currentSum = 0;
        
        const { w, h } = getBlockSize();
        for (let b of blocks) { b.w = w; b.h = h; }
        repositionAllBlocks();
        updateUI();
        addFloater(canvas.width/2, 80, `+${pointsEarned} PTS! NEXT TARGET: ${targetNumber}`);
        playTargetClearSound();
    }
    
    function updateUI() {
        if (!gameActive) return;
        targetSpan.innerText = targetNumber;
        scoreSpan.innerText = currentSum;
        let percent = (currentSum / targetNumber) * 100;
        percent = Math.min(100, percent);
        fillBar.style.width = percent + "%";
        if (currentSum > targetNumber) fillBar.style.background = "#ff5a6e";
        else if (currentSum === targetNumber) fillBar.style.background = "#b6ff00";
        else fillBar.style.background = "linear-gradient(90deg, #2aff8c, #00e0ff)";
        let need = targetNumber - currentSum;
        needSpan.innerText = need > 0 ? need : 0;
    }
    
    function updateBulletsWithBounce() {
        for (let i=0; i<bullets.length; i++) {
            const b = bullets[i];
            b.x += b.vx; b.y += b.vy;
            if (b.x - b.radius <= 0) { b.x = b.radius; b.vx = -b.vx; }
            if (b.x + b.radius >= canvas.width) { b.x = canvas.width - b.radius; b.vx = -b.vx; }
            if (b.y - b.radius <= 0) { b.y = b.radius; b.vy = -b.vy; }
            if (b.y + b.radius >= canvas.height) { bullets.splice(i,1); i--; }
        }
    }
    
    function handleCollisions() {
        for (let i=bullets.length-1; i>=0; i--) {
            const bullet = bullets[i];
            for (let j=0; j<blocks.length; j++) {
                const bl = blocks[j];
                if (bullet.x > bl.x && bullet.x < bl.x+bl.w && bullet.y > bl.y && bullet.y < bl.y+bl.h) {
                    currentSum += bl.value;
                    updateUI();
                    addFloater(bl.x+bl.w/2, bl.y-5, bl.value);
                    addExplosion(bl.x+bl.w/2, bl.y+bl.h/2);
                    playHitSound(bl.value);
                    shiftColumn(bl.col);
                    bullets.splice(i,1);
                    if (currentSum === targetNumber) {
                        onTargetCleared();
                    } else if (currentSum > targetNumber) {
                        // overshoot: reset sum and notify, game continues
                        currentSum = 0;
                        updateUI();
                        addFloater(canvas.width/2, cannonY - 60, "OVERSHOOT! Reset ↺");
                    }
                    break;
                }
            }
        }
    }
    
    function drawFullTrajectory(startX, startY, angleRad) {
        let x = startX, y = startY;
        let vx = Math.cos(angleRad) * BULLET_SPEED;
        let vy = Math.sin(angleRad) * BULLET_SPEED;
        const stepSize = 5;
        let maxSteps = 120;
        let pathPoints = [{x, y}];
        let hitBlock = null, hitPoint = null;
        for (let step = 0; step < maxSteps; step++) {
            let nextX = x + vx * stepSize, nextY = y + vy * stepSize;
            let newVx = vx, newVy = vy;
            if (nextX - 6 <= 0) { nextX = 6; newVx = -vx; }
            else if (nextX + 6 >= canvas.width) { nextX = canvas.width - 6; newVx = -vx; }
            if (nextY - 6 <= 0) { nextY = 6; newVy = -vy; }
            
            let blockCollision = null, collisionPoint = null;
            for (let bl of blocks) {
                const intersect = lineRectIntersectionPoint(x, y, nextX, nextY, bl.x, bl.y, bl.w, bl.h);
                if (intersect) { blockCollision = bl; collisionPoint = intersect; break; }
            }
            if (blockCollision) {
                pathPoints.push(collisionPoint);
                hitBlock = blockCollision; hitPoint = collisionPoint;
                break;
            }
            pathPoints.push({x: nextX, y: nextY});
            x = nextX; y = nextY;
            vx = newVx; vy = newVy;
            if (y > canvas.height + 100) break;
        }
        if (pathPoints.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
        for (let i = 1; i < pathPoints.length; i++) ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
        ctx.strokeStyle = "rgba(255, 220, 100, 0.95)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 1; i < pathPoints.length - 1; i++) {
            ctx.beginPath(); ctx.arc(pathPoints[i].x, pathPoints[i].y, 4, 0, Math.PI*2);
            ctx.fillStyle = "rgba(255, 200, 70, 0.8)"; ctx.fill();
        }
        if (hitBlock && hitPoint) {
            ctx.beginPath();
            ctx.moveTo(hitPoint.x-10, hitPoint.y-10); ctx.lineTo(hitPoint.x+10, hitPoint.y+10);
            ctx.moveTo(hitPoint.x+10, hitPoint.y-10); ctx.lineTo(hitPoint.x-10, hitPoint.y+10);
            ctx.strokeStyle = "#ff6666"; ctx.lineWidth = 2.5; ctx.stroke();
        }
        ctx.restore();
    }
    
    function lineRectIntersectionPoint(x1,y1,x2,y2, rx,ry,rw,rh) {
        const edges = [
            {x1:rx,y1:ry, x2:rx+rw,y2:ry}, {x1:rx,y1:ry+rh, x2:rx+rw,y2:ry+rh},
            {x1:rx,y1:ry, x2:rx,y2:ry+rh}, {x1:rx+rw,y1:ry, x2:rx+rw,y2:ry+rh}
        ];
        let closest = null, minDist = Infinity;
        for (let e of edges) {
            const det = (x2-x1)*(e.y2-e.y1) - (y2-y1)*(e.x2-e.x1);
            if (det === 0) continue;
            const r = ((y1-e.y1)*(e.x2-e.x1) - (x1-e.x1)*(e.y2-e.y1)) / det;
            const s = ((y1-e.y1)*(x2-x1) - (x1-e.x1)*(y2-y1)) / det;
            if (r>=0 && r<=1 && s>=0 && s<=1) {
                const ix = x1 + r*(x2-x1), iy = y1 + r*(y2-y1);
                const dist = Math.hypot(ix-x1, iy-y1);
                if (dist < minDist) { minDist = dist; closest = {x:ix, y:iy}; }
            }
        }
        return closest;
    }
    
    function updateAimAngle(mouseX, mouseY) {
        if (!gameActive || isPaused) return;
        const dx = mouseX - cannonX, dy = mouseY - cannonY;
        currentAngle = Math.atan2(dy, dx);
    }
    function onPointerMove(e) {
        if (!gameActive || isPaused) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; e.preventDefault(); }
        else { clientX = e.clientX; clientY = e.clientY; }
        const canvasX = (clientX - rect.left) * scaleX, canvasY = (clientY - rect.top) * scaleY;
        updateAimAngle(canvasX, canvasY);
    }
    function shoot() {
        if (!gameActive || isPaused) return;
        const vx = Math.cos(currentAngle) * BULLET_SPEED, vy = Math.sin(currentAngle) * BULLET_SPEED;
        bullets.push({ x: cannonX, y: cannonY, radius: 6, vx, vy });
        playShootSound();
        if (navigator.vibrate) navigator.vibrate(20);
    }
    function onPointerDown(e) { if (!gameActive || isPaused) return; shoot(); if (e.touches) e.preventDefault(); }
    
    function addFloater(x,y,val) { floaters.push({ x, y, text: val.toString(), life: 1.0, vy: -2.5 }); }
    function addExplosion(x,y) {
        for (let i=0;i<12;i++) {
            const angle = Math.random()*Math.PI*2, sp = 1.2+Math.random()*4;
            particles.push({ x, y, vx: Math.cos(angle)*sp, vy: Math.sin(angle)*sp, life: 0.7+Math.random()*0.5, size: 3+Math.random()*7, color: `hsl(${30+Math.random()*40},85%,60%)` });
        }
    }
    function updateEffects() {
        for (let i=0;i<floaters.length;i++) { floaters[i].y += floaters[i].vy; floaters[i].vy += 0.12; floaters[i].life -= 0.02; if (floaters[i].life<=0) floaters.splice(i--,1); }
        for (let i=0;i<particles.length;i++) { particles[i].x += particles[i].vx; particles[i].y += particles[i].vy; particles[i].vy += 0.2; particles[i].life -= 0.02; if (particles[i].life<=0) particles.splice(i--,1); }
    }
    
    function drawBackground() {
        const grad = ctx.createLinearGradient(0,0,0,canvas.height);
        grad.addColorStop(0,"#0a1122"); grad.addColorStop(1,"#03060c");
        ctx.fillStyle=grad; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle="rgba(60,140,220,0.08)";
        for(let i=0;i<canvas.width;i+=55){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
        for(let i=0;i<canvas.height;i+=55){ ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); ctx.stroke(); }
    }
    function drawBlocks() {
        for(let b of blocks){
            ctx.save(); ctx.shadowBlur=12; ctx.shadowColor="rgba(200,60,60,0.7)";
            ctx.fillStyle="#e33939"; ctx.beginPath(); ctx.roundRect(b.x,b.y,b.w,b.h,12); ctx.fill();
            ctx.fillStyle="#ff9766"; ctx.beginPath(); ctx.roundRect(b.x+3,b.y+3,b.w-6,b.h/2,8); ctx.fill();
            ctx.strokeStyle="#ffb87a"; ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect(b.x,b.y,b.w,b.h,12); ctx.stroke();
            let fs=Math.min(36,Math.floor(b.w*0.45)); ctx.font=`bold ${fs}px "Segoe UI"`; ctx.fillStyle="white"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(b.value,b.x+b.w/2,b.y+b.h/2);
            ctx.restore();
        }
    }
    function drawCannon() {
        ctx.save(); ctx.shadowBlur=12; ctx.shadowColor="#1cc0ff";
        ctx.beginPath(); ctx.arc(cannonX,cannonY,24,0,Math.PI*2); ctx.fillStyle="#1a5985"; ctx.fill();
        ctx.beginPath(); ctx.arc(cannonX,cannonY,16,0,Math.PI*2); ctx.fillStyle="#bde5ff"; ctx.fill();
        const barrelLen = 32, tipX = cannonX + Math.cos(currentAngle)*barrelLen, tipY = cannonY + Math.sin(currentAngle)*barrelLen;
        ctx.beginPath(); ctx.moveTo(cannonX,cannonY); ctx.lineTo(tipX,tipY);
        ctx.lineWidth=8; ctx.strokeStyle="#ffcf6e"; ctx.stroke();
        ctx.beginPath(); ctx.arc(tipX,tipY,6,0,Math.PI*2); ctx.fillStyle="#ffaa33"; ctx.fill();
        ctx.restore();
    }
    function drawTrajectory() { if (!gameActive || isPaused) return; drawFullTrajectory(cannonX, cannonY, currentAngle); }
    function drawBullets(){ for(let b of bullets){ ctx.save(); ctx.shadowBlur=10; ctx.shadowColor="#ffbb44"; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius-1,0,Math.PI*2); ctx.fillStyle="#ffdd77"; ctx.fill(); ctx.beginPath(); ctx.arc(b.x,b.y,b.radius-3,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill(); ctx.restore(); } }
    function drawEffects(){ for(let f of floaters){ ctx.globalAlpha=f.life; ctx.font="bold 24px monospace"; ctx.fillStyle="#ffe085"; ctx.fillText(f.text,f.x,f.y); } for(let p of particles){ ctx.globalAlpha=p.life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fill(); } ctx.globalAlpha=1; }
    function drawStatusText(){ if(!gameActive) return; const alive=blocks.length; const need=targetNumber-currentSum; if(need===1) statusDiv.innerHTML=`🎯 EXACT 1 needed!`; else statusDiv.innerHTML=`⬇️ ${alive} blocks | need ${need} | cleared ${totalClearCount} targets`; }
    
    function resizeAndAdapt() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; cannonX = canvas.width/2; cannonY = canvas.height - 55; repositionAllBlocks(); }
    
    function gameUpdate() {
        if(!gameActive || isPaused) return;
        updateFallingBlocks();
        if(checkCrushLoss()) return;
        updateBulletsWithBounce();
        handleCollisions();
        updateEffects();
        drawStatusText();
    }
    function animate() { gameUpdate(); drawBackground(); drawBlocks(); drawCannon(); drawTrajectory(); drawBullets(); drawEffects(); requestAnimationFrame(animate); }
    
    function startGame() {
        gameActive = true; isPaused = false; pauseMenu.style.display = 'none'; gameOverMenu.style.display = 'none';
        homeScreen.style.display = 'none'; gameHud.style.display = 'block';
        currentSum = 0; totalClearCount = 0; totalScore = 0; updateTotalScoreUI();
        targetNumber = Math.floor(Math.random() * 26) + 15;
        currentFallSpeed = baseFallSpeed;
        bullets = []; particles = []; floaters = [];
        currentAngle = -Math.PI / 2;
        initBlocks();
        resizeAndAdapt();
        updateUI();
        statusDiv.innerHTML = "✨ ENDLESS LOOP — hit blocks to shift columns, clear targets to score!";
        resumeAudio();
    }
    function returnToMenu() {
        gameActive = false; isPaused = false; pauseMenu.style.display = 'none'; gameOverMenu.style.display = 'none';
        homeScreen.style.display = 'flex'; gameHud.style.display = 'none';
        stopBackgroundMusic();
    }
    function endGameManually() { if (gameActive) endGame(false, "🏁 GAME ENDED"); pauseMenu.style.display = 'none'; }
    
    function setupAudioResume() {
        const handler = () => { if (audioCtx && audioCtx.state === 'suspended') resumeAudio(); document.removeEventListener('click', handler); document.removeEventListener('touchstart', handler); };
        document.addEventListener('click', handler); document.addEventListener('touchstart', handler);
    }
    
    function attachEvents() {
        canvas.addEventListener('mousemove', onPointerMove); canvas.addEventListener('click', onPointerDown);
        canvas.addEventListener('touchmove', onPointerMove, { passive: false }); canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        window.addEventListener('resize', resizeAndAdapt);
        startBtn.addEventListener('click', startGame);
        pauseBtn.addEventListener('click', () => { if(gameActive && !isPaused) { isPaused = true; pauseMenu.style.display = 'flex'; } });
        resumeBtn.addEventListener('click', () => { if(gameActive) { isPaused = false; pauseMenu.style.display = 'none'; } });
        endGameBtn.addEventListener('click', endGameManually);
        pauseToMenuBtn.addEventListener('click', returnToMenu);
        playAgainBtn.addEventListener('click', () => { gameOverMenu.style.display = 'none'; startGame(); });
        gameOverToMenuBtn.addEventListener('click', returnToMenu);
        soundToggleBtn.addEventListener('click', toggleSound);
        setupAudioResume();
    }
    
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
            if(w<2*r) r=w/2; if(h<2*r) r=h/2;
            this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.quadraticCurveTo(x+w,y,x+w,y+r);
            this.lineTo(x+w,y+h-r); this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
            this.lineTo(x+r,y+h); this.quadraticCurveTo(x,y+h,x,y+h-r);
            this.lineTo(x,y+r); this.quadraticCurveTo(x,y,x+r,y);
            return this;
        };
    }
    
    initAudio();
    resizeAndAdapt();
    attachEvents();
    animate();
})();
