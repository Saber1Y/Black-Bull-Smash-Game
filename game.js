const { Engine, Render, Runner, Bodies, Body, Composite, Events, Mouse, MouseConstraint, Vector } = Matter;

let engine, render, runner;
let bull, sling;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragCurrent = { x: 0, y: 0 };
let bullsRemaining = 3;
let score = 0;
let tokens = 0;
let currentLevel = 1;
let gameStarted = false;
let levelStructures = [];

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const levelCompleteScreen = document.getElementById('level-complete-screen');
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const shareBtn = document.getElementById('share-btn');
const nextLevelBtn = document.getElementById('next-level-btn');

const scoreValue = document.getElementById('score-value');
const tokensValue = document.getElementById('tokens-value');
const bullsValue = document.getElementById('bulls-value');
const levelValue = document.getElementById('level-value');

startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);
shareBtn.addEventListener('click', shareScore);
nextLevelBtn.addEventListener('click', nextLevel);

function initEngine() {
    engine = Engine.create({
        gravity: { x: 0, y: 1 }
    });
    
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
    
    createGround();
    createWalls();
    createSlingshot();
    setupControls();
    setupCollisionEvents();
}

function createGround() {
    const ground = Bodies.rectangle(
        canvas.width / 2,
        canvas.height - 25,
        canvas.width * 2,
        50,
        { 
            isStatic: true,
            render: { fillStyle: '#1a1a2e' }
        }
    );
    Composite.add(engine.world, ground);
}

function createWalls() {
    const leftWall = Bodies.rectangle(
        -25, canvas.height / 2,
        50, canvas.height * 2,
        { isStatic: true, render: { visible: false } }
    );
    const rightWall = Bodies.rectangle(
        canvas.width + 25, canvas.height / 2,
        50, canvas.height * 2,
        { isStatic: true, render: { visible: false } }
    );
    Composite.add(engine.world, [leftWall, rightWall]);
}

function createSlingshot() {
    const slingX = 150;
    const slingY = canvas.height - 150;
    
    sling = Bodies.circle(slingX, slingY, 20, {
        isStatic: true,
        render: {
            fillStyle: '#00ff88',
            strokeStyle: '#00ff88',
            lineWidth: 3
        }
    });
    
    Composite.add(engine.world, sling);
    createBull();
}

function createBull() {
    const slingPos = sling.position;
    bull = Bodies.circle(slingPos.x, slingPos.y, 25, {
        density: 0.004,
        restitution: 0.5,
        friction: 0.1,
        render: {
            fillStyle: '#1a1a1a',
            strokeStyle: '#ff00ff',
            lineWidth: 3
        }
    });
    bull.isLaunched = false;
    Composite.add(engine.world, bull);
}

function setupControls() {
    canvas.addEventListener('mousedown', handleDragStart);
    canvas.addEventListener('mousemove', handleDragMove);
    canvas.addEventListener('mouseup', handleDragEnd);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
}

function handleDragStart(e) {
    if (!gameStarted || !bull || bull.isLaunched) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const bullPos = bull.position;
    const dist = Math.sqrt((x - bullPos.x) ** 2 + (y - bullPos.y) ** 2);
    
    if (dist < 50) {
        isDragging = true;
        dragStart = { x: bullPos.x, y: bullPos.y };
        dragCurrent = { x, y };
    }
}

function handleDragMove(e) {
    if (!isDragging) return;
    
    const rect = canvas.getBoundingClientRect();
    dragCurrent = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    
    const dx = dragCurrent.x - dragStart.x;
    const dy = dragCurrent.y - dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxPull = 100;
    
    if (dist > maxPull) {
        const angle = Math.atan2(dy, dx);
        dragCurrent.x = dragStart.x + Math.cos(angle) * maxPull;
        dragCurrent.y = dragStart.y + Math.sin(angle) * maxPull;
    }
    
    Body.setPosition(bull, dragCurrent);
}

function handleDragEnd(e) {
    if (!isDragging || !bull) return;
    isDragging = false;
    launchBull();
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    handleDragStart({ clientX: touch.clientX, clientY: touch.clientY });
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    handleDragMove({ clientX: touch.clientX, clientY: touch.clientY });
}

function handleTouchEnd(e) {
    e.preventDefault();
    handleDragEnd(e);
}

function launchBull() {
    if (!bull || bull.isLaunched) return;
    
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const force = 0.008;
    
    Body.setVelocity(bull, { x: dx * force * 5, y: dy * force * 5 });
    bull.isLaunched = true;
    
    setTimeout(checkLevelState, 2000);
}

function setupCollisionEvents() {
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;
            
            if (bodyA.label === 'jeet' || bodyB.label === 'jeet') {
                const jeet = bodyA.label === 'jeet' ? bodyA : bodyB;
                const impactSpeed = Math.sqrt(
                    (bodyA.velocity.x - bodyB.velocity.x) ** 2 +
                    (bodyA.velocity.y - bodyB.velocity.y) ** 2
                );
                
                if (impactSpeed > 5) {
                    destroyJeet(jeet);
                }
            }
            
            if (bodyA.label === 'token' || bodyB.label === 'token') {
                const token = bodyA.label === 'token' ? bodyA : bodyB;
                collectToken(token);
            }
        });
    });
}

function destroyJeet(jeet) {
    score += 100;
    updateUI();
    createParticles(jeet.position.x, jeet.position.y, '#ff00ff');
    Composite.remove(engine.world, jeet);
    checkLevelComplete();
}

function collectToken(token) {
    tokens += 1;
    score += 50;
    updateUI();
    createParticles(token.position.x, token.position.y, '#ffff00');
    Composite.remove(engine.world, token);
}

function createParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
        const particle = Bodies.circle(x, y, 3, {
            density: 0.001,
            friction: 0.1,
            restitution: 0.8,
            render: {
                fillStyle: color
            }
        });
        
        const angle = (Math.PI * 2 * i) / 10;
        const speed = 5 + Math.random() * 5;
        Body.setVelocity(particle, {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        });
        
        Composite.add(engine.world, particle);
        
        setTimeout(() => {
            Composite.remove(engine.world, particle);
        }, 1000);
    }
}

function checkLevelComplete() {
    const jeets = Composite.allBodies(engine.world).filter(b => b.label === 'jeet');
    if (jeets.length === 0) {
        setTimeout(() => {
            showLevelComplete();
        }, 500);
    }
}

function checkLevelState() {
    if (!bull) return;
    
    const bullPos = bull.position;
    if (bullPos.x < 0 || bullPos.x > canvas.width || 
        bullPos.y > canvas.height + 100 || 
        (Math.abs(bull.velocity.x) < 0.5 && Math.abs(bull.velocity.y) < 0.5 && bull.isLaunched)) {
        
        bullsRemaining--;
        updateUI();
        
        if (bullsRemaining <= 0) {
            showGameOver();
        } else {
            removeBull();
            createBull();
        }
    } else if (bull.isLaunched) {
        setTimeout(checkLevelState, 500);
    }
}

function removeBull() {
    if (bull) {
        Composite.remove(engine.world, bull);
        bull = null;
    }
}

function createLevel(level) {
    clearLevel();
    
    const startX = canvas.width * 0.55;
    const groundY = canvas.height - 75;
    
    const structures = [
        { x: startX, y: groundY - 30, type: 'block' },
        { x: startX + 60, y: groundY - 30, type: 'block' },
        { x: startX + 120, y: groundY - 30, type: 'block' },
        { x: startX + 30, y: groundY - 90, type: 'block' },
        { x: startX + 90, y: groundY - 90, type: 'block' },
        { x: startX + 60, y: groundY - 150, type: 'block' },
    ];
    
    structures.forEach((s, i) => {
        const block = Bodies.rectangle(s.x, s.y, 50, 50, {
            render: {
                fillStyle: i % 2 === 0 ? '#2a1a3a' : '#1a2a3a',
                strokeStyle: '#4a3a5a',
                lineWidth: 2
            }
        });
        Composite.add(engine.world, block);
        levelStructures.push(block);
    });
    
    const jeetPositions = [
        { x: startX + 30, y: groundY - 120 },
        { x: startX + 90, y: groundY - 60 },
        { x: startX + 60, y: groundY - 180 },
    ];
    
    jeetPositions.forEach(pos => {
        const jeet = Bodies.circle(pos.x, pos.y, 15, {
            density: 0.002,
            restitution: 0.3,
            label: 'jeet',
            render: {
                fillStyle: '#ff0066',
                strokeStyle: '#ff0066',
                lineWidth: 2
            }
        });
        Composite.add(engine.world, jeet);
        levelStructures.push(jeet);
    });
    
    const tokenPositions = [
        { x: startX - 30, y: groundY - 180 },
        { x: startX + 150, y: groundY - 200 },
        { x: startX + 60, y: groundY - 250 },
    ];
    
    tokenPositions.forEach(pos => {
        const token = Bodies.circle(pos.x, pos.y, 10, {
            isStatic: true,
            isSensor: true,
            label: 'token',
            render: {
                fillStyle: '#ffff00',
                strokeStyle: '#ffff00',
                lineWidth: 2
            }
        });
        Composite.add(engine.world, token);
        levelStructures.push(token);
    });
    
    addLevelSpecificStructures(level);
}

function addLevelSpecificStructures(level) {
    const startX = canvas.width * 0.7;
    const groundY = canvas.height - 75;
    
    if (level >= 2) {
        const platform = Bodies.rectangle(startX + 200, groundY - 100, 100, 20, {
            isStatic: true,
            render: { fillStyle: '#3a2a4a' }
        });
        Composite.add(engine.world, platform);
        levelStructures.push(platform);
        
        const sniper = Bodies.circle(startX + 200, groundY - 130, 12, {
            density: 0.001,
            label: 'jeet',
            render: {
                fillStyle: '#ff3300',
                strokeStyle: '#ff3300'
            }
        });
        Composite.add(engine.world, sniper);
        levelStructures.push(sniper);
    }
    
    if (level >= 3) {
        for (let i = 0; i < 3; i++) {
            const wall = Bodies.rectangle(
                startX + 300 + i * 30,
                groundY - 25 * i - 25,
                15,
                50 + i * 50,
                {
                    isStatic: true,
                    render: { fillStyle: '#2a3a2a' }
                }
            );
            Composite.add(engine.world, wall);
            levelStructures.push(wall);
        }
    }
}

function clearLevel() {
    levelStructures.forEach(body => {
        Composite.remove(engine.world, body);
    });
    levelStructures = [];
    removeBull();
}

function startGame() {
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
        createBull();
    }
    
    createLevel(currentLevel);
}

function nextLevel() {
    currentLevel++;
    bullsRemaining = Math.min(bullsRemaining + 1, 5);
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
    scoreValue.textContent = score;
    tokensValue.textContent = tokens;
    bullsValue.textContent = bullsRemaining;
    levelValue.textContent = currentLevel;
}

function shareScore() {
    const text = `🐂 BLACK BULL SMASH 🐂\n\nScore: ${score}\n$ANSEM: ${tokens}\nLevel: ${currentLevel}\n\nCan you beat my score? #BlackBullSmash #ANSEM`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Black Bull Smash',
            text: text,
            url: window.location.href
        });
    } else {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank');
    }
}

function drawSlingshotLines() {
    if (!bull || bull.isLaunched || !sling) return;
    
    ctx.beginPath();
    ctx.moveTo(sling.position.x, sling.position.y);
    ctx.lineTo(bull.position.x, bull.position.y);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(bull.position.x, bull.position.y);
    const power = Math.sqrt(
        (dragStart.x - dragCurrent.x) ** 2 +
        (dragStart.y - dragCurrent.y) ** 2
    );
    const angle = Math.atan2(
        dragStart.y - dragCurrent.y,
        dragStart.x - dragCurrent.x
    );
    ctx.lineTo(
        bull.position.x + Math.cos(angle) * power * 0.5,
        bull.position.y + Math.sin(angle) * power * 0.5
    );
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.stroke();
}

Events.on(render, 'afterRender', drawSlingshotLines);

document.addEventListener('DOMContentLoaded', () => {
    initEngine();
    createLevel(1);
});