const { Engine, Render, Runner, Bodies, Body, Composite, Events, Vector } = Matter;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let engine, render, runner;
let bull = null;
let slingPos = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };
let bullsRemaining = 3;
let score = 0;
let tokens = 0;
let currentLevel = 1;
let gameStarted = false;
let levelBodies = [];
let trailPoints = [];
let comboCount = 0;
let comboTimer = null;
let shakeIntensity = 0;
let slowMoActive = false;
let slowMoTimer = null;
let trajectoryPoints = [];
let audioCtx = null;

const MAX_PULL = 120;
const LAUNCH_FORCE = 0.12;
const GROUND_Y_OFFSET = 60;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    slingPos.x = 150;
    slingPos.y = canvas.height - GROUND_Y_OFFSET - 80;
}
resizeCanvas();
window.addEventListener('resize', () => {
    resizeCanvas();
    if (engine) {
        resetGroundAndWalls();
    }
});

const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const levelCompleteScreen = document.getElementById('level-complete-screen');

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('share-btn').addEventListener('click', shareScore);
document.getElementById('next-level-btn').addEventListener('click', nextLevel);

const scoreValue = document.getElementById('score-value');
const tokensValue = document.getElementById('tokens-value');
const bullsValue = document.getElementById('bulls-value');
const levelValue = document.getElementById('level-value');

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    switch (type) {
        case 'launch':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
            break;
        case 'hit':
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
            break;
        case 'destroy':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
            break;
        case 'token':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
            break;
        case 'combo':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.05);
            osc.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
            break;
    }
}

function initEngine() {
    engine = Engine.create({ gravity: { x: 0, y: 1.2 } });

    render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: canvas.width,
            height: canvas.height,
            wireframes: false,
            background: 'transparent'
        }
    });

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    createGroundAndWalls();
    setupControls();
    setupCollisions();
    Events.on(render, 'afterRender', onAfterRender);
}

let groundBody = null;
let leftWall = null;
let rightWall = null;

function createGroundAndWalls() {
    groundBody = Bodies.rectangle(
        canvas.width / 2, canvas.height - GROUND_Y_OFFSET / 2,
        canvas.width * 3, GROUND_Y_OFFSET,
        { isStatic: true, friction: 0.8, render: { fillStyle: '#1a1a2e' } }
    );
    leftWall = Bodies.rectangle(
        -25, canvas.height / 2, 50, canvas.height * 2,
        { isStatic: true, render: { visible: false } }
    );
    rightWall = Bodies.rectangle(
        canvas.width + 25, canvas.height / 2, 50, canvas.height * 2,
        { isStatic: true, render: { visible: false } }
    );
    Composite.add(engine.world, [groundBody, leftWall, rightWall]);
}

function resetGroundAndWalls() {
    if (groundBody) Composite.remove(engine.world, groundBody);
    if (leftWall) Composite.remove(engine.world, leftWall);
    if (rightWall) Composite.remove(engine.world, rightWall);
    createGroundAndWalls();
}

function setupControls() {
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); onPointerUp(e); }, { passive: false });
}

function onPointerDown(e) {
    if (!gameStarted || !bull || bull.launched) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.pageX) - rect.left;
    const y = (e.clientY || e.pageY) - rect.top;
    const bPos = bull.position;
    const dist = Math.hypot(x - bPos.x, y - bPos.y);
    if (dist < 60) {
        isDragging = true;
        dragStart = { x: bPos.x, y: bPos.y };
        dragCurrent = { x, y };
    }
}

function onPointerMove(e) {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    dragCurrent = {
        x: (e.clientX || e.pageX) - rect.left,
        y: (e.clientY || e.pageY) - rect.top
    };

    const dx = dragCurrent.x - dragStart.x;
    const dy = dragCurrent.y - dragStart.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_PULL) {
        const angle = Math.atan2(dy, dx);
        dragCurrent.x = dragStart.x + Math.cos(angle) * MAX_PULL;
        dragCurrent.y = dragStart.y + Math.sin(angle) * MAX_PULL;
    }
    Body.setPosition(bull, dragCurrent);
    updateTrajectory();
}

function onPointerUp(e) {
    if (!isDragging || !bull) return;
    isDragging = false;
    launchBull();
}

function updateTrajectory() {
    trajectoryPoints = [];
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.hypot(dx, dy);
    if (power < 5) return;

    const vx = dx * LAUNCH_FORCE * 5;
    const vy = dy * LAUNCH_FORCE * 5;
    const gravity = engine.gravity.y * engine.gravity.scale;
    const steps = 20;

    for (let i = 1; i <= steps; i++) {
        const t = i * 0.03;
        const px = dragCurrent.x + vx * t;
        const py = dragCurrent.y + vy * t + 0.5 * gravity * 1000 * t * t;
        const alpha = 1 - (i / steps);
        trajectoryPoints.push({ x: px, y: py, alpha });
    }
}

function launchBull() {
    if (!bull || bull.launched) return;
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.hypot(dx, dy);
    if (power < 10) {
        Body.setPosition(bull, slingPos);
        return;
    }

    playSound('launch');
    Body.setVelocity(bull, { x: dx * LAUNCH_FORCE * 5, y: dy * LAUNCH_FORCE * 5 });
    bull.launched = true;
    trajectoryPoints = [];

    setTimeout(checkBullState, 2500);
}

function setupCollisions() {
    Events.on(engine, 'collisionStart', (event) => {
        for (const pair of event.pairs) {
            const a = pair.bodyA;
            const b = pair.bodyB;

            const speed = Math.hypot(
                (a.velocity ? a.velocity.x : 0) - (b.velocity ? b.velocity.x : 0),
                (a.velocity ? a.velocity.y : 0) - (b.velocity ? b.velocity.y : 0)
            );

            if (a.label === 'jeet' || b.label === 'jeet') {
                const jeet = a.label === 'jeet' ? a : b;
                if (speed > 4) {
                    destroyJeet(jeet, speed);
                } else if (speed > 2) {
                    playSound('hit');
                    shakeScreen(3);
                }
            }

            if (a.label === 'block' || b.label === 'block') {
                if (speed > 6) {
                    playSound('hit');
                    shakeScreen(2);
                }
            }

            if (a.label === 'token' || b.label === 'token') {
                const token = a.label === 'token' ? a : b;
                collectToken(token);
            }

            if (a.label === 'bull' || b.label === 'token') {
                if (speed > 3) {
                    shakeScreen(1);
                }
            }
        }
    });
}

function destroyJeet(jeet, speed) {
    if (jeet._destroyed) return;
    jeet._destroyed = true;

    comboCount++;
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { comboCount = 0; }, 2000);

    const multiplier = Math.min(comboCount, 5);
    const baseScore = 100;
    const impactBonus = Math.floor(speed * 10);
    const totalScore = (baseScore + impactBonus) * multiplier;

    score += totalScore;
    tokens += 1;

    if (comboCount > 1) {
        playSound('combo');
        showComboText(comboCount, jeet.position.x, jeet.position.y);
    } else {
        playSound('destroy');
    }

    createDestructionParticles(jeet.position.x, jeet.position.y, jeet.render.fillStyle || '#ff0066');
    shakeScreen(Math.min(6 + speed, 15));

    if (speed > 10) {
        triggerSlowMo(400);
    }

    Composite.remove(engine.world, jeet);
    updateUI();
    setTimeout(checkLevelComplete, 300);
}

function collectToken(token) {
    if (token._collected) return;
    token._collected = true;

    score += 50;
    tokens += 1;
    playSound('token');
    createTokenParticles(token.position.x, token.position.y);
    Composite.remove(engine.world, token);
    updateUI();
}

function showComboText(combo, x, y) {
    const div = document.createElement('div');
    div.className = 'combo-text';
    div.textContent = `${combo}x COMBO!`;
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    document.getElementById('game-container').appendChild(div);
    setTimeout(() => div.remove(), 1000);
}

function createDestructionParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
        const angle = (Math.PI * 2 * i) / 15 + Math.random() * 0.3;
        const speed = 4 + Math.random() * 8;
        const size = 2 + Math.random() * 4;
        const particle = Bodies.circle(x, y, size, {
            density: 0.0005,
            friction: 0.3,
            restitution: 0.6,
            render: { fillStyle: color }
        });
        Body.setVelocity(particle, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
        Composite.add(engine.world, particle);
        setTimeout(() => {
            if (Composite.get(engine.world, particle.id, 'body')) {
                Composite.remove(engine.world, particle);
            }
        }, 1500);
    }
}

function createTokenParticles(x, y) {
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const particle = Bodies.circle(x, y, 3, {
            density: 0.0003,
            restitution: 0.9,
            render: { fillStyle: '#ffff00' }
        });
        Body.setVelocity(particle, { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 });
        Composite.add(engine.world, particle);
        setTimeout(() => {
            if (Composite.get(engine.world, particle.id, 'body')) {
                Composite.remove(engine.world, particle);
            }
        }, 1000);
    }
}

function shakeScreen(intensity) {
    shakeIntensity = intensity;
}

function triggerSlowMo(duration) {
    if (slowMoActive) return;
    slowMoActive = true;
    engine.gravity.y = 0.3;
    engine.timing.timeScale = 0.4;
    clearTimeout(slowMoTimer);
    slowMoTimer = setTimeout(() => {
        slowMoActive = false;
        engine.gravity.y = 1.2;
        engine.timing.timeScale = 1;
    }, duration);
}

function createBull() {
    if (bull) Composite.remove(engine.world, bull);
    bull = Bodies.circle(slingPos.x, slingPos.y, 22, {
        density: 0.006,
        restitution: 0.45,
        friction: 0.5,
        frictionAir: 0.008,
        label: 'bull',
        render: { fillStyle: '#1a1a1a' }
    });
    bull.launched = false;
    bull._trailTimer = 0;
    Composite.add(engine.world, bull);
}

function checkBullState() {
    if (!bull) return;
    const pos = bull.position;
    const vel = bull.velocity;
    const outOfBounds = pos.x < -50 || pos.x > canvas.width + 50 || pos.y > canvas.height + 100;
    const stopped = bull.launched && Math.hypot(vel.x, vel.y) < 0.3;

    if (outOfBounds || stopped) {
        bullsRemaining--;
        updateUI();
        if (bullsRemaining <= 0) {
            showGameOver();
        } else {
            createBull();
        }
    } else if (bull.launched) {
        setTimeout(checkBullState, 600);
    }
}

function checkLevelComplete() {
    const jeets = Composite.allBodies(engine.world).filter(b => b.label === 'jeet' && !b._destroyed);
    if (jeets.length === 0) {
        setTimeout(showLevelComplete, 600);
    }
}

function clearLevel() {
    for (const body of levelBodies) {
        if (Composite.get(engine.world, body.id, 'body')) {
            Composite.remove(engine.world, body);
        }
    }
    levelBodies = [];
    if (bull) { Composite.remove(engine.world, bull); bull = null; }
    comboCount = 0;
    trailPoints = [];
}

function createBlock(x, y, w, h, opts = {}) {
    const block = Bodies.rectangle(x, y, w, h, {
        isStatic: true,
        density: 0.005,
        friction: 0.6,
        restitution: 0.2,
        label: 'block',
        render: {
            fillStyle: opts.color || '#2a1a3a',
            strokeStyle: opts.stroke || '#5a3a7a',
            lineWidth: 2
        },
        ...opts
    });
    Composite.add(engine.world, block);
    levelBodies.push(block);
    return block;
}

function createJeet(x, y, opts = {}) {
    const jeet = Bodies.circle(x, y, opts.radius || 14, {
        density: 0.003,
        restitution: 0.3,
        friction: 0.4,
        label: 'jeet',
        render: {
            fillStyle: opts.color || '#ff0066',
            strokeStyle: opts.stroke || '#ff3388',
            lineWidth: 2
        }
    });
    Composite.add(engine.world, jeet);
    levelBodies.push(jeet);
    return jeet;
}

function createSniper(x, y) {
    return createJeet(x, y, { radius: 11, color: '#ff3300', stroke: '#ff6633' });
}

function createToken(x, y) {
    const token = Bodies.circle(x, y, 10, {
        isStatic: true,
        isSensor: true,
        label: 'token',
        render: { fillStyle: '#ffff00', strokeStyle: '#ffcc00', lineWidth: 2 }
    });
    Composite.add(engine.world, token);
    levelBodies.push(token);
    return token;
}

function createPlatform(x, y, w) {
    return createBlock(x, y, w, 16, { color: '#3a2a4a', stroke: '#6a4a8a' });
}

const LEVELS = {
    1: () => {
        const sx = canvas.width * 0.55;
        const gy = canvas.height - GROUND_Y_OFFSET;

        createBlock(sx, gy - 25, 40, 50);
        createBlock(sx + 70, gy - 25, 40, 50);
        createBlock(sx + 140, gy - 25, 40, 50);
        createBlock(sx + 35, gy - 75, 40, 50);
        createBlock(sx + 105, gy - 75, 40, 50);
        createBlock(sx + 70, gy - 130, 50, 20);

        createJeet(sx + 35, gy - 105);
        createJeet(sx + 105, gy - 55);
        createJeet(sx + 70, gy - 160);

        createToken(sx - 30, gy - 160);
        createToken(sx + 180, gy - 180);
        createToken(sx + 70, gy - 210);
    },
    2: () => {
        const sx = canvas.width * 0.5;
        const gy = canvas.height - GROUND_Y_OFFSET;

        createBlock(sx, gy - 25, 50, 50);
        createBlock(sx + 80, gy - 25, 50, 50);
        createBlock(sx + 160, gy - 25, 50, 50);
        createBlock(sx + 40, gy - 80, 50, 50);
        createBlock(sx + 120, gy - 80, 50, 50);
        createBlock(sx + 80, gy - 140, 100, 20);
        createBlock(sx + 80, gy - 180, 50, 20);

        createJeet(sx + 40, gy - 115);
        createJeet(sx + 120, gy - 115);
        createJeet(sx + 80, gy - 170);
        createSniper(sx + 250, gy - 120);

        createToken(sx - 40, gy - 200);
        createToken(sx + 200, gy - 200);
        createToken(sx + 80, gy - 230);
        createToken(sx + 300, gy - 60);
    },
    3: () => {
        const sx = canvas.width * 0.45;
        const gy = canvas.height - GROUND_Y_OFFSET;

        createBlock(sx, gy - 25, 40, 50);
        createBlock(sx + 60, gy - 25, 40, 50);
        createBlock(sx + 120, gy - 25, 40, 50);
        createBlock(sx + 180, gy - 25, 40, 50);
        createBlock(sx + 30, gy - 80, 40, 50);
        createBlock(sx + 90, gy - 80, 40, 50);
        createBlock(sx + 150, gy - 80, 40, 50);
        createBlock(sx + 60, gy - 135, 120, 15);
        createBlock(sx + 60, gy - 175, 60, 15);
        createBlock(sx + 150, gy - 165, 40, 15);

        createBlock(sx + 300, gy - 50, 60, 100, { color: '#2a3a2a', stroke: '#4a6a4a' });

        createJeet(sx + 30, gy - 115);
        createJeet(sx + 90, gy - 55);
        createJeet(sx + 150, gy - 55);
        createSniper(sx + 60, gy - 200);
        createSniper(sx + 150, gy - 195);

        createToken(sx - 50, gy - 180);
        createToken(sx + 220, gy - 180);
        createToken(sx + 90, gy - 240);
        createToken(sx + 330, gy - 100);
        createToken(sx + 350, gy - 160);
    },
    4: () => {
        const sx = canvas.width * 0.4;
        const gy = canvas.height - GROUND_Y_OFFSET;

        for (let i = 0; i < 5; i++) {
            createBlock(sx + i * 65, gy - 25, 40, 50);
        }
        for (let i = 0; i < 4; i++) {
            createBlock(sx + 30 + i * 65, gy - 80, 40, 50);
        }
        for (let i = 0; i < 3; i++) {
            createBlock(sx + 65 + i * 65, gy - 135, 40, 50);
        }
        createBlock(sx + 130, gy - 175, 80, 15);
        createBlock(sx + 130, gy - 210, 50, 15);

        createBlock(sx + 380, gy - 40, 40, 80, { color: '#3a2a2a', stroke: '#6a4a4a' });
        createBlock(sx + 380, gy - 100, 40, 40, { color: '#3a2a2a', stroke: '#6a4a4a' });

        for (let i = 0; i < 4; i++) {
            createJeet(sx + 30 + i * 65 + (i % 2) * 35, gy - (i % 2 === 0 ? 55 : 115));
        }
        createSniper(sx + 130, gy - 200);
        createSniper(sx + 380, gy - 130);
        createJeet(sx + 380, gy - 70, { color: '#cc0044' });

        createToken(sx - 30, gy - 220);
        createToken(sx + 260, gy - 220);
        createToken(sx + 130, gy - 260);
        createToken(sx + 420, gy - 170);
        createToken(sx + 450, gy - 80);
    },
    5: () => {
        const sx = canvas.width * 0.35;
        const gy = canvas.height - GROUND_Y_OFFSET;

        for (let col = 0; col < 4; col++) {
            const cx = sx + col * 100;
            for (let row = 0; row < 3; row++) {
                createBlock(cx + (row % 2) * 20, gy - 25 - row * 55, 35, 45);
            }
        }

        createBlock(sx + 150, gy - 195, 200, 15);
        createBlock(sx + 150, gy - 230, 50, 15);
        createBlock(sx + 280, gy - 230, 50, 15);

        createBlock(sx + 450, gy - 50, 50, 100, { color: '#2a1a2a', stroke: '#5a3a5a' });
        createBlock(sx + 450, gy - 120, 50, 40, { color: '#2a1a2a', stroke: '#5a3a5a' });
        createBlock(sx + 450, gy - 180, 50, 40, { color: '#2a1a2a', stroke: '#5a3a5a' });

        for (let col = 0; col < 4; col++) {
            createJeet(sx + col * 100 + 10, gy - 95);
        }
        createSniper(sx + 150, gy - 220);
        createSniper(sx + 280, gy - 220);
        createSniper(sx + 450, gy - 150);
        createJeet(sx + 450, gy - 210, { color: '#cc0044' });
        createJeet(sx + 450, gy - 80, { color: '#cc0044' });

        createToken(sx - 20, gy - 250);
        createToken(sx + 200, gy - 270);
        createToken(sx + 350, gy - 270);
        createToken(sx + 500, gy - 230);
        createToken(sx + 530, gy - 100);
        createToken(sx + 100, gy - 300);
    }
};

function createLevel(level) {
    clearLevel();
    const builder = LEVELS[level] || LEVELS[1];
    builder();
}

function startGame() {
    initAudio();
    score = 0;
    tokens = 0;
    bullsRemaining = 3;
    currentLevel = 1;
    gameStarted = true;
    hideAllScreens();
    updateUI();

    if (!engine) {
        initEngine();
    } else {
        clearLevel();
        resetGroundAndWalls();
    }
    createBull();
    createLevel(currentLevel);
}

function nextLevel() {
    currentLevel++;
    bullsRemaining = Math.min(bullsRemaining + 2, 6);
    gameStarted = true;
    hideAllScreens();
    updateUI();
    clearLevel();
    createBull();
    createLevel(currentLevel);
}

function showGameOver() {
    gameStarted = false;
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-tokens').textContent = tokens;
    gameOverScreen.classList.add('active');
}

function showLevelComplete() {
    gameStarted = false;
    document.getElementById('level-score').textContent = score;
    levelCompleteScreen.classList.add('active');
}

function hideAllScreens() {
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    levelCompleteScreen.classList.remove('active');
}

function updateUI() {
    scoreValue.textContent = score.toLocaleString();
    tokensValue.textContent = tokens;
    bullsValue.textContent = bullsRemaining;
    levelValue.textContent = currentLevel;
}

function shareScore() {
    const text = `🐂 BLACK BULL SMASH 🐂\n\nScore: ${score.toLocaleString()}\n$ANSEM: ${tokens}\nLevel: ${currentLevel}\n\nCan you beat my score? #BlackBullSmash #ANSEM`;
    if (navigator.share) {
        navigator.share({ title: 'Black Bull Smash', text, url: window.location.href });
    } else {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    }
}

function onAfterRender() {
    const time = Date.now();

    if (shakeIntensity > 0) {
        const sx = (Math.random() - 0.5) * shakeIntensity;
        const sy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(sx, sy);
        shakeIntensity *= 0.85;
        if (shakeIntensity < 0.5) shakeIntensity = 0;
    }

    drawBackground();
    drawSlingBase();
    drawTrajectory();
    drawSlingshotLine();
    drawBull();
    drawJeets();
    drawTokens();
    drawTrail();

    if (shakeIntensity > 0 || slowMoActive) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

function drawBackground() {
    const gy = canvas.height - GROUND_Y_OFFSET;

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#050510');
    grad.addColorStop(0.4, '#0f0a20');
    grad.addColorStop(0.7, '#1a0a30');
    grad.addColorStop(1, '#0a0a15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0d0825';
    for (let i = 0; i < 8; i++) {
        const x = (i * canvas.width / 6) - 50;
        const w = 60 + Math.sin(i * 1.5) * 30;
        const h = 100 + Math.sin(i * 2.1) * 80;
        ctx.fillRect(x, gy - h, w, h);
    }

    ctx.fillStyle = '#0a0620';
    for (let i = 0; i < 12; i++) {
        const x = (i * canvas.width / 10) - 30;
        const w = 30 + Math.cos(i * 1.3) * 20;
        const h = 60 + Math.cos(i * 1.7) * 50;
        ctx.fillRect(x, gy - h, w, h);
    }

    for (let i = 0; i < 6; i++) {
        const wx = 80 + i * (canvas.width - 160) / 5;
        const wy = gy - 30 - Math.sin(i * 0.8) * 20;
        const ww = 3 + Math.random() * 2;
        ctx.fillStyle = `rgba(0, 255, 136, ${0.15 + Math.sin(Date.now() * 0.002 + i) * 0.1})`;
        ctx.fillRect(wx, wy, ww, 15 + Math.random() * 10);
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, gy, canvas.width, GROUND_Y_OFFSET);

    ctx.strokeStyle = '#00ff8844';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(canvas.width, gy);
    ctx.stroke();

    for (let i = 0; i < canvas.width; i += 30) {
        ctx.fillStyle = '#00ff8822';
        ctx.fillRect(i, gy + 5, 1, 8);
    }
}

function drawSlingBase() {
    const x = slingPos.x;
    const y = slingPos.y;

    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(x, y + 15, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 15);
    ctx.lineTo(x - 8, y - 10);
    ctx.moveTo(x + 12, y + 15);
    ctx.lineTo(x + 8, y - 10);
    ctx.stroke();

    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(x, y - 12, 6, 0, Math.PI * 2);
    ctx.fill();
}

function drawSlingshotLine() {
    if (!bull || bull.launched || !isDragging) return;

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(slingPos.x, slingPos.y - 12);
    ctx.lineTo(bull.position.x, bull.position.y);
    ctx.stroke();

    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.hypot(dx, dy);
    if (power < 5) return;

    const angle = Math.atan2(dy, dx);
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bull.position.x, bull.position.y);
    ctx.lineTo(
        bull.position.x + Math.cos(angle) * power * 0.5,
        bull.position.y + Math.sin(angle) * power * 0.5
    );
    ctx.stroke();

    const powerPct = power / MAX_PULL;
    const barW = 60;
    const barH = 8;
    const barX = bull.position.x - barW / 2;
    const barY = bull.position.y + 35;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    const powerGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    powerGrad.addColorStop(0, '#00ff88');
    powerGrad.addColorStop(1, '#ff00ff');
    ctx.fillStyle = powerGrad;
    ctx.fillRect(barX, barY, barW * powerPct, barH);
    ctx.strokeStyle = '#ffffff44';
    ctx.strokeRect(barX, barY, barW, barH);
}

function drawTrajectory() {
    if (!isDragging || trajectoryPoints.length === 0) return;
    for (const p of trajectoryPoints) {
        ctx.fillStyle = `rgba(255, 0, 255, ${p.alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * p.alpha, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBull() {
    if (!bull) return;
    const x = bull.position.x;
    const y = bull.position.y;
    const angle = bull.angle;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.ellipse(12, -2, 10, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, -8);
    ctx.lineTo(-30, -18);
    ctx.moveTo(-20, -6);
    ctx.lineTo(-28, -5);
    ctx.stroke();

    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.arc(16, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(16, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (!bull.launched) return;
    if (!bull._trailTimer) bull._trailTimer = 0;
    bull._trailTimer++;
    if (bull._trailTimer % 2 === 0) {
        trailPoints.push({ x, y, alpha: 1, time: Date.now() });
    }
    if (trailPoints.length > 40) trailPoints.shift();
}

function drawTrail() {
    const now = Date.now();
    trailPoints = trailPoints.filter(p => now - p.time < 500);

    for (let i = 0; i < trailPoints.length; i++) {
        const p = trailPoints[i];
        const age = (now - p.time) / 500;
        p.alpha = 1 - age;
        const size = 6 * p.alpha;

        ctx.fillStyle = `rgba(255, 0, 255, ${p.alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(0, 255, 136, ${p.alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawJeets() {
    const jeets = Composite.allBodies(engine.world).filter(b => b.label === 'jeet' && !b._destroyed);
    for (const jeet of jeets) {
        const x = jeet.position.x;
        const y = jeet.position.y;
        const r = jeet.circleRadius || 14;

        ctx.fillStyle = jeet.render.fillStyle || '#ff0066';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = jeet.render.strokeStyle || '#ff3388';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.2, 0, Math.PI * 2);
        ctx.arc(x + r * 0.3, y - r * 0.2, r * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0a0a0f';
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
        ctx.arc(x + r * 0.3, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.3, y + r * 0.3);
        ctx.lineTo(x + r * 0.3, y + r * 0.3);
        ctx.stroke();

        const isSniper = (jeet.render.fillStyle === '#ff3300');
        if (isSniper) {
            ctx.strokeStyle = '#ff3300';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y - r - 3);
            ctx.lineTo(x, y - r - 10);
            ctx.moveTo(x - 4, y - r - 8);
            ctx.lineTo(x, y - r - 10);
            ctx.lineTo(x + 4, y - r - 8);
            ctx.stroke();
        }
    }
}

function drawTokens() {
    const tokensBodies = Composite.allBodies(engine.world).filter(b => b.label === 'token' && !b._collected);
    const time = Date.now() * 0.003;
    for (const tok of tokensBodies) {
        const x = tok.position.x;
        const y = tok.position.y + Math.sin(time + x * 0.01) * 4;
        const r = 10;

        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff9900';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', x, y + 1);

        ctx.fillStyle = `rgba(255, 204, 0, ${0.2 + Math.sin(time * 2) * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, Math.PI * 2);
        ctx.fill();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    initEngine();
    createLevel(1);
});