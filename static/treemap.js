/**
 * Interactive Treemap Visualizer & Deep File Analyzer
 * Full FolderSizes equivalent with Files, Folders, Top Files, File Types & Remote Scanning
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
    this.currentMode = "both"; // "both", "folders", "files", "tags", "reports"
    this.colorMode = "category"; // "category", "status", "tag", "size"
    this.data = null;
    this.filesAnalysisData = null;
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
        <div class="h-14 border-b border-slate-800 bg-slate-900/80 px-4 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
          
          <!-- Left: Breadcrumbs & Navigation -->
          <div class="flex items-center space-x-2 min-w-0" id="fs-breadcrumbs">
            <button id="fs-btn-up" class="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition flex items-center space-x-1 text-xs" title="Subir nivel">
              <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Subir</span>
            </button>
            <div class="w-px h-4 bg-slate-800"></div>
            <div id="fs-crumbs-list" class="flex items-center space-x-1 overflow-x-auto text-xs text-slate-300 font-mono">
              <!-- Dynamically rendered -->
            </div>
          </div>

          <!-- Center/Right: View Modes & Controls -->
          <div class="flex items-center space-x-2 flex-wrap">
            <!-- Mode switch buttons -->
            <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
              <button id="fs-mode-both" class="px-2.5 py-1 rounded-lg font-semibold bg-indigo-600 text-white transition flex items-center space-x-1">
                <span>🗂️ Carpetas y Archivos</span>
              </button>
              <button id="fs-mode-files" class="px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition flex items-center space-x-1">
                <span>📄 Archivos Más Pesados</span>
              </button>
              <button id="fs-mode-reports" class="px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition flex items-center space-x-1">
                <span>📊 Reportes de Archivos</span>
              </button>
              <button id="fs-mode-tags" class="px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition flex items-center space-x-1">
                <span>🏷️ Etiquetas</span>
              </button>
            </div>

            <!-- Color Palette select (visible in treemap modes) -->
            <div id="fs-color-box" class="flex items-center space-x-1 text-xs text-slate-400">
              <select id="fs-color-select" class="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none">
                <option value="category">Color: Categoría</option>
                <option value="status">Color: Estado</option>
                <option value="tag">Color: Etiqueta</option>
              </select>
            </div>

            <!-- Remote Scan Button -->
            <button onclick="triggerRemoteFileAnalysis()" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition" title="Pedir a la PC que analice archivos en vivo">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              <span class="hidden md:inline">Analizar Archivos en PC</span>
            </button>

            <!-- Search box -->
            <div class="relative">
              <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400"></i>
              <input type="text" id="fs-search-input" placeholder="Filtrar..." 
                     class="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-28 sm:w-36">
            </div>
          </div>
        </div>

        <!-- Treemap Canvas & Reports Area -->
        <div class="flex-1 relative overflow-hidden p-3" id="fs-canvas-wrapper">
          <div id="fs-canvas-container" class="w-full h-full relative rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900/40 overflow-y-auto">
            <!-- Dynamic Tiles or Reports Injected Here -->
          </div>

          <!-- Floating Info Card Tooltip -->
          <div id="fs-tooltip" class="hidden absolute z-50 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs max-w-sm transition-opacity duration-150">
            <!-- Tooltip dynamic content -->
          </div>
        </div>

        <!-- Treemap Footer Legend & Stats -->
        <div class="h-9 border-t border-slate-800/80 bg-slate-900/40 px-4 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
          <div id="fs-footer-stats" class="flex items-center space-x-4 font-mono truncate">
            <span>Cargando Folder Sizes...</span>
          </div>
          <div id="fs-footer-legend" class="hidden sm:flex items-center space-x-2 text-[10px]">
            <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded bg-sky-500"></span><span>3D/Work</span></span>
            <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded bg-violet-500"></span><span>Software</span></span>
            <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded bg-red-500"></span><span>Videos</span></span>
            <span class="flex items-center space-x-1"><span class="w-2.5 h-2.5 rounded bg-pink-500"></span><span>Fotos</span></span>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    if (window.lucide) lucide.createIcons();
  }

  attachEvents() {
    const btnBoth = document.getElementById('fs-mode-both');
    const btnFiles = document.getElementById('fs-mode-files');
    const btnReports = document.getElementById('fs-mode-reports');
    const btnTags = document.getElementById('fs-mode-tags');
    const colorSelect = document.getElementById('fs-color-select');
    const colorBox = document.getElementById('fs-color-box');
    const searchInput = document.getElementById('fs-search-input');
    const btnUp = document.getElementById('fs-btn-up');

    const setModeActive = (activeBtn) => {
      [btnBoth, btnFiles, btnReports, btnTags].forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white');
        b.classList.add('text-slate-400');
      });
      activeBtn.classList.add('bg-indigo-600', 'text-white');
      activeBtn.classList.remove('text-slate-400');
    };

    btnBoth.onclick = () => {
      this.currentMode = "both";
      setModeActive(btnBoth);
      colorBox.classList.remove('hidden');
      this.loadTreemap(this.currentPath, "both");
    };

    btnFiles.onclick = () => {
      this.currentMode = "files";
      setModeActive(btnFiles);
      colorBox.classList.remove('hidden');
      this.loadTreemap(this.currentPath, "files");
    };

    btnReports.onclick = () => {
      this.currentMode = "reports";
      setModeActive(btnReports);
      colorBox.classList.add('hidden');
      this.loadFilesAnalysis();
    };

    btnTags.onclick = () => {
      this.currentMode = "tags";
      setModeActive(btnTags);
      colorBox.classList.add('hidden');
      this.loadTagSpace();
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
      this.loadTreemap(parent, this.currentMode);
    };

    window.addEventListener('resize', () => {
      if (this.currentMode !== 'reports' && this.data) {
        this.render();
      }
    });
  }

  async loadTreemap(path = "E:\\", viewMode = "both") {
    this.currentPath = path;
    this.currentMode = viewMode;
    this.updateBreadcrumbs();
    const container = document.getElementById('fs-canvas-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const w = Math.max(rect.width || 1200, 400);
    const h = Math.max(rect.height || 700, 300);

    try {
      const res = await fetch(`/api/foldersizes/treemap?path=${encodeURIComponent(path)}&canvas_w=${w}&canvas_h=${h}&view_mode=${viewMode}`);
      this.data = await res.json();
      this.render();
    } catch (e) {
      console.error("Error loading treemap", e);
    }
  }

  async loadFilesAnalysis() {
    this.currentMode = "reports";
    try {
      const res = await fetch(`/api/foldersizes/files-analysis?limit=150`);
      this.filesAnalysisData = await res.json();
      this.render();
    } catch (e) {
      console.error("Error loading files analysis", e);
    }
  }

  async loadTagSpace() {
    this.currentMode = "tags";
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
        <button onclick="window.folderSizesInstance.loadTreemap('${c.path.replace(/\\/g, '\\\\')}', '${this.currentMode}')" 
                class="hover:text-indigo-400 transition truncate max-w-[140px] ${idx === crumbs.length - 1 ? 'text-indigo-300 font-bold' : ''}">
          ${c.name}
        </button>
      </div>
    `).join('');
  }

  render() {
    const container = document.getElementById('fs-canvas-container');
    if (!container) return;
    container.innerHTML = '';

    if (this.currentMode === 'reports') {
      this.renderFilesAnalysisReports(container);
    } else if (this.currentMode === 'tags') {
      this.renderTagTreemap(container);
    } else {
      this.renderTreemapNodes(container);
    }
    if (window.lucide) lucide.createIcons();
  }

  renderTreemapNodes(container) {
    if (!this.data || !this.data.nodes || this.data.nodes.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-500">
          <i data-lucide="folder-open" class="w-12 h-12 mb-2 stroke-[1.5]"></i>
          <p class="text-sm">No se encontraron elementos para graficar en este nivel.</p>
        </div>
      `;
      return;
    }

    const totalBytes = this.data.total_bytes || 1;
    let filteredNodes = this.data.nodes;

    if (this.searchQuery) {
      filteredNodes = filteredNodes.filter(n => n.name.toLowerCase().includes(this.searchQuery));
    }

    const footerStats = document.getElementById('fs-footer-stats');
    if (footerStats) {
      footerStats.innerHTML = `
        <span>📦 ${this.data.total_items} bloques (${this.data.total_folders || 0} carpetas, ${this.data.total_files || 0} archivos)</span>
        <span>•</span>
        <span>💾 Total: ${formatBytes(totalBytes)}</span>
        <span>•</span>
        <span class="text-indigo-400 truncate">Ruta: ${this.currentPath}</span>
      `;
    }

    const catColors = {
      'Arquitectura & 3D (Work)': '#0ea5e9',
      'Software & Instaladores': '#8b5cf6',
      'Archivos Comprimidos': '#f59e0b',
      'Respaldos Celular': '#10b981',
      'Fotografía & Álbumes': '#ec4899',
      'Respaldos de Equipos / Personas': '#f59e0b',
      'Descargas Masivas': '#64748b',
      'Videos & Ejercicio': '#ef4444',
      'Cursos, Ebooks & Salud': '#14b8a6',
      'Música & Audio': '#3b82f6',
      'Documentos & Facturas': '#84cc16',
      'Otros Archivos': '#475569'
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
      const isFile = (node.type === 'file');

      const tile = document.createElement('div');
      tile.className = `absolute rounded border ${isFile ? 'border-dashed border-white/40' : 'border-black/50'} hover:border-white transition-all duration-150 cursor-pointer overflow-hidden p-1.5 flex flex-col justify-between group`;
      tile.style.left = `${r.x}px`;
      tile.style.top = `${r.y}px`;
      tile.style.width = `${r.w}px`;
      tile.style.height = `${r.h}px`;
      tile.style.backgroundColor = bgColor;
      tile.style.opacity = isFile ? '0.88' : '0.96';

      const showTitle = (r.w >= 54 && r.h >= 28);
      const showDetails = (r.w >= 90 && r.h >= 48);

      tile.innerHTML = `
        ${showTitle ? `
          <div class="min-w-0 pointer-events-none">
            <h4 class="text-[11px] font-bold text-white truncate drop-shadow-md flex items-center space-x-1">
              <span>${isFile ? '📄' : '📁'}</span>
              <span class="truncate">${node.name}</span>
            </h4>
            <span class="text-[10px] text-white/90 font-mono drop-shadow-sm">${formatBytes(node.value)} (${pct}%)</span>
          </div>
        ` : ''}

        ${showDetails ? `
          <div class="flex items-center justify-between text-[9px] text-white/90 font-medium drop-shadow-sm pointer-events-none">
            <span>${isFile ? (node.extension || 'Archivo') : (node.file_count || 0) + ' arch'}</span>
            ${node.tag_count > 0 ? `<span class="bg-black/40 px-1 py-0.5 rounded text-[8px] font-bold">🏷️ ${node.tag_count}</span>` : ''}
          </div>
        ` : ''}
      `;

      tile.onmouseenter = (e) => this.showTooltip(e, node, pct);
      tile.onmousemove = (e) => this.moveTooltip(e);
      tile.onmouseleave = () => this.hideTooltip();

      tile.onclick = () => {
        if (!isFile) {
          this.loadTreemap(node.path, this.currentMode);
        } else {
          previewMedia(node.path, node.extension);
        }
      };

      container.appendChild(tile);
    });
  }

  renderFilesAnalysisReports(container) {
    if (!this.filesAnalysisData) {
      container.innerHTML = `<div class="p-8 text-center text-slate-400">Cargando reporte profundo de archivos...</div>`;
      return;
    }

    const d = this.filesAnalysisData;
    const totalGB = (d.total_bytes / (1024**3)).toFixed(2);

    const footerStats = document.getElementById('fs-footer-stats');
    if (footerStats) {
      footerStats.innerHTML = `
        <span class="text-white font-bold">📊 Reporte de Archivos: ${d.total_files.toLocaleString()} archivos</span>
        <span>•</span>
        <span class="text-emerald-400 font-bold">💾 ${totalGB} GB</span>
        <span>•</span>
        <span>${d.file_types ? d.file_types.length : 0} extensiones activas</span>
      `;
    }

    container.innerHTML = `
      <div class="p-4 space-y-6 max-w-7xl mx-auto">
        
        <!-- Metrics Header Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <span class="text-[10px] text-slate-400 uppercase font-mono">Archivos Totales</span>
            <div class="text-lg font-bold text-white font-mono mt-0.5">${d.total_files.toLocaleString()}</div>
            <span class="text-[10px] text-emerald-400">Indexados en E:</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <span class="text-[10px] text-slate-400 uppercase font-mono">Espacio Ocupado</span>
            <div class="text-lg font-bold text-indigo-400 font-mono mt-0.5">${totalGB} GB</div>
            <span class="text-[10px] text-slate-400">${formatBytes(d.total_bytes)}</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <span class="text-[10px] text-slate-400 uppercase font-mono">Archivos Etiquetados</span>
            <div class="text-lg font-bold text-pink-400 font-mono mt-0.5">${d.tags_summary.tagged_count.toLocaleString()}</div>
            <span class="text-[10px] text-slate-400">${formatBytes(d.tags_summary.tagged_bytes)}</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <span class="text-[10px] text-slate-400 uppercase font-mono">Sin Etiquetar</span>
            <div class="text-lg font-bold text-amber-400 font-mono mt-0.5">${d.tags_summary.untagged_count.toLocaleString()}</div>
            <span class="text-[10px] text-slate-400">${formatBytes(d.tags_summary.untagged_bytes)}</span>
          </div>
        </div>

        <!-- 1. TOP EXTENSIONES Y TIPOS DE ARCHIVO -->
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="pie-chart" class="w-4 h-4 text-indigo-400"></i>
              <h3 class="text-sm font-bold text-white">Distribución por Tipos y Extensiones de Archivos</h3>
            </div>
            <span class="text-xs text-slate-400 font-mono">Top formatos por volumen</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
            ${d.file_types.map(t => `
              <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div class="min-w-0 pr-2">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-500/20 text-indigo-300">${t.extension}</span>
                    <span class="text-[11px] text-slate-300 font-semibold truncate">${t.category}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mt-1">
                    ${t.count.toLocaleString()} archivos • Promedio: ${formatBytes(t.avg_bytes)}
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-xs font-bold text-white font-mono">${formatBytes(t.total_bytes)}</div>
                  <span class="text-[10px] font-bold text-emerald-400 font-mono">${t.percentage}%</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 2. RANGOS DE TAMAÑO & ANTIGÜEDAD -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Size brackets -->
          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div class="flex items-center space-x-2 mb-3">
              <i data-lucide="layers" class="w-4 h-4 text-amber-400"></i>
              <h3 class="text-sm font-bold text-white">Distribución por Rangos de Tamaño</h3>
            </div>
            <div class="space-y-2">
              ${d.size_brackets.map(b => `
                <div class="space-y-1">
                  <div class="flex justify-between text-xs font-mono">
                    <span class="text-slate-300 font-semibold">${b.name}</span>
                    <span class="text-white">${formatBytes(b.bytes)} <span class="text-slate-400">(${b.count.toLocaleString()} arch, ${b.percentage_bytes}%)</span></span>
                  </div>
                  <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" style="width: ${Math.max(b.percentage_bytes, 1)}%; background-color: ${b.color}"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Age brackets -->
          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div class="flex items-center space-x-2 mb-3">
              <i data-lucide="clock" class="w-4 h-4 text-sky-400"></i>
              <h3 class="text-sm font-bold text-white">Distribución por Fecha de Modificación</h3>
            </div>
            <div class="space-y-2">
              ${d.age_brackets.map(b => `
                <div class="space-y-1">
                  <div class="flex justify-between text-xs font-mono">
                    <span class="text-slate-300 font-semibold">${b.name}</span>
                    <span class="text-white">${formatBytes(b.bytes)} <span class="text-slate-400">(${b.count.toLocaleString()} arch, ${b.percentage_bytes}%)</span></span>
                  </div>
                  <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" style="width: ${Math.max(b.percentage_bytes, 1)}%; background-color: ${b.color}"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 3. TOP ARCHIVOS MÁS GRANDES (LARGEST FILES TABLE) -->
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="flame" class="w-4 h-4 text-red-400"></i>
              <h3 class="text-sm font-bold text-white">Archivos Más Grandes del Disco E: (Top 150)</h3>
            </div>
            <span class="text-xs text-slate-400 font-mono">Consumo individual de espacio</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs font-mono">
              <thead class="text-slate-400 bg-slate-950/80 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th class="py-2 px-3">#</th>
                  <th class="py-2 px-3">Nombre del Archivo</th>
                  <th class="py-2 px-3">Tamaño</th>
                  <th class="py-2 px-3">% Disco</th>
                  <th class="py-2 px-3">Categoría</th>
                  <th class="py-2 px-3">Carpeta Contenedora</th>
                  <th class="py-2 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 text-slate-300">
                ${d.largest_files.map((f, idx) => `
                  <tr class="hover:bg-slate-800/40 transition">
                    <td class="py-2 px-3 text-slate-500 font-bold">${idx + 1}</td>
                    <td class="py-2 px-3">
                      <div class="font-bold text-white truncate max-w-xs" title="${f.name}">${f.name}</div>
                      ${f.tags && f.tags.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mt-0.5">
                          ${f.tags.map(t => `<span class="px-1.5 py-0.2 rounded text-[9px]" style="background:${t.color}20;color:${t.color}">${t.name}</span>`).join('')}
                        </div>
                      ` : ''}
                    </td>
                    <td class="py-2 px-3 font-bold text-emerald-400">${formatBytes(f.size_bytes)}</td>
                    <td class="py-2 px-3 text-indigo-300">${f.percentage}%</td>
                    <td class="py-2 px-3 text-slate-300">${f.category}</td>
                    <td class="py-2 px-3 text-slate-500 truncate max-w-xs" title="${f.folder_path}">${f.folder_path}</td>
                    <td class="py-2 px-3 text-right">
                      <button onclick="previewMedia('${f.path.replace(/\\/g, '\\\\')}', '${f.extension}')" 
                              class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] transition">
                        Ver
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  }

  renderTagTreemap(container) {
    if (!this.tagSpaceData) return;
    const data = this.tagSpaceData;
    let nodes = data.tag_treemap || [];

    const footerStats = document.getElementById('fs-footer-stats');
    if (footerStats) {
      footerStats.innerHTML = `
        <span>🏷️ ${nodes.length} Grupos de Etiquetas</span>
        <span>•</span>
        <span class="text-indigo-400">Únicos: ${data.unique_tags_items_count}</span>
        <span>•</span>
        <span class="text-pink-400">Mixtos: ${data.mixed_tags_items_count}</span>
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
