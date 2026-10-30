/**
 * Interactive Treemap Visualizer (FolderSizes Space Map & Tag Analyzer)
 */
class FolderSizesTreemap {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = Object.assign({
      onNodeClick: null,
      onDrillDown: null,
      onOpenWindows: null
    }, options);

    this.currentPath = "E:\\";
    this.currentMode = "folders"; // "folders" or "tags"
    this.colorMode = "category"; // "category", "status", "tag", "type"
    this.data = null;
    this.tagSpaceData = null;
    this.filterTagMode = "all"; // "all", "unique", "mixed", "untagged"
    this.searchQuery = "";
    this.breadcrumbs = ["E:\\"];

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-950 select-none">
        <!-- Treemap Toolbar -->
        <div class="h-12 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between flex-shrink-0">
          
          <!-- Left: Breadcrumbs & Drill-up -->
          <div class="flex items-center space-x-2 min-w-0" id="fs-breadcrumbs">
            <button id="fs-btn-up" class="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition flex items-center space-x-1 text-xs" title="Subir nivel">
              <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
              <span>Subir</span>
            </button>
            <div class="w-px h-4 bg-slate-800"></div>
            <div id="fs-crumbs-list" class="flex items-center space-x-1 overflow-x-auto text-xs text-slate-300 font-mono">
              <!-- Dynamically rendered -->
            </div>
          </div>

          <!-- Right: Mode & Color Controls -->
          <div class="flex items-center space-x-3">
            <!-- Mode switch: Folders vs Tags -->
            <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button id="fs-mode-folders" class="px-2.5 py-1 rounded-lg font-semibold bg-indigo-600 text-white transition">
                🗂️ Carpetas y Archivos
              </button>
              <button id="fs-mode-tags" class="px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition">
                🏷️ Distribución por Etiquetas
              </button>
            </div>

            <!-- Tag Partition Filter (Visible in tag mode) -->
            <select id="fs-tag-filter" class="hidden bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none">
              <option value="all">Todas las Etiquetas</option>
              <option value="unique">Etiquetas Únicas (1 sola)</option>
              <option value="mixed">Etiquetas Mixtas (2 o más)</option>
              <option value="untagged">Sin Etiquetar</option>
            </select>

            <!-- Color Palette select -->
            <div class="flex items-center space-x-1 text-xs text-slate-400">
              <span>Color:</span>
              <select id="fs-color-select" class="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none">
                <option value="category">Por Categoría</option>
                <option value="status">Por Estado</option>
                <option value="tag">Por Etiqueta</option>
              </select>
            </div>

            <!-- Treemap Search -->
            <div class="relative">
              <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400"></i>
              <input type="text" id="fs-search-input" placeholder="Filtrar bloques..." 
                     class="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-40">
            </div>
          </div>
        </div>

        <!-- Treemap Canvas & Stats Area -->
        <div class="flex-1 relative overflow-hidden p-3" id="fs-canvas-wrapper">
          <div id="fs-canvas-container" class="w-full h-full relative rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900/40">
            <!-- Treemap rectangular tiles injected here -->
          </div>

          <!-- Floating Info Card Tooltip -->
          <div id="fs-tooltip" class="hidden absolute z-50 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs max-w-sm transition-opacity duration-150">
            <!-- Tooltip dynamic content -->
          </div>
        </div>

        <!-- Treemap Footer Legend & Stats -->
        <div class="h-9 border-t border-slate-800/80 bg-slate-900/40 px-4 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
          <div id="fs-footer-stats" class="flex items-center space-x-4 font-mono">
            <span>Cargando Folder Sizes...</span>
          </div>
          <div id="fs-footer-legend" class="flex items-center space-x-2">
            <!-- Render dynamic color legend -->
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    if (window.lucide) lucide.createIcons();
  }

  attachEvents() {
    const btnFolders = document.getElementById('fs-mode-folders');
    const btnTags = document.getElementById('fs-mode-tags');
    const tagFilter = document.getElementById('fs-tag-filter');
    const colorSelect = document.getElementById('fs-color-select');
    const searchInput = document.getElementById('fs-search-input');
    const btnUp = document.getElementById('fs-btn-up');

    btnFolders.onclick = () => {
      this.currentMode = "folders";
      btnFolders.classList.add('bg-indigo-600', 'text-white');
      btnFolders.classList.remove('text-slate-400');
      btnTags.classList.remove('bg-indigo-600', 'text-white');
      btnTags.classList.add('text-slate-400');
      tagFilter.classList.add('hidden');
      this.loadTreemap(this.currentPath);
    };

    btnTags.onclick = () => {
      this.currentMode = "tags";
      btnTags.classList.add('bg-indigo-600', 'text-white');
      btnTags.classList.remove('text-slate-400');
      btnFolders.classList.remove('bg-indigo-600', 'text-white');
      btnFolders.classList.add('text-slate-400');
      tagFilter.classList.remove('hidden');
      this.loadTagSpace();
    };

    tagFilter.onchange = (e) => {
      this.filterTagMode = e.target.value;
      this.render();
    };

    colorSelect.onchange = (e) => {
      this.colorMode = e.target.value;
      this.render();
    };

    searchInput.oninput = (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.render();
    };

    btnUp.onclick = () => {
      if (this.currentPath === "E:\\" || this.currentPath === "E:") return;
      const parts = this.currentPath.replace(/\\$/, '').split('\\');
      parts.pop();
      const parent = parts.length === 1 ? parts[0] + "\\" : parts.join('\\');
      this.loadTreemap(parent);
    };

    window.addEventListener('resize', () => {
      if (this.data || this.tagSpaceData) {
        this.render();
      }
    });
  }

  async loadTreemap(path = "E:\\") {
    this.currentPath = path;
    this.updateBreadcrumbs();
    const container = document.getElementById('fs-canvas-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const w = Math.max(rect.width || 1200, 400);
    const h = Math.max(rect.height || 700, 300);

    try {
      const res = await fetch(`/api/foldersizes/treemap?path=${encodeURIComponent(path)}&canvas_w=${w}&canvas_h=${h}`);
      this.data = await res.json();
      this.render();
    } catch (e) {
      console.error("Error loading treemap", e);
    }
  }

  async loadTagSpace() {
    try {
      const res = await fetch('/api/foldersizes/tag-space');
      this.tagSpaceData = await res.json();
      this.render();
    } catch (e) {
      console.error("Error loading tag space", e);
    }
  }

  updateBreadcrumbs() {
    const crumbsContainer = document.getElementById('fs-crumbs-list');
    if (!crumbsContainer) return;

    const parts = this.currentPath.replace(/\\$/, '').split('\\');
    let accumulated = '';
    const crumbs = parts.map((part, idx) => {
      accumulated = idx === 0 ? part + '\\' : accumulated + '\\' + part;
      return { name: part || 'E:', path: accumulated };
    });

    crumbsContainer.innerHTML = crumbs.map((c, idx) => `
      <div class="flex items-center space-x-1">
        ${idx > 0 ? '<span class="text-slate-600">/</span>' : ''}
        <button onclick="window.folderSizesInstance.loadTreemap('${c.path.replace(/\\/g, '\\\\')}')" 
                class="hover:text-indigo-400 transition truncate max-w-[150px] ${idx === crumbs.length - 1 ? 'text-indigo-300 font-bold' : ''}">
          ${c.name}
        </button>
      </div>
    `).join('');
  }

  render() {
    const container = document.getElementById('fs-canvas-container');
    const footerStats = document.getElementById('fs-footer-stats');
    if (!container) return;

    container.innerHTML = '';

    if (this.currentMode === 'folders') {
      this.renderFolderTreemap(container);
    } else {
      this.renderTagTreemap(container);
    }
  }

  renderFolderTreemap(container) {
    if (!this.data || !this.data.nodes || this.data.nodes.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-500">
          <i data-lucide="folder-open" class="w-12 h-12 mb-2 stroke-[1.5]"></i>
          <p class="text-sm">No se encontraron subcarpetas ni archivos para fragmentar.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const totalBytes = this.data.total_bytes || 1;
    let filteredNodes = this.data.nodes;

    if (this.searchQuery) {
      filteredNodes = filteredNodes.filter(n => n.name.toLowerCase().includes(this.searchQuery));
    }

    // Render stats
    const footerStats = document.getElementById('fs-footer-stats');
    if (footerStats) {
      footerStats.innerHTML = `
        <span>📦 ${this.data.total_items} bloques</span>
        <span>•</span>
        <span>💾 Total: ${formatBytes(totalBytes)}</span>
        <span>•</span>
        <span class="text-indigo-400">Ruta: ${this.currentPath}</span>
      `;
    }

    // Colors mapping
    const catColors = {
      'Arquitectura & 3D (Work)': '#0ea5e9',
      'Software & Instaladores': '#8b5cf6',
      'Respaldos Celular': '#10b981',
      'Fotografía & Álbumes': '#ec4899',
      'Respaldos de Equipos / Personas': '#f59e0b',
      'Descargas Masivas': '#64748b',
      'Videos & Ejercicio': '#ef4444',
      'Cursos, Ebooks & Salud': '#14b8a6',
      'Sin Categoría': '#334155'
    };

    filteredNodes.forEach(node => {
      const r = node.rect;
      if (!r || r.w <= 4 || r.h <= 4) return;

      let bgColor = '#334155';
      if (this.colorMode === 'category') {
        bgColor = catColors[node.category] || '#475569';
      } else if (this.colorMode === 'status') {
        if (node.status === 'Duplicado / Posible Basura') bgColor = '#ef4444';
        else if (node.status === 'Organizado') bgColor = '#10b981';
        else if (node.status === 'Archivado') bgColor = '#6b7280';
        else bgColor = '#f59e0b';
      } else if (this.colorMode === 'tag' && node.tags && node.tags.length > 0) {
        bgColor = node.tags[0].color || '#6366f1';
      }

      const pct = ((node.value / totalBytes) * 100).toFixed(1);
      const isFile = node.type === 'file';

      const tile = document.createElement('div');
      tile.className = 'absolute rounded border border-black/40 hover:border-white transition-all duration-150 cursor-pointer overflow-hidden p-1.5 flex flex-col justify-between group';
      tile.style.left = `${r.x}px`;
      tile.style.top = `${r.y}px`;
      tile.style.width = `${r.w}px`;
      tile.style.height = `${r.h}px`;
      tile.style.backgroundColor = bgColor;
      tile.style.opacity = '0.92';

      // Title & labels only if rectangle is big enough
      const showTitle = (r.w >= 60 && r.h >= 32);
      const showDetails = (r.w >= 100 && r.h >= 54);

      tile.innerHTML = `
        ${showTitle ? `
          <div class="min-w-0 pointer-events-none">
            <h4 class="text-[11px] font-bold text-white truncate drop-shadow-md">${node.name}</h4>
            <span class="text-[10px] text-white/80 font-mono drop-shadow-sm">${formatBytes(node.value)} (${pct}%)</span>
          </div>
        ` : ''}

        ${showDetails ? `
          <div class="flex items-center justify-between text-[9px] text-white/90 font-medium drop-shadow-sm pointer-events-none">
            <span>${isFile ? '📄 Archivo' : '📁 ' + (node.subfolder_count || 0) + ' subs'}</span>
            ${node.tag_count > 0 ? `<span class="bg-black/30 px-1 py-0.5 rounded text-[8px] font-bold">🏷️ ${node.tag_count}</span>` : ''}
          </div>
        ` : ''}
      `;

      // Hover Tooltip
      tile.onmouseenter = (e) => this.showTooltip(e, node, pct);
      tile.onmousemove = (e) => this.moveTooltip(e);
      tile.onmouseleave = () => this.hideTooltip();

      // Click to drill down or open
      tile.onclick = (e) => {
        if (!isFile) {
          this.loadTreemap(node.path);
        } else {
          previewMedia(node.path, node.extension);
        }
      };

      container.appendChild(tile);
    });
  }

  renderTagTreemap(container) {
    if (!this.tagSpaceData) return;

    const data = this.tagSpaceData;
    let nodes = data.tag_treemap || [];

    // Filter by unique / mixed if needed
    if (this.filterTagMode === 'unique') {
      nodes = nodes.filter(n => n.folder_count + n.file_count > 0);
    }

    const footerStats = document.getElementById('fs-footer-stats');
    if (footerStats) {
      footerStats.innerHTML = `
        <span>🏷️ ${nodes.length} Grupos de Etiquetas</span>
        <span>•</span>
        <span class="text-indigo-400">Elementos Únicos: ${data.unique_tags_items_count}</span>
        <span>•</span>
        <span class="text-pink-400">Elementos Mixtos: ${data.mixed_tags_items_count}</span>
        <span>•</span>
        <span class="text-amber-400">Sin Etiquetar: ${data.untagged.folders.count} folders</span>
      `;
    }

    const totalVal = nodes.reduce((sum, n) => sum + (n.value || 0), 0) || 1;

    nodes.forEach(node => {
      const r = node.rect;
      if (!r || r.w <= 4 || r.h <= 4) return;

      const pct = ((node.value / totalVal) * 100).toFixed(1);
      const tile = document.createElement('div');
      tile.className = 'absolute rounded border border-black/40 hover:border-white transition-all duration-150 cursor-pointer overflow-hidden p-2 flex flex-col justify-between';
      tile.style.left = `${r.x}px`;
      tile.style.top = `${r.y}px`;
      tile.style.width = `${r.w}px`;
      tile.style.height = `${r.h}px`;
      tile.style.backgroundColor = node.color || '#6366f1';
      tile.style.opacity = '0.9';

      const showTitle = (r.w >= 70 && r.h >= 36);
      tile.innerHTML = `
        ${showTitle ? `
          <div>
            <h4 class="text-xs font-bold text-white truncate drop-shadow-md">🏷️ ${node.name}</h4>
            <span class="text-[10px] text-white/90 font-mono">${formatBytes(node.value)} (${pct}%)</span>
          </div>
          <div class="text-[10px] text-white/80 font-medium drop-shadow-sm">
            <span>📁 ${node.folder_count} folders • 📄 ${node.file_count} arch</span>
          </div>
        ` : ''}
      `;

      tile.onmouseenter = (e) => {
        const tooltip = document.getElementById('fs-tooltip');
        if (!tooltip) return;
        tooltip.innerHTML = `
          <div class="flex items-center space-x-2 mb-1.5">
            <span class="w-3 h-3 rounded-full" style="background-color: ${node.color}"></span>
            <h4 class="font-bold text-sm text-white">${node.name}</h4>
          </div>
          <div class="space-y-1 text-slate-300 font-mono text-[11px]">
            <div>Espacio Ocupado: <span class="text-white font-bold">${formatBytes(node.value)}</span> (${pct}%)</div>
            <div>Carpetas con esta etiqueta: <span class="text-white font-bold">${node.folder_count}</span></div>
            <div>Archivos con esta etiqueta: <span class="text-white font-bold">${node.file_count}</span></div>
            <div>Tipo de etiqueta: <span class="text-indigo-400 font-bold">${node.tag_type}</span></div>
          </div>
        `;
        tooltip.classList.remove('hidden');
      };
      tile.onmousemove = (e) => this.moveTooltip(e);
      tile.onmouseleave = () => this.hideTooltip();

      tile.onclick = () => {
        // Filter main explorer by this tag
        setView('grid');
        filterByTag(node.tag_id);
      };

      container.appendChild(tile);
    });
  }

  showTooltip(e, node, pct) {
    const tooltip = document.getElementById('fs-tooltip');
    if (!tooltip) return;

    const tagsHtml = (node.tags && node.tags.length > 0)
      ? node.tags.map(t => `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold" style="background-color:${t.color}20; color:${t.color}; border:1px solid ${t.color}40">${t.name}</span>`).join(' ')
      : '<span class="text-slate-500 italic">Sin etiquetas</span>';

    tooltip.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div class="min-w-0 pr-2">
          <h4 class="font-bold text-sm text-white truncate">${node.name}</h4>
          <span class="text-[10px] text-slate-400 font-mono block truncate">${node.path}</span>
        </div>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-indigo-300 font-mono">${pct}%</span>
      </div>

      <div class="grid grid-cols-2 gap-2 text-[11px] font-mono border-t border-slate-800 pt-2 mb-2">
        <div>Tamaño: <span class="text-white font-bold">${formatBytes(node.value)}</span></div>
        <div>Tipo: <span class="text-white font-bold">${node.type === 'file' ? 'Archivo' : 'Carpeta'}</span></div>
        <div>Categoría: <span class="text-sky-300 font-bold">${node.category}</span></div>
        <div>Estado: <span class="text-amber-300 font-bold">${node.status}</span></div>
      </div>

      <div class="border-t border-slate-800 pt-2">
        <div class="text-[10px] text-slate-400 mb-1">Etiquetas:</div>
        <div class="flex flex-wrap gap-1">${tagsHtml}</div>
      </div>

      <div class="mt-2 text-[10px] text-slate-400 italic">
        ${node.type === 'folder' ? '💡 Clic para hacer zoom / fragmentar contenido' : '💡 Clic para previsualizar'}
      </div>
    `;

    tooltip.classList.remove('hidden');
    this.moveTooltip(e);
  }

  moveTooltip(e) {
    const tooltip = document.getElementById('fs-tooltip');
    if (!tooltip) return;
    const offset = 15;
    const x = Math.min(e.clientX + offset, window.innerWidth - 340);
    const y = Math.min(e.clientY + offset, window.innerHeight - 200);
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  hideTooltip() {
    const tooltip = document.getElementById('fs-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
  }
}

window.FolderSizesTreemap = FolderSizesTreemap;
