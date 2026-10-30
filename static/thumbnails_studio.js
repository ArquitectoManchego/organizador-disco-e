/**
 * Thumbnails Studio & Generator Module
 */

class ThumbnailsStudio {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.pollInterval = null;
    this.statusData = null;
    this.currentFilter = "all"; // "all", "image", "video", "pdf"
    
    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-950 select-none">
        
        <!-- Header Bar -->
        <div class="h-14 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold text-sm border border-pink-500/20">
              🖼️
            </div>
            <div>
              <h2 class="text-xs font-extrabold text-white tracking-wide">THUMBNAILS STUDIO & GENERATOR</h2>
              <span class="text-[10px] text-slate-400">Generador de miniaturas por lotes para fotos, videos y documentos con caché local</span>
            </div>
          </div>

          <!-- Quick Cache Stats in Header -->
          <div class="flex items-center space-x-3 text-xs font-mono">
            <div class="bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 text-slate-300">
              <span>Caché: </span>
              <span id="ts-cache-count" class="font-bold text-indigo-400">0</span> miniaturas (<span id="ts-cache-mb" class="text-white">0 MB</span>)
            </div>
            <button onclick="window.thumbnailsStudioInstance.clearCache()" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-300 transition text-[11px]">
              Vaciar Caché
            </button>
          </div>
        </div>

        <!-- Controls & Progress Section -->
        <div class="p-4 border-b border-slate-800 bg-slate-900/30 flex-shrink-0">
          
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <!-- Target Folder Picker -->
            <div class="lg:col-span-5">
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                📁 Carpeta Objetivo para Generar Miniaturas
              </label>
              <div class="flex items-center space-x-1.5">
                <input type="text" id="ts-target-dir" value="E:\\FOTOS" 
                       class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
                <select onchange="document.getElementById('ts-target-dir').value = this.value" class="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300">
                  <option value="E:\\FOTOS">E:\\FOTOS</option>
                  <option value="E:\\RESPALDOS CELULAR">E:\\RESPALDOS CELULAR</option>
                  <option value="E:\\Iphone">E:\\Iphone</option>
                  <option value="E:\\EJERCICIO">E:\\EJERCICIO</option>
                  <option value="E:\\WORK">E:\\WORK</option>
                  <option value="E:\\">Todo el Disco E:\\</option>
                </select>
              </div>
            </div>

            <!-- Limit & Options -->
            <div class="lg:col-span-3">
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Límite de Archivos
              </label>
              <select id="ts-max-files" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none">
                <option value="500">500 archivos</option>
                <option value="1500" selected>1,500 archivos</option>
                <option value="5000">5,000 archivos</option>
                <option value="20000">20,000 archivos</option>
              </select>
            </div>

            <!-- Action Buttons -->
            <div class="lg:col-span-4 flex items-center space-x-2">
              <button id="ts-btn-start" onclick="window.thumbnailsStudioInstance.startGeneration()" 
                      class="px-4 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-pink-600/30 transition flex-1 justify-center">
                <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                <span>Iniciar Generación</span>
              </button>

              <button id="ts-btn-pause" onclick="window.thumbnailsStudioInstance.togglePause()" 
                      class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition">
                Pausar
              </button>

              <button id="ts-btn-stop" onclick="window.thumbnailsStudioInstance.stopGeneration()" 
                      class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition">
                Detener
              </button>
            </div>
          </div>

          <!-- Live Progress Bar -->
          <div class="mt-4 pt-3 border-t border-slate-800/80">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <div class="flex items-center space-x-2">
                <span id="ts-status-badge" class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">Inactivo</span>
                <span id="ts-current-file-text" class="text-slate-300 truncate max-w-md font-mono text-[11px]">Listo para generar</span>
              </div>
              <div class="flex items-center space-x-3 font-mono text-[11px] text-slate-400">
                <span>Generadas: <b id="ts-count-generated" class="text-emerald-400">0</b></span>
                <span>•</span>
                <span>Progreso: <b id="ts-count-percent" class="text-white">0%</b></span>
                <span>•</span>
                <span>ETA: <b id="ts-count-eta" class="text-indigo-400">-</b></span>
              </div>
            </div>

            <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div id="ts-progress-fill" class="h-full bg-gradient-to-r from-pink-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>

        </div>

        <!-- Gallery Header & Filter Tabs -->
        <div class="h-10 border-b border-slate-800 bg-slate-900/40 px-4 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center space-x-2 text-xs">
            <span class="font-bold text-slate-400 uppercase text-[10px]">Muro de Miniaturas Generadas:</span>
            <div class="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button onclick="window.thumbnailsStudioInstance.setFilter('all')" id="ts-filter-all" class="px-2 py-0.5 rounded font-semibold bg-indigo-600 text-white">
                Todas
              </button>
              <button onclick="window.thumbnailsStudioInstance.setFilter('image')" id="ts-filter-image" class="px-2 py-0.5 rounded font-semibold text-slate-400 hover:text-white">
                Fotos / Imágenes
              </button>
              <button onclick="window.thumbnailsStudioInstance.setFilter('video')" id="ts-filter-video" class="px-2 py-0.5 rounded font-semibold text-slate-400 hover:text-white">
                Videos
              </button>
              <button onclick="window.thumbnailsStudioInstance.setFilter('pdf')" id="ts-filter-pdf" class="px-2 py-0.5 rounded font-semibold text-slate-400 hover:text-white">
                PDFs
              </button>
            </div>
          </div>

          <span class="text-[11px] text-slate-500">Haz clic en cualquier imagen para ver en alta resolución</span>
        </div>

        <!-- Live Thumbnail Grid Area (Scrollable) -->
        <div class="flex-1 overflow-y-auto p-4" id="ts-gallery-container">
          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3" id="ts-gallery-grid">
            <!-- Dynamically populated thumbnails -->
          </div>
        </div>

      </div>
    `;

    this.startPolling();
    this.fetchInitialStatus();
    if (window.lucide) lucide.createIcons();
  }

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => this.updateStatus(), 1500);
  }

  async fetchInitialStatus() {
    try {
      const res = await fetch('/api/thumbnails/status');
      this.statusData = await res.json();
      this.renderStatusUI();
    } catch (e) {
      console.error(e);
    }
  }

  async updateStatus() {
    try {
      const res = await fetch('/api/thumbnails/status');
      this.statusData = await res.json();
      this.renderStatusUI();
    } catch (e) {
      // Server down or offline
    }
  }

  renderStatusUI() {
    const s = this.statusData;
    if (!s) return;

    // Cache Stats
    const cacheEl = document.getElementById('ts-cache-count');
    const cacheMb = document.getElementById('ts-cache-mb');
    if (cacheEl && s.cache_stats) cacheEl.innerText = s.cache_stats.total_cached;
    if (cacheMb && s.cache_stats) cacheMb.innerText = `${s.cache_stats.cache_size_mb} MB`;

    // Status Badge
    const badge = document.getElementById('ts-status-badge');
    if (badge) {
      if (s.status === 'running') {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-400 border border-pink-500/40 animate-pulse';
        badge.innerText = '⚡ Generando...';
      } else if (s.status === 'paused') {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40';
        badge.innerText = '⏸ En Pausa';
      } else if (s.status === 'completed') {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
        badge.innerText = '✓ Completado';
      } else {
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400';
        badge.innerText = 'Inactivo';
      }
    }

    // Text & Counts
    const curFile = document.getElementById('ts-current-file-text');
    if (curFile) curFile.innerText = s.current_file || 'Inactivo';

    const countGen = document.getElementById('ts-count-generated');
    if (countGen) countGen.innerText = s.generated;

    const countPct = document.getElementById('ts-count-percent');
    if (countPct) countPct.innerText = `${s.percent}% (${s.processed}/${s.total_files})`;

    const countEta = document.getElementById('ts-count-eta');
    if (countEta) {
      if (s.eta_seconds > 0) {
        countEta.innerText = `${Math.round(s.eta_seconds)}s restantes`;
      } else {
        countEta.innerText = '-';
      }
    }

    const fill = document.getElementById('ts-progress-fill');
    if (fill) fill.style.width = `${s.percent}%`;

    // Render Recent Thumbnails Grid
    this.renderGalleryGrid();
  }

  renderGalleryGrid() {
    const grid = document.getElementById('ts-gallery-grid');
    if (!grid || !this.statusData || !this.statusData.recent_generated) return;

    let items = this.statusData.recent_generated;
    if (this.currentFilter !== 'all') {
      items = items.filter(it => it.type === this.currentFilter);
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-500 text-xs">
          No hay miniaturas en esta categoría todavía. Haz clic en "Iniciar Generación" para comenzar.
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map(it => {
      const isVideo = it.type === 'video';
      const isPdf = it.type === 'pdf';
      return `
        <div class="glass-card rounded-xl p-1.5 flex flex-col justify-between group cursor-pointer relative overflow-hidden"
             onclick="previewMedia('${it.path.replace(/\\/g, '\\\\')}', '${it.name.split('.').pop()}')">
          
          <div class="w-full aspect-square rounded-lg bg-slate-950 overflow-hidden relative mb-1.5">
            <img src="/api/thumbnail?path=${encodeURIComponent(it.path)}" 
                 alt="${it.name}" 
                 loading="lazy"
                 class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
            
            ${isVideo ? `
              <div class="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[8px] font-bold text-white flex items-center space-x-1">
                <i data-lucide="play" class="w-2 h-2 fill-current"></i>
                <span>VID</span>
              </div>
            ` : ''}

            ${isPdf ? `
              <div class="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-red-600/90 text-[8px] font-bold text-white">
                PDF
              </div>
            ` : ''}
          </div>

          <div class="min-w-0">
            <h5 class="text-[10px] font-medium text-slate-200 truncate" title="${it.name}">${it.name}</h5>
            <span class="text-[9px] text-slate-500 font-mono">${formatBytes(it.size)}</span>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  setFilter(type) {
    this.currentFilter = type;
    ['all', 'image', 'video', 'pdf'].forEach(t => {
      const btn = document.getElementById(`ts-filter-${t}`);
      if (btn) {
        if (t === type) {
          btn.className = 'px-2 py-0.5 rounded font-semibold bg-indigo-600 text-white';
        } else {
          btn.className = 'px-2 py-0.5 rounded font-semibold text-slate-400 hover:text-white';
        }
      }
    });
    this.renderGalleryGrid();
  }

  async startGeneration() {
    const targetDir = document.getElementById('ts-target-dir').value.trim();
    const maxFiles = parseInt(document.getElementById('ts-max-files').value) || 1500;

    try {
      const res = await fetch('/api/thumbnails/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_dir: targetDir, recursive: true, max_files: maxFiles })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Generación de miniaturas en segundo plano iniciada", "success");
      } else {
        showToast(data.message, "info");
      }
      this.updateStatus();
    } catch (e) {
      showToast("Error al iniciar: " + e.message, "error");
    }
  }

  async togglePause() {
    if (!this.statusData) return;
    const isPaused = this.statusData.status === 'paused';
    const endpoint = isPaused ? '/api/thumbnails/resume' : '/api/thumbnails/pause';
    try {
      await fetch(endpoint, { method: 'POST' });
      this.updateStatus();
    } catch (e) {
      console.error(e);
    }
  }

  async stopGeneration() {
    try {
      await fetch('/api/thumbnails/stop', { method: 'POST' });
      showToast("Proceso de miniaturas detenido", "info");
      this.updateStatus();
    } catch (e) {
      console.error(e);
    }
  }

  async clearCache() {
    if (!confirm("¿Deseas vaciar la caché de miniaturas generadas?")) return;
    try {
      const res = await fetch('/api/thumbnails/clear-cache', { method: 'POST' });
      const data = await res.json();
      showToast(`Caché vaciada (${data.deleted_count} eliminados)`, "info");
      this.updateStatus();
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }
}

window.ThumbnailsStudio = ThumbnailsStudio;
