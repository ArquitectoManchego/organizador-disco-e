/**
 * Interactive Organigram Visualizer for E:\ folders
 */
class FolderOrganigram {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = Object.assign({
      onNodeClick: null,
      onExploreFolder: null,
      onOpenWindows: null
    }, options);

    this.nodes = [];
    this.treeData = null;
    this.collapsedNodes = new Set();
    this.zoom = 1;
    this.panX = 60;
    this.panY = 120;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.searchQuery = '';

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="relative w-full h-full overflow-hidden bg-slate-950 select-none">
        <!-- Floating Toolbar -->
        <div class="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-xl p-1.5 shadow-2xl">
          <button id="org-zoom-in" class="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition" title="Acercar (Zoom +)">
            <i data-lucide="zoom-in" class="w-4 h-4"></i>
          </button>
          <button id="org-zoom-out" class="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition" title="Alejar (Zoom -)">
            <i data-lucide="zoom-out" class="w-4 h-4"></i>
          </button>
          <button id="org-zoom-reset" class="px-2.5 py-1 text-xs font-medium hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition" title="Restablecer">
            100%
          </button>
          <div class="w-px h-5 bg-slate-700"></div>
          <button id="org-expand-all" class="px-2.5 py-1 text-xs font-medium hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition" title="Desplegar todas las ramas">
            Desplegar Todo
          </button>
          <button id="org-collapse-l2" class="px-2.5 py-1 text-xs font-medium hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition" title="Plegar a nivel 1">
            Solo Nivel 1
          </button>
          <div class="w-px h-5 bg-slate-700"></div>
          <!-- Node Search inside Organigram -->
          <div class="relative flex items-center">
            <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400"></i>
            <input type="text" id="org-search-input" placeholder="Buscar en organigrama..." 
                   class="bg-slate-950/70 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48">
          </div>
        </div>

        <!-- Help hint -->
        <div class="absolute bottom-4 left-4 z-20 text-xs text-slate-500 pointer-events-none bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
          Arrastra para mover el lienzo • Rueda del mouse para Zoom • Clic en nodo para opciones
        </div>

        <!-- SVG Canvas -->
        <svg id="org-svg-canvas" class="w-full h-full cursor-grab active:cursor-grabbing">
          <defs>
            <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.6"/>
            </linearGradient>
            <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.6"/>
            </filter>
          </defs>
          <g id="org-viewport">
            <g id="org-links-layer"></g>
            <g id="org-nodes-layer"></g>
          </g>
        </svg>
      </div>
    `;

    this.svg = document.getElementById('org-svg-canvas');
    this.viewport = document.getElementById('org-viewport');
    this.linksLayer = document.getElementById('org-links-layer');
    this.nodesLayer = document.getElementById('org-nodes-layer');

    this.attachEvents();
    if (window.lucide) lucide.createIcons();
  }

  attachEvents() {
    // Zoom buttons
    document.getElementById('org-zoom-in').onclick = () => this.setZoom(this.zoom * 1.2);
    document.getElementById('org-zoom-out').onclick = () => this.setZoom(this.zoom / 1.2);
    document.getElementById('org-zoom-reset').onclick = () => {
      this.zoom = 1;
      this.panX = 60;
      this.panY = 120;
      this.updateTransform();
    };

    document.getElementById('org-expand-all').onclick = () => {
      this.collapsedNodes.clear();
      this.render();
    };

    document.getElementById('org-collapse-l2').onclick = () => {
      this.collapsedNodes.clear();
      // Collapse everything that is child of level 1
      if (this.treeData && this.treeData.children) {
        this.treeData.children.forEach(c => {
          if (c.children && c.children.length > 0) {
            this.collapsedNodes.add(c.path);
          }
        });
      }
      this.render();
    };

    const searchInput = document.getElementById('org-search-input');
    searchInput.oninput = (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.render();
    };

    // Pan & Drag
    this.svg.onmousedown = (e) => {
      if (e.target.closest('.interactive-node-btn')) return;
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    };

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Wheel zoom
    this.svg.onwheel = (e) => {
      e.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.min(Math.max(0.2, this.zoom * delta), 2.5);

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.updateTransform();
    };
  }

  setZoom(val) {
    this.zoom = Math.min(Math.max(0.2, val), 2.5);
    this.updateTransform();
  }

  updateTransform() {
    this.viewport.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
  }

  setData(nodes) {
    this.nodes = nodes;
    this.treeData = this.buildHierarchy(nodes);
    // By default, collapse nodes at level >= 2 so the tree is clean and readable
    this.nodes.forEach(n => {
      if (n.depth >= 2 && n.subfolder_count > 0) {
        this.collapsedNodes.add(n.path);
      }
    });
    this.render();
  }

  buildHierarchy(nodes) {
    const nodeMap = new Map();
    nodes.forEach(n => nodeMap.set(n.path, { ...n, children: [] }));

    let root = null;
    nodes.forEach(n => {
      const item = nodeMap.get(n.path);
      if (n.path === 'E:\\' || n.depth === 0) {
        root = item;
      } else {
        const parent = nodeMap.get(n.parent_path);
        if (parent) {
          parent.children.push(item);
        } else if (root) {
          root.children.push(item);
        }
      }
    });

    return root || { path: 'E:\\', name: 'Disco Externo (E:)', depth: 0, children: [] };
  }

  render() {
    if (!this.treeData) return;

    this.linksLayer.innerHTML = '';
    this.nodesLayer.innerHTML = '';

    // Calculate layout coordinates
    // We use a horizontal tree layout: root at left, expanding rightwards
    // Level X position = depth * 320
    const nodeWidth = 240;
    const nodeHeight = 84;
    const verticalGap = 24;
    const horizontalGap = 80;

    let currentY = 40;

    const layout = (node, depth) => {
      node.x = depth * (nodeWidth + horizontalGap);
      const isCollapsed = this.collapsedNodes.has(node.path);
      const hasVisibleChildren = node.children && node.children.length > 0 && !isCollapsed;

      if (!hasVisibleChildren) {
        node.y = currentY;
        currentY += nodeHeight + verticalGap;
      } else {
        const childYs = [];
        node.children.forEach(child => {
          layout(child, depth + 1);
          childYs.push(child.y);
        });
        // Center parent relative to its children
        node.y = (childYs[0] + childYs[childYs.length - 1]) / 2;
      }
    };

    layout(this.treeData, 0);

    // Draw links & nodes
    const draw = (node) => {
      const isCollapsed = this.collapsedNodes.has(node.path);
      const hasChildren = node.children && node.children.length > 0;
      const isMatched = this.searchQuery && node.name.toLowerCase().includes(this.searchQuery);

      if (hasChildren && !isCollapsed) {
        node.children.forEach(child => {
          // Draw smooth cubic curve link from (node.x + nodeWidth, node.y + nodeHeight/2) to (child.x, child.y + nodeHeight/2)
          const x0 = node.x + nodeWidth;
          const y0 = node.y + nodeHeight / 2;
          const x1 = child.x;
          const y1 = child.y + nodeHeight / 2;
          const cx = (x0 + x1) / 2;

          const pathElem = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pathElem.setAttribute('d', `M ${x0} ${y0} C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`);
          pathElem.setAttribute('class', `tree-link ${isMatched ? 'highlight' : ''}`);
          this.linksLayer.appendChild(pathElem);

          draw(child);
        });
      }

      this.renderNodeCard(node, nodeWidth, nodeHeight, isCollapsed, hasChildren, isMatched);
    };

    draw(this.treeData);
    this.updateTransform();
    if (window.lucide) lucide.createIcons();
  }

  renderNodeCard(node, width, height, isCollapsed, hasChildren, isMatched) {
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', node.x);
    fo.setAttribute('y', node.y);
    fo.setAttribute('width', width);
    fo.setAttribute('height', height + 30); // allow small badge overflow

    const catColors = {
      'Arquitectura & 3D (Work)': '#0ea5e9',
      'Software & Instaladores': '#8b5cf6',
      'Respaldos Celular': '#10b981',
      'Fotografía & Álbumes': '#ec4899',
      'Respaldos de Equipos / Personas': '#f59e0b',
      'Descargas Masivas': '#64748b',
      'Videos & Ejercicio': '#ef4444',
      'Cursos, Ebooks & Salud': '#14b8a6',
      'Raíz': '#6366f1'
    };
    const accentColor = catColors[node.category] || '#6366f1';

    const isDuplicate = (node.status === 'Duplicado / Posible Basura');
    const isOrganized = (node.status === 'Organizado');

    let statusPill = '';
    if (isDuplicate) {
      statusPill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">⚠️ Duplicado</span>`;
    } else if (isOrganized) {
      statusPill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓ Organizado</span>`;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `relative p-2.5 rounded-xl border transition-all duration-200 select-none group ${
      isMatched 
        ? 'bg-indigo-950/90 border-indigo-500 ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/30' 
        : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-700/70 hover:border-slate-500 shadow-md'
    }`;
    wrapper.style.borderLeft = `4px solid ${accentColor}`;

    wrapper.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-2 min-w-0 pr-1">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style="background-color: ${accentColor}25; color: ${accentColor}">
            <i data-lucide="${node.depth === 0 ? 'hard-drive' : 'folder'}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-slate-100 truncate" title="${node.name}">${node.name}</h4>
            <span class="text-[10px] text-slate-400 block truncate">${node.category || 'General'}</span>
          </div>
        </div>
        
        <!-- Toggle button if has subfolders -->
        ${hasChildren ? `
          <button class="interactive-node-btn toggle-btn w-5 h-5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition flex-shrink-0" title="${isCollapsed ? 'Desplegar subcarpetas' : 'Plegar'}">
            ${isCollapsed ? '+' : '−'}
          </button>
        ` : ''}
      </div>

      <!-- Stats footer -->
      <div class="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
        <div class="flex items-center space-x-1.5">
          <span>📁 ${node.subfolder_count || (node.children ? node.children.length : 0)} subs</span>
          <span>•</span>
          <span>📄 ${node.file_count || 0} arch</span>
        </div>
        <div>
          ${statusPill}
        </div>
      </div>

      <!-- Quick Action Floating Overlay on Hover -->
      <div class="absolute inset-x-0 -bottom-7 hidden group-hover:flex items-center justify-center space-x-1 z-30">
        <button class="interactive-node-btn btn-explore px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold shadow-lg transition flex items-center space-x-1">
          <span>Explorar</span>
        </button>
        <button class="interactive-node-btn btn-open px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-semibold shadow-lg transition">
          <span>Windows</span>
        </button>
      </div>
    `;

    // Bind clicks
    const toggleBtn = wrapper.querySelector('.toggle-btn');
    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        if (this.collapsedNodes.has(node.path)) {
          this.collapsedNodes.delete(node.path);
        } else {
          this.collapsedNodes.add(node.path);
        }
        this.render();
      };
    }

    const btnExplore = wrapper.querySelector('.btn-explore');
    if (btnExplore) {
      btnExplore.onclick = (e) => {
        e.stopPropagation();
        if (this.options.onExploreFolder) {
          this.options.onExploreFolder(node.path);
        }
      };
    }

    const btnOpen = wrapper.querySelector('.btn-open');
    if (btnOpen) {
      btnOpen.onclick = (e) => {
        e.stopPropagation();
        if (this.options.onOpenWindows) {
          this.options.onOpenWindows(node.path);
        }
      };
    }

    wrapper.onclick = () => {
      if (this.options.onNodeClick) {
        this.options.onNodeClick(node);
      }
    };

    fo.appendChild(wrapper);
    this.nodesLayer.appendChild(fo);
  }
}

window.FolderOrganigram = FolderOrganigram;
