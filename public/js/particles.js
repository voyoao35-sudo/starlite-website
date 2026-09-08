// Starlite Interactive Cyber Particle Engine (Electric Blue & Constellations)
(function () {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouse = { x: null, y: null, radius: 140 };

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initParticles();
    });

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    const colors = [
        'rgba(59, 130, 246, ',   // Electric Blue
        'rgba(96, 165, 250, ',   // Ice Blue
        'rgba(56, 189, 248, ',   // Sky Cyan
        'rgba(147, 197, 253, ',  // Soft Blue
        'rgba(240, 246, 255, '   // Starlight White
    ];

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = Math.random() * 2.0 + 0.6;
            this.baseSize = this.size;
            this.vx = (Math.random() - 0.5) * 0.35;
            this.vy = (Math.random() - 0.5) * 0.35;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.alpha = Math.random() * 0.5 + 0.2;
            this.twinkleSpeed = Math.random() * 0.015 + 0.005;
            this.twinkleDir = Math.random() > 0.5 ? 1 : -1;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0) this.x = width;
            if (this.x > width) this.x = 0;
            if (this.y < 0) this.y = height;
            if (this.y > height) this.y = 0;

            this.alpha += this.twinkleSpeed * this.twinkleDir;
            if (this.alpha >= 0.8) this.twinkleDir = -1;
            if (this.alpha <= 0.15) this.twinkleDir = 1;

            if (mouse.x !== null && mouse.y !== null) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < mouse.radius) {
                    const force = (1 - dist / mouse.radius) * 1.2;
                    this.x -= (dx / dist) * force;
                    this.y -= (dy / dist) * force;
                }
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color + this.alpha + ')';
            if (this.size > 1.6) {
                ctx.shadowBlur = 6;
                ctx.shadowColor = this.color + '0.6)';
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    let particles = [];
    function initParticles() {
        particles = [];
        const count = Math.floor((width * height) / 11000);
        const particleCount = Math.min(110, Math.max(35, count));
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function connect() {
        const maxDist = 100;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxDist) {
                    const lineAlpha = (1 - dist / maxDist) * 0.12;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(59, 130, 246, ${lineAlpha})`;
                    ctx.lineWidth = 0.6;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }

            if (mouse.x !== null && mouse.y !== null) {
                const dx = particles[i].x - mouse.x;
                const dy = particles[i].y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < mouse.radius) {
                    const mouseLineAlpha = (1 - dist / mouse.radius) * 0.25;
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(56, 189, 248, ${mouseLineAlpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(mouse.x, mouse.y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        for (let p of particles) {
            p.update();
            p.draw();
        }
        connect();

        requestAnimationFrame(animate);
    }

    initParticles();
    animate();
})();
