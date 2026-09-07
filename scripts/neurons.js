/**
 * NEXUS Harness — Neuron Background Effect
 * An interactive, canvas-based particle network simulating a "gentle AI beast."
 * Features:
 * - Ambient drifting state
 * - Pointer interaction (nodes flee cursor)
 * - Click interaction (creates a pulse/ripple wave)
 * - Scroll integration (velocity agitates the network)
 */

class NeuronNetwork {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.pulses = [];
    
    // Configuration
    this.config = {
      particleCount: 120, // Base count, scales with screen area
      particleBaseSize: 1.5,
      linkDistance: 120,
      baseSpeed: 0.2,
      pulseSpeed: 5,
      pulseLife: 40,
      colors: {
        node: 'rgba(52, 211, 153, 0.4)',      // --mint
        nodeActive: 'rgba(103, 232, 249, 0.9)', // --cyan
        linkBase: 'rgba(255, 255, 255, 0.05)',
        linkActive: 'rgba(139, 124, 246, 0.3)'  // --vio
      }
    };

    this.mouse = { x: -1000, y: -1000, radius: 100 };
    this.scrollVelocity = 0;
    this.lastScrollY = window.scrollY;
    
    this.init();
    this.bindEvents();
    this.animate();
  }

  init() {
    this.resize();
    this.particles = [];
    // Scale count based on screen area
    const area = this.canvas.width * this.canvas.height;
    const count = Math.min(Math.floor((area / (1920 * 1080)) * this.config.particleCount), 200);
    
    for (let i = 0; i < (count < 50 ? 50 : count); i++) {
      this.particles.push(this.createParticle());
    }
  }

  createParticle() {
    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * this.config.baseSpeed,
      vy: (Math.random() - 0.5) * this.config.baseSpeed,
      baseSize: Math.random() * this.config.particleBaseSize + 0.5,
      activeTimer: 0
    };
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.init());
    
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    
    window.addEventListener('mouseout', () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

    window.addEventListener('click', (e) => {
      this.pulses.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        life: 0
      });
      // Activate nearby particles
      this.particles.forEach(p => {
        const dx = p.x - e.clientX;
        const dy = p.y - e.clientY;
        if (dx * dx + dy * dy < 25000) {
          p.activeTimer = 60;
        }
      });
    });

    window.addEventListener('scroll', () => {
      const currentScroll = window.scrollY;
      this.scrollVelocity = Math.abs(currentScroll - this.lastScrollY);
      this.lastScrollY = currentScroll;
      
      // Add slight agitation on scroll
      if (this.scrollVelocity > 10) {
        this.particles.forEach(p => {
          if (Math.random() < 0.05) p.activeTimer = 30;
          p.y -= (currentScroll - this.lastScrollY) * 0.1; // slight parallax
        });
      }
    });
  }

  update() {
    // Decay scroll velocity
    this.scrollVelocity *= 0.95;
    const speedMultiplier = 1 + Math.min(this.scrollVelocity * 0.05, 3);

    this.particles.forEach(p => {
      // Mouse interaction (flee)
      const dx = this.mouse.x - p.x;
      const dy = this.mouse.y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.mouse.radius) {
        const forceDirectionX = dx / distance;
        const forceDirectionY = dy / distance;
        const force = (this.mouse.radius - distance) / this.mouse.radius;
        p.vx -= forceDirectionX * force * 0.1;
        p.vy -= forceDirectionY * force * 0.1;
        p.activeTimer = Math.max(p.activeTimer, 10);
      }

      // Apply velocity
      p.x += p.vx * speedMultiplier;
      p.y += p.vy * speedMultiplier;

      // Friction to return to base speed
      p.vx = p.vx * 0.99 + Math.sign(p.vx) * 0.001;
      p.vy = p.vy * 0.99 + Math.sign(p.vy) * 0.001;

      // Wrap around edges gracefully
      if (p.x < -50) p.x = this.canvas.width + 50;
      if (p.x > this.canvas.width + 50) p.x = -50;
      if (p.y < -50) p.y = this.canvas.height + 50;
      if (p.y > this.canvas.height + 50) p.y = -50;

      if (p.activeTimer > 0) p.activeTimer--;
    });

    // Update pulses
    this.pulses.forEach(pulse => {
      pulse.radius += this.config.pulseSpeed;
      pulse.life++;
    });
    this.pulses = this.pulses.filter(p => p.life < this.config.pulseLife);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw links
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.config.linkDistance) {
          const opacity = 1 - (dist / this.config.linkDistance);
          const isActive = p1.activeTimer > 0 || p2.activeTimer > 0;
          
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.strokeStyle = isActive 
            ? `rgba(139, 124, 246, ${opacity * 0.6})` 
            : `rgba(255, 255, 255, ${opacity * 0.15})`;
          this.ctx.lineWidth = isActive ? 1.5 : 0.8;
          this.ctx.stroke();
        }
      }
    }

    // Draw particles
    this.particles.forEach(p => {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.baseSize + (p.activeTimer > 0 ? 1 : 0), 0, Math.PI * 2);
      this.ctx.fillStyle = p.activeTimer > 0 ? this.config.colors.nodeActive : this.config.colors.node;
      this.ctx.fill();
      
      // Glow effect for active particles
      if (p.activeTimer > 0) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.baseSize * 4, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(103, 232, 249, ${p.activeTimer / 120})`;
        this.ctx.fill();
      }
    });

    // Draw pulses
    this.pulses.forEach(pulse => {
      const opacity = 1 - (pulse.life / this.config.pulseLife);
      this.ctx.beginPath();
      this.ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(52, 211, 153, ${opacity * 0.5})`;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });
  }

  animate() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

// Init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new NeuronNetwork('neuronCanvas');
});
