// assets/js/graph.js - Show link text in tooltips

if (typeof window.GraphWithLinkTexts === 'undefined') {
    window.GraphWithLinkTexts = class {
    constructor(config) {
        this.config = config;
        this.canvas = document.getElementById('graph-canvas');
        
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.data = null;
        this.nodes = [];
        this.links = [];
        
        // Physics
        this.repulsion = 150;
        this.linkDistance = 120;
        
        // View state
        this.scale = 1;
        this.translation = { x: 0, y: 0 };
        
        // Interaction
        this.dragging = false;
        this.draggedNode = null;
        this.hoveredNode = null;
        
        // Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'graph-tooltip';
        document.body.appendChild(this.tooltip);
        
        // Colors will be read from CSS custom properties so themes / SCSS control colors
        this.colorCurrent = '#059669';
        this.colorNode = '#10B981';
        this.linkColor = 'rgba(37,99,235,0.12)';
        this.linkHoverColor = 'rgba(37,99,235,0.9)';
        this.nodeBorderColor = '#ffffff';

        this.init();
    }
    
    async init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        // load colors from CSS variables (allows prefers-color-scheme and user theme)
        this.loadColors();

        // Observe theme toggles (body class changes) and media query changes
        try {
            if (document && document.body) {
                this._themeObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        if (m.attributeName === 'class') {
                            // Force small delay to ensure CSS is applied
                            setTimeout(() => {
                                this.loadColors();
                            }, 50);
                        }
                    }
                });
                this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            }
        } catch (e) {
            // ignore
        }

        this.setupEvents();
        await this.loadData();
        this.setupResetButton();
        this.animate();
    }

    loadColors() {
        try {
            const isDark = document.body.classList.contains('darkmode');
            const root = document.documentElement;
            
            if (isDark) {
                // Dark mode colors
                root.style.setProperty('--graph-current', '#1f6b4f');
                root.style.setProperty('--graph-node', '#276f56');
                root.style.setProperty('--graph-link', 'rgba(96, 165, 250, 0.32)');
                root.style.setProperty('--graph-link-hover', 'rgba(37, 99, 235, 0.75)');
                root.style.setProperty('--graph-tooltip-bg', '#0b1220');
                root.style.setProperty('--graph-tooltip-text', '#e6f0ff');
                root.style.setProperty('--graph-node-border', 'rgba(255, 255, 255, 0.25)');
            } else {
                // Light mode colors (lighter greens)
                root.style.setProperty('--graph-current', '#5a8370');
                root.style.setProperty('--graph-node', '#6f9080');
                root.style.setProperty('--graph-link', 'rgba(37, 99, 235, 0.28)');
                root.style.setProperty('--graph-link-hover', 'rgba(37, 99, 235, 0.55)');
                root.style.setProperty('--graph-tooltip-bg', '#ffffff');
                root.style.setProperty('--graph-tooltip-text', '#0f172a');
                root.style.setProperty('--graph-node-border', 'rgba(0, 0, 0, 0.25)');
            }
            
            // Read the values back to confirm
            const s = getComputedStyle(root);
            this.colorCurrent = s.getPropertyValue('--graph-current').trim();
            this.colorNode = s.getPropertyValue('--graph-node').trim();
            this.linkColor = s.getPropertyValue('--graph-link').trim();
            this.linkHoverColor = s.getPropertyValue('--graph-link-hover').trim();
            this.nodeBorderColor = s.getPropertyValue('--graph-node-border').trim();
        } catch (e) {
            // ignore and keep defaults
        }
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.translation = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
    }
    
    setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        // this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('mouseleave', () => this.hideTooltip());
        
        this.canvas.addEventListener('click', (e) => this.onClick(e));
    }
    
    setupResetButton() {
        const resetBtn = document.getElementById('graph-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetView());
        }
    }
    
    async loadData() {
        try {
            const response = await fetch(this.config.dataUrl);
            this.data = await response.json();
            this.buildGraph();
        } catch (error) {
            console.error('Failed to load graph data:', error);
        }
    }
    
    buildGraph() {
        if (!this.data || !this.data.links) return;
        
        const currentPage = this.config.currentNote;
        this.nodes = [];
        this.links = [];
        const nodeMap = new Map();
        
        // Helper to get a readable name from URL
        const getNameFromUrl = (url) => {
            if (!url) return 'Untitled';
            const segments = url.split('/').filter(s => s);
            const lastSegment = segments.pop() || 'page';
            return lastSegment
                .replace(/[-_]/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        };
        
        // Add current node - use current page title for tooltip
        const currentNode = {
            id: currentPage,
            url: currentPage,
            tooltipText: this.config.currentTitle || getNameFromUrl(currentPage),
            type: 'current',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 14,
            color: this.colorCurrent,
            hoverColor: this.colorCurrent
        };
        this.nodes.push(currentNode);
        nodeMap.set(currentPage, currentNode);
        
        // Find OUTGOING links: pages that current page links TO
        const outgoingLinks = new Map();
        
        Object.entries(this.data.links).forEach(([pageUrl, backlinks]) => {
            if (pageUrl === currentPage) return;
            
            backlinks.forEach(backlink => {
                const backlinkUrl = backlink.url.replace(/\/$/, '');
                const currentPageNormalized = currentPage.replace(/\/$/, '');
                
                if (backlinkUrl === currentPageNormalized) {
                    // Current page links TO this page
                    const targetUrl = pageUrl;
                    const linkText = backlink.text || getNameFromUrl(targetUrl);
                    
                    outgoingLinks.set(targetUrl, {
                        url: targetUrl,
                        linkText: linkText
                    });
                    
                    if (!nodeMap.has(targetUrl)) {
                        const node = {
                            id: targetUrl,
                            url: targetUrl,
                            tooltipText: linkText, // Show the link text in tooltip
                            type: 'outgoing',
                            x: (Math.random() - 0.5) * 200,
                            y: (Math.random() - 0.5) * 200,
                            vx: 0,
                            vy: 0,
                            radius: 10,
                            color: this.colorNode,
                            hoverColor: this.colorNode,
                            originalLinkText: backlink.text || ''
                        };
                        this.nodes.push(node);
                        nodeMap.set(targetUrl, node);
                    }
                    
                    this.links.push({
                        source: currentNode,
                        target: nodeMap.get(targetUrl),
                        type: 'outgoing',
                        text: backlink.text || ''
                    });
                }
            });
        });
        
        // Find INCOMING links: pages that link TO current page
        const incomingLinks = this.data.links[currentPage] || [];
        
        incomingLinks.forEach((backlink, index) => {
            const sourceUrl = backlink.url;
            const linkText = backlink.text || getNameFromUrl(sourceUrl);
            
            if (!nodeMap.has(sourceUrl)) {
                const node = {
                    id: sourceUrl,
                    url: sourceUrl,
                    tooltipText: linkText, // Show the link text in tooltip
                    type: 'incoming',
                    x: (Math.random() - 0.5) * 200,
                    y: (Math.random() - 0.5) * 200,
                    vx: 0,
                    vy: 0,
                    radius: 10,
                    color: this.colorNode,
                    hoverColor: this.colorNode,
                    originalLinkText: backlink.text || ''
                };
                this.nodes.push(node);
                nodeMap.set(sourceUrl, node);
            }
            
            this.links.push({
                source: nodeMap.get(sourceUrl),
                target: currentNode,
                type: 'incoming',
                text: backlink.text || ''
            });
        });
    }
    
    simulatePhysics() {
        // Apply repulsion
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nodeA = this.nodes[i];
                const nodeB = this.nodes[j];
                
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0 && distance < 100) {
                    const force = this.repulsion / (distance * distance);
                    const fx = force * dx / distance;
                    const fy = force * dy / distance;
                    
                    nodeA.vx -= fx;
                    nodeA.vy -= fy;
                    nodeB.vx += fx;
                    nodeB.vy += fy;
                }
            }
        }
        
        // Apply link forces
        this.links.forEach(link => {
            const dx = link.target.x - link.source.x;
            const dy = link.target.y - link.source.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const force = (distance - this.linkDistance) * 0.01;
                const fx = force * dx / distance;
                const fy = force * dy / distance;
                
                link.source.vx += fx;
                link.source.vy += fy;
                link.target.vx -= fx;
                link.target.vy -= fy;
            }
        });
        
        // Apply center force
        this.nodes.forEach(node => {
            if (node === this.draggedNode) return;
            
            const dx = -node.x;
            const dy = -node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const force = 0.05 * distance * 0.01;
                node.vx += force * dx / distance;
                node.vy += force * dy / distance;
            }
            
            // Update position
            node.x += node.vx;
            node.y += node.vy;
            
            // Apply damping
            node.vx *= 0.9;
            node.vy *= 0.9;
        });
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.translate(this.translation.x, this.translation.y);
        this.ctx.scale(this.scale, this.scale);
        
        // Draw links
        this.links.forEach(link => {
            this.ctx.beginPath();
            this.ctx.moveTo(link.source.x, link.source.y);
            this.ctx.lineTo(link.target.x, link.target.y);
            // Highlight links connected to hovered node
            const isHighlighted = this.hoveredNode && (link.source === this.hoveredNode || link.target === this.hoveredNode);
            this.ctx.strokeStyle = isHighlighted ? this.linkHoverColor : this.linkColor;
            this.ctx.lineWidth = isHighlighted ? 4 : 3;
            this.ctx.stroke();
        });
        
        // Draw nodes
        this.nodes.forEach(node => {
            // Determine color based on hover state
            const color = (node === this.hoveredNode) ? node.hoverColor : node.color;
            
            // Draw node
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
            
            // Draw border using CSS-driven node border color
            this.ctx.strokeStyle = this.nodeBorderColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
        
        this.ctx.restore();
    }
    
    animate() {
        this.simulatePhysics();
        this.render();
        requestAnimationFrame(() => this.animate());
    }
    
    onMouseDown(e) {
        e.preventDefault();
        const pos = this.getCanvasPosition(e);
        
        for (const node of this.nodes) {
            const dx = pos.x - node.x;
            const dy = pos.y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < node.radius) {
                this.dragging = true;
                this.draggedNode = node;
                this.updateCursor();
                return;
            }
        }
        
        this.dragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.translationStart = { ...this.translation };
        this.updateCursor();
    }
    
    onMouseUp() {
        this.dragging = false;
        this.draggedNode = null;
        this.updateCursor();
    }
    
    onClick(e) {
        if (this.draggedNode || this.dragging) return;
        
        const pos = this.getCanvasPosition(e);
        
        for (const node of this.nodes) {
            const dx = pos.x - node.x;
            const dy = pos.y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < node.radius && node.url) {
                if (node.url === this.config.currentNote) return;
                
                window.location.href = node.url;
                return;
            }
        }
    }
    
    // onWheel(e) {
    //     e.preventDefault();
        
    //     const rect = this.canvas.getBoundingClientRect();
    //     const mouseX = e.clientX - rect.left;
    //     const mouseY = e.clientY - rect.top;
        
    //     const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    //     this.scale *= zoomFactor;
    //     this.scale = Math.min(Math.max(0.5, this.scale), 3);
        
    //     this.translation.x -= (mouseX - this.translation.x) * (zoomFactor - 1);
    //     this.translation.y -= (mouseY - this.translation.y) * (zoomFactor - 1);
    // }
    
    getCanvasPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.translation.x) / this.scale;
        const y = (e.clientY - rect.top - this.translation.y) / this.scale;
        return { x, y };
    }
    
    updateCursor() {
        if (this.hoveredNode && this.hoveredNode.url !== this.config.currentNote) {
            this.canvas.style.cursor = 'pointer';
        } else if (this.dragging) {
            this.canvas.style.cursor = 'grabbing';
        } else {
            this.canvas.style.cursor = 'move';
        }
    }
    
    // Replace or add this method to your existing graph.js
    showTooltip(text, x, y) {
        // Get canvas position relative to viewport
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Calculate tooltip position relative to canvas
        // Add small offset from the mouse position
        const offsetX = 15;
        const offsetY = 15;
        
        // Position tooltip relative to canvas
        const tooltipX = x + offsetX;
        const tooltipY = y + offsetY;
        
        // Ensure tooltip stays within viewport bounds
        const maxX = window.innerWidth - this.tooltip.offsetWidth - 10;
        const maxY = window.innerHeight - this.tooltip.offsetHeight - 10;
        
        this.tooltip.textContent = text;
        this.tooltip.style.left = Math.min(tooltipX, maxX) + 'px';
        this.tooltip.style.top = Math.min(tooltipY, maxY) + 'px';
        this.tooltip.style.opacity = '1';
    }

    // Also update the onMouseMove method to pass correct coordinates:
    onMouseMove(e) {
        const pos = this.getCanvasPosition(e);
        
        // Get mouse position in viewport coordinates
        const viewportX = e.clientX;
        const viewportY = e.clientY;
        
        let hovered = null;
        for (const node of this.nodes) {
            const dx = pos.x - node.x;
            const dy = pos.y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < node.radius) {
                hovered = node;
                break;
            }
        }
        
        // Update hover state
        if (hovered !== this.hoveredNode) {
            this.hoveredNode = hovered;
            this.updateCursor();
            
            if (hovered) {
                // Pass viewport coordinates, not canvas coordinates
                this.showTooltip(hovered.tooltipText, viewportX, viewportY);
            } else {
                this.hideTooltip();
            }
        } else if (hovered) {
            // Update tooltip position with viewport coordinates
            this.showTooltip(hovered.tooltipText, viewportX, viewportY);
        }
        
        // ... rest of your onMouseMove method remains the same
    }
    
    hideTooltip() {
        this.tooltip.style.opacity = '0';
    }
    
    resetView() {
        this.scale = 1;
        this.translation = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
        
        // Reset nodes to center
        this.nodes.forEach(node => {
            node.x = (Math.random() - 0.5) * 200;
            node.y = (Math.random() - 0.5) * 200;
            node.vx = 0;
            node.vy = 0;
        });
    }
    };
}

// Initialize graph
if (document.getElementById('graph-canvas')) {
    document.addEventListener('DOMContentLoaded', () => {
        const canvas = document.getElementById('graph-canvas');
        let config = window.graphConfig || {};
        
        // If graphConfig doesn't exist, try to read from data attributes
        if (!window.graphConfig && canvas && canvas.parentElement) {
            const graphSquare = canvas.parentElement;
            config = {
                currentNote: graphSquare.getAttribute('data-current-page') || window.location.pathname,
                currentTitle: document.title,
                dataUrl: graphSquare.getAttribute('data-url') || '/search.json'
            };
        }
        
        if (!config.currentNote) config.currentNote = window.location.pathname;
        if (!config.currentTitle) config.currentTitle = document.title;
        if (!config.dataUrl) config.dataUrl = '/search.json';
        
        window.graph = new GraphWithLinkTexts(config);
    });
}