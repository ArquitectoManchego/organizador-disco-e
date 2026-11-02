/**
 * Beyond Compare Web Module - Pro Edition
 * Complete Side-by-Side Dual Tree View, Synchronized Scrolling,
 * Interactive Content Diff Viewers (Text, Image Split-Slider, ZIP Archive, Hex Dump)
 * and Folder Synchronization Engine (Mirror, Update, Copy, Safe Recycle).
 */

class FolderComparator {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.leftPath = "E:\\WORK\\Leslie Carrillo - Entrega 28 Mayo";
    this.rightPath = "E:\\WORK\\TODO REVISAR DUPLICADOS\\Leslie Carrillo - Entrega 28 Mayo";
    this.compData = null;
    this.driveDuplicatesData = null;
    this.activeFilter = "all"; // 'all', 'mismatches', 'orphans', 'identical'
    this.searchQuery = "";
    this.currentSubTab = "side_by_side"; // "side_by_side" or "drive_scanner"
    
    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-950 select-none">
        
        <!-- Header & Subtab Bar -->
        <div class="h-14 border-b border-slate-800 bg-slate-900/70 px-4 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/20 shadow-sm">
              ⚖️
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h2 class="text-xs font-black text-white tracking-wide">BEYOND COMPARE 5 PRO</h2>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">SYNC & DIFF</span>
              </div>
              <span class="text-[10px] text-slate-400">Doble árbol sincronizado, diff de texto, imagen cortina, archivos zip, volcado hex y espejeo</span>
            </div>
          </div>

          <!-- Subtab toggle -->
          <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button id="cmp-tab-side" class="px-3 py-1 rounded-lg font-semibold bg-indigo-600 text-white transition flex items-center space-x-1.5">
              <i data-lucide="columns" class="w-3.5 h-3.5"></i>
              <span>Comparación Lado a Lado</span>
            </button>
            <button id="cmp-tab-scanner" class="px-3 py-1 rounded-lg font-semibold text-slate-400 hover:text-white transition flex items-center space-x-1.5">
              <i data-lucide="scan" class="w-3.5 h-3.5"></i>
              <span>Escáner Automático E:</span>
            </button>
          </div>
        </div>

        <!-- 1. SIDE-BY-SIDE VIEW -->
        <div id="cmp-view-side" class="flex-1 flex flex-col overflow-hidden">
          
          <!-- Path Input Bar (Left vs Right) -->
          <div class="p-2.5 border-b border-slate-800 bg-slate-900/40 grid grid-cols-1 md:grid-cols-2 gap-3 flex-shrink-0">
            <!-- Left Path -->
            <div class="bg-slate-950/60 p-2 rounded-xl border border-indigo-500/20">
              <div class="flex items-center justify-between mb-1">
                <label class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center space-x-1">
                  <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
                  <span>Carpeta Base (Lado Izquierdo)</span>
                </label>
                <span id="cmp-left-stats" class="text-[10px] text-slate-400 font-mono">0 archivos</span>
              </div>
              <div class="flex items-center space-x-1.5">
                <input type="text" id="cmp-left-path" value="${this.leftPath}" 
                       class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
                <button onclick="window.comparatorInstance.openLeftExplorer()" class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition" title="Abrir en Explorador de Windows">
                  <i data-lucide="folder-symlink" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <!-- Right Path -->
            <div class="bg-slate-950/60 p-2 rounded-xl border border-sky-500/20">
              <div class="flex items-center justify-between mb-1">
                <label class="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1">
                  <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>Carpeta Destino / Comparada (Lado Derecho)</span>
                </label>
                <span id="cmp-right-stats" class="text-[10px] text-slate-400 font-mono">0 archivos</span>
              </div>
              <div class="flex items-center space-x-1.5">
                <input type="text" id="cmp-right-path" value="${this.rightPath}" 
                       class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
                <button onclick="window.comparatorInstance.openRightExplorer()" class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition" title="Abrir en Explorador de Windows">
                  <i data-lucide="folder-symlink" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Controls, Sync Toolbar & Filter Pills -->
          <div class="min-h-11 border-b border-slate-800 bg-slate-900/30 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-xs">
            
            <!-- Left Group: Run & Sync Actions -->
            <div class="flex items-center space-x-2 flex-wrap">
              <button id="cmp-btn-run" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition transform active:scale-95">
                <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
                <span>Comparar</span>
              </button>

              <label class="flex items-center space-x-1.5 cursor-pointer text-slate-300 text-[11px] bg-slate-950/60 px-2 py-1 rounded-lg border border-slate-800">
                <input type="checkbox" id="cmp-cb-fullhash" class="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-indigo-600">
                <span>Hash MD5 Bit-a-Bit</span>
              </label>

              <div class="h-4 w-px bg-slate-800 mx-1"></div>

              <!-- Sync Buttons -->
              <button onclick="window.comparatorInstance.openSyncDialog('mirror')" 
                      class="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold flex items-center space-x-1 text-[11px] transition"
                      title="Espejeo: Copia modificados/faltantes a Derecha y envía huérfanos de Derecha a la Papelera de Windows">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Espejo Izq ➔ Der</span>
              </button>

              <button onclick="window.comparatorInstance.openSyncDialog('update')" 
                      class="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold flex items-center space-x-1 text-[11px] transition"
                      title="Actualizar: Copia faltantes o más recientes a Derecha sin borrar nada">
                <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                <span>Actualizar Der</span>
              </button>
            </div>

            <!-- Right Group: Beyond Compare Filters & Search -->
            <div class="flex items-center space-x-2">
              <div class="relative">
                <input type="text" id="cmp-search-input" placeholder="Filtrar por archivo..." 
                       class="bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-0.5 text-[11px] text-slate-200 w-36 focus:w-48 focus:border-indigo-500 transition-all font-mono outline-none">
                <i data-lucide="search" class="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5"></i>
              </div>

              <!-- Filter Pills -->
              <div class="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800" id="cmp-filter-pills">
                <button onclick="window.comparatorInstance.setFilter('all')" data-f="all" class="cmp-fpill px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-white">
                  Todos
                </button>
                <button onclick="window.comparatorInstance.setFilter('mismatches')" data-f="mismatches" class="cmp-fpill px-2 py-0.5 rounded text-[11px] font-semibold text-red-400 hover:text-white">
                  Diferencias
                </button>
                <button onclick="window.comparatorInstance.setFilter('orphans')" data-f="orphans" class="cmp-fpill px-2 py-0.5 rounded text-[11px] font-semibold text-purple-400 hover:text-white">
                  Huérfanos
                </button>
                <button onclick="window.comparatorInstance.setFilter('identical')" data-f="identical" class="cmp-fpill px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-white">
                  Idénticos
                </button>
              </div>
            </div>
          </div>

          <!-- Summary Metric Banner -->
          <div id="cmp-summary-banner" class="hidden px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between flex-shrink-0">
            <!-- Dynamically populated -->
          </div>

          <!-- Dual Tree View Area (Synchronized Scroll) -->
          <div id="cmp-diff-content" class="flex-1 overflow-y-auto">
            <div class="flex flex-col items-center justify-center h-full text-slate-500 p-8">
              <i data-lucide="git-compare" class="w-12 h-12 mb-3 stroke-[1.5] text-indigo-400/40"></i>
              <p class="text-sm font-semibold text-slate-300">Explorador de Diferencias Beyond Compare 5</p>
              <p class="text-xs text-slate-500 mt-1 max-w-md text-center">
                Compara carpetas completas, visualiza diferencias línea a línea, inspecciona imágenes con cortina deslizante, miembros de archivos ZIP y volcados hexadecimales.
              </p>
            </div>
          </div>
        </div>

        <!-- 2. DRIVE-WIDE SCANNER VIEW -->
        <div id="cmp-view-scanner" class="hidden flex-1 flex flex-col overflow-hidden p-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-bold text-white">Carpetas Duplicadas Detectadas en E:\\</h3>
              <p class="text-xs text-slate-400">Escaneo automático de pares de carpetas idénticas o casi idénticas en tu disco duro.</p>
            </div>
            <button id="cmp-btn-rescan-drive" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow transition">
              <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              <span>Re-escanear Disco E:</span>
            </button>
          </div>

          <div id="cmp-drive-dupes-list" class="flex-1 overflow-y-auto space-y-3">
            <div class="text-center py-10 text-slate-500 text-xs">Cargando duplicados del disco...</div>
          </div>
        </div>

      </div>

      <!-- Beyond Compare 5 Content Diff Modal (Text, Image Split-Slider, ZIP, Hex) -->
      <div id="cmp-diff-modal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
        <div class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <!-- Modal Header -->
          <div class="px-5 py-3 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center space-x-3 min-w-0 pr-4">
              <div id="cmp-modal-icon" class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30 flex-shrink-0">
                DIFF
              </div>
              <div class="min-w-0">
                <div class="flex items-center space-x-2">
                  <h3 id="cmp-modal-title" class="text-xs font-black text-white truncate font-mono">Comparación de Archivo</h3>
                  <span id="cmp-modal-type-badge" class="px-2 py-0.2 rounded-full text-[9px] font-bold bg-slate-800 text-slate-300 uppercase">AUTO</span>
                </div>
                <div class="text-[10px] text-slate-400 truncate flex items-center space-x-1 mt-0.5">
                  <span class="text-indigo-400" id="cmp-modal-left-p">Izq</span>
                  <span>vs</span>
                  <span class="text-sky-400" id="cmp-modal-right-p">Der</span>
                </div>
              </div>
            </div>

            <!-- Modal Controls -->
            <div class="flex items-center space-x-2 flex-shrink-0">
              <div id="cmp-modal-extra-tools" class="flex items-center space-x-1"></div>
              <button onclick="window.comparatorInstance.closeContentDiff()" class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- Modal Body -->
          <div id="cmp-modal-body" class="flex-1 overflow-auto bg-slate-950 relative">
            <div class="flex items-center justify-center h-full text-slate-400 text-xs">
              <svg class="animate-spin h-6 w-6 text-indigo-500 mr-2" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Analizando diferencias de contenido bit-a-bit...</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sync Confirmation Dialog Modal -->
      <div id="cmp-sync-modal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-lg flex-shrink-0">
              🔄
            </div>
            <div>
              <h3 id="cmp-sync-modal-title" class="text-sm font-black text-white">Sincronización de Carpetas</h3>
              <p class="text-xs text-slate-400">Motor de Sincronización Beyond Compare 5</p>
            </div>
          </div>

          <div id="cmp-sync-modal-desc" class="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono space-y-2">
            <!-- populated -->
          </div>

          <div class="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200 space-y-1">
            <div class="font-bold flex items-center space-x-1 text-indigo-300">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
              <span>Garantía de Seguridad SwipeDrive</span>
            </div>
            <p>
              Cualquier archivo eliminado por espejeo se enviará a la <strong>Papelera de Reciclaje de Windows</strong> (con soporte Undo). Nunca se borran archivos de manera permanente.
            </p>
          </div>

          <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
            <button onclick="document.getElementById('cmp-sync-modal').classList.add('hidden')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold">
              Cancelar
            </button>
            <button id="cmp-sync-confirm-btn" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 shadow">
              <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i>
              <span>Confirmar y Ejecutar</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    if (window.lucide) lucide.createIcons();
  }

  attachEvents() {
    const tabSide = document.getElementById('cmp-tab-side');
    const tabScanner = document.getElementById('cmp-tab-scanner');
    const viewSide = document.getElementById('cmp-view-side');
    const viewScanner = document.getElementById('cmp-view-scanner');

    tabSide.onclick = () => {
      this.currentSubTab = "side_by_side";
      tabSide.classList.add('bg-indigo-600', 'text-white');
      tabSide.classList.remove('text-slate-400');
      tabScanner.classList.remove('bg-indigo-600', 'text-white');
      tabScanner.classList.add('text-slate-400');
      viewSide.classList.remove('hidden');
      viewScanner.classList.add('hidden');
    };

    tabScanner.onclick = () => {
      this.currentSubTab = "drive_scanner";
      tabScanner.classList.add('bg-indigo-600', 'text-white');
      tabScanner.classList.remove('text-slate-400');
      tabSide.classList.remove('bg-indigo-600', 'text-white');
      tabSide.classList.add('text-slate-400');
      viewScanner.classList.remove('hidden');
      viewSide.classList.add('hidden');
      this.loadDriveDuplicates();
    };

    document.getElementById('cmp-btn-run').onclick = () => {
      this.leftPath = document.getElementById('cmp-left-path').value.trim();
      this.rightPath = document.getElementById('cmp-right-path').value.trim();
      const verifyFullHash = document.getElementById('cmp-cb-fullhash').checked;
      this.runComparison(this.leftPath, this.rightPath, verifyFullHash);
    };

    document.getElementById('cmp-search-input').oninput = (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderComparisonResults();
    };

    document.getElementById('cmp-btn-rescan-drive').onclick = () => {
      this.loadDriveDuplicates(true);
    };

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeContentDiff();
        document.getElementById('cmp-sync-modal').classList.add('hidden');
      }
    });
  }

  openLeftExplorer() {
    const p = document.getElementById('cmp-left-path').value.trim();
    if (p) openInExplorer(p);
  }

  openRightExplorer() {
    const p = document.getElementById('cmp-right-path').value.trim();
    if (p) openInExplorer(p);
  }

  async runComparison(leftPath, rightPath, verifyFullHash = false) {
    const content = document.getElementById('cmp-diff-content');
    content.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-slate-400 p-12">
        <svg class="animate-spin h-8 w-8 text-indigo-500 mb-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span class="text-sm font-semibold">Comparando árboles de carpetas e integridad de contenido...</span>
        <span class="text-xs text-slate-500 mt-1">Calculando tamaños, marcas de tiempo y hashes</span>
      </div>
    `;

    try {
      const res = await fetch('/api/compare/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_path: leftPath,
          right_path: rightPath,
          verify_full_hash: verifyFullHash
        })
      });
      this.compData = await res.json();
      this.renderComparisonResults();
    } catch (e) {
      showToast("Error en comparación: " + e.message, "error");
      content.innerHTML = `<div class="p-8 text-red-400 text-center">Error al comparar carpetas: ${e.message}</div>`;
    }
  }

  renderComparisonResults() {
    const data = this.compData;
    if (!data || data.error) {
      document.getElementById('cmp-diff-content').innerHTML = `
        <div class="p-8 text-center text-red-400 bg-red-950/20 border border-red-500/30 rounded-xl m-4">
          ${data ? data.error : 'Error desconocido'}
        </div>
      `;
      return;
    }

    // Update left & right file stats
    const lStats = document.getElementById('cmp-left-stats');
    const rStats = document.getElementById('cmp-right-stats');
    if (lStats) lStats.innerText = `${data.left_file_count} archivos (${formatBytes(data.left_total_size)})`;
    if (rStats) rStats.innerText = `${data.right_file_count} archivos (${formatBytes(data.right_total_size)})`;

    // Render Summary Banner
    const banner = document.getElementById('cmp-summary-banner');
    banner.classList.remove('hidden');

    const sim = data.similarity_percent;
    const isExact = data.is_exact_folder_duplicate;
    const counts = data.counts;

    banner.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
          isExact ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : (sim >= 80 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-300')
        }">
          ${sim}%
        </div>
        <div>
          <h4 class="text-xs font-bold text-white flex items-center space-x-1.5">
            <span>${isExact ? '✅ Carpetas 100% Idénticas (Duplicado Exacto)' : (data.is_near_duplicate ? '⚠️ Carpetas Casi Idénticas' : 'Carpetas Parcialmente Similares')}</span>
            <span class="text-[10px] text-slate-400 font-mono">(${counts.total_files} elementos analizados)</span>
          </h4>
          <div class="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5 font-mono">
            <span class="text-emerald-400 font-bold">${counts.identical} idénticos</span>
            <span>•</span>
            <span class="text-red-400 font-bold">${counts.modified + counts.same_name_size_diff_content} diferencias</span>
            <span>•</span>
            <span class="text-indigo-400">${counts.left_only} solo izq</span>
            <span>•</span>
            <span class="text-purple-400">${counts.right_only} solo der</span>
          </div>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <button onclick="window.comparatorInstance.openSyncDialog('mirror')" class="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center space-x-1">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>Espejo</span>
        </button>
        <button onclick="window.comparatorInstance.markRightAsDuplicate()" class="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold flex items-center space-x-1">
          <i data-lucide="tag" class="w-3.5 h-3.5"></i>
          <span>Marcar Der como Duplicado</span>
        </button>
      </div>
    `;

    // Filter items
    let rows = [];
    const res = data.results;

    if (this.activeFilter === 'all') {
      rows = [
        ...res.same_name_size_diff_content,
        ...res.modified,
        ...res.same_content_diff_name,
        ...res.left_only,
        ...res.right_only,
        ...res.identical
      ];
    } else if (this.activeFilter === 'mismatches') {
      rows = [
        ...res.same_name_size_diff_content,
        ...res.modified,
        ...res.same_content_diff_name
      ];
    } else if (this.activeFilter === 'orphans') {
      rows = [...res.left_only, ...res.right_only];
    } else if (this.activeFilter === 'identical') {
      rows = res.identical;
    }

    // Apply Live Search Filter
    if (this.searchQuery) {
      rows = rows.filter(item => {
        const lName = item.left ? item.left.rel_path.toLowerCase() : '';
        const rName = item.right ? item.right.rel_path.toLowerCase() : '';
        return lName.includes(this.searchQuery) || rName.includes(this.searchQuery);
      });
    }

    const content = document.getElementById('cmp-diff-content');
    if (rows.length === 0) {
      content.innerHTML = `
        <div class="p-12 text-center text-slate-500 text-xs">
          <i data-lucide="filter" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          No hay elementos que coincidan con el filtro actual ("${this.activeFilter}"${this.searchQuery ? `, búsqueda: "${this.searchQuery}"` : ''}).
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Render Beyond Compare Dual Aligned Tree Table
    content.innerHTML = `
      <div class="w-full font-mono text-xs select-text">
        <div class="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-bold grid grid-cols-12 py-2 px-3 shadow-md">
          <div class="col-span-5 flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>Árbol Izquierda (Base)</span>
          </div>
          <div class="col-span-2 text-center">Estado Diff</div>
          <div class="col-span-5 flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-2 h-2 rounded-full bg-sky-500"></span>
              <span>Árbol Derecha (Destino)</span>
            </div>
            <span>Acciones</span>
          </div>
        </div>

        <div class="divide-y divide-slate-800/50">
          ${rows.map(item => this.renderDualRow(item)).join('')}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  }

  renderDualRow(item) {
    const st = item.status;
    let badgeClass = 'bg-slate-800 text-slate-300';
    let icon = '===';
    let label = item.status_label || st;
    let rowBg = 'hover:bg-slate-800/40';

    // Official Beyond Compare Colors
    // Red: Modified, Blue: Left orphan, Purple: Right orphan, Gray: Identical, Yellow: Hash collision
    if (st === 'identical') {
      badgeClass = 'bg-slate-800/80 text-slate-400 border border-slate-700';
      icon = '===';
      rowBg = 'hover:bg-slate-800/30 text-slate-400';
    } else if (st === 'same_name_size_diff_content') {
      badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
      icon = '≠ ⚠️';
      label = 'Colisión Hash';
      rowBg = 'bg-amber-950/15 hover:bg-amber-950/25';
    } else if (st === 'modified') {
      badgeClass = 'bg-red-500/20 text-red-400 border border-red-500/40 font-black';
      icon = '≠';
      rowBg = 'bg-red-950/15 hover:bg-red-950/25';
    } else if (st === 'left_only') {
      badgeClass = 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40';
      icon = '←';
      label = 'Solo Izquierda';
      rowBg = 'bg-indigo-950/10 hover:bg-indigo-950/20';
    } else if (st === 'right_only') {
      badgeClass = 'bg-purple-500/20 text-purple-400 border border-purple-500/40';
      icon = '→';
      label = 'Solo Derecha';
      rowBg = 'bg-purple-950/10 hover:bg-purple-950/20';
    } else if (st === 'same_content_diff_name') {
      badgeClass = 'bg-teal-500/20 text-teal-400 border border-teal-500/40';
      icon = '⇄';
      label = 'Renombrado';
      rowBg = 'bg-teal-950/15 hover:bg-teal-950/25';
    }

    const lf = item.left;
    const rf = item.right;
    const canDiffContent = (lf && rf);
    const itemEncoded = encodeURIComponent(JSON.stringify(item));

    return `
      <div class="grid grid-cols-12 py-2 px-3 items-center transition ${rowBg}">
        
        <!-- Left Side Pane -->
        <div class="col-span-5 pr-2 ${lf ? '' : 'diff-blank-hatch py-3 rounded-lg opacity-40'}">
          ${lf ? `
            <div class="flex items-center space-x-2 min-w-0">
              <i data-lucide="file" class="w-3.5 h-3.5 ${st === 'modified' ? 'text-red-400' : 'text-indigo-400'} flex-shrink-0"></i>
              <span class="truncate font-medium ${st === 'modified' ? 'text-red-300 font-bold' : 'text-slate-200'}" title="${lf.rel_path}">${lf.rel_path}</span>
            </div>
            <div class="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
              <span class="font-bold">${formatBytes(lf.size)}</span>
              <span>•</span>
              <span>${formatDate(lf.mtime)}</span>
            </div>
          ` : '<span class="text-[11px] text-slate-600 italic">— Huérfano en derecha —</span>'}
        </div>

        <!-- Center Gutter & Compare Operator -->
        <div class="col-span-2 text-center flex flex-col items-center justify-center">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">
            <span class="mr-1">${icon}</span>
            <span>${label}</span>
          </span>
          ${canDiffContent ? `
            <button onclick="window.comparatorInstance.openContentDiff('${itemEncoded}')" 
                    class="mt-1 text-[10px] text-indigo-400 hover:text-indigo-300 underline font-sans flex items-center space-x-1">
              <i data-lucide="maximize-2" class="w-2.5 h-2.5"></i>
              <span>Ver Diff</span>
            </button>
          ` : ''}
        </div>

        <!-- Right Side Pane & Item Quick Actions -->
        <div class="col-span-5 pl-2 flex items-center justify-between ${rf ? '' : 'diff-blank-hatch py-3 rounded-lg opacity-40'}">
          <div class="min-w-0 pr-2">
            ${rf ? `
              <div class="flex items-center space-x-2 min-w-0">
                <i data-lucide="file" class="w-3.5 h-3.5 ${st === 'modified' ? 'text-red-400' : 'text-sky-400'} flex-shrink-0"></i>
                <span class="truncate font-medium ${st === 'modified' ? 'text-red-300 font-bold' : 'text-slate-200'}" title="${rf.rel_path}">${rf.rel_path}</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                <span class="font-bold">${formatBytes(rf.size)}</span>
                <span>•</span>
                <span>${formatDate(rf.mtime)}</span>
              </div>
            ` : '<span class="text-[11px] text-slate-600 italic">— Huérfano en izquierda —</span>'}
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center space-x-1 flex-shrink-0">
            ${lf ? `
              <button onclick="window.comparatorInstance.copyItem('${encodeURIComponent(lf.rel_path)}', 'copy_left_to_right')" 
                      class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[10px]" 
                      title="Copiar a Derecha ➔">
                <i data-lucide="arrow-right" class="w-3 h-3 text-sky-400"></i>
              </button>
            ` : ''}
            ${rf ? `
              <button onclick="window.comparatorInstance.copyItem('${encodeURIComponent(rf.rel_path)}', 'copy_right_to_left')" 
                      class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[10px]" 
                      title="Copiar a Izquierda ⬅">
                <i data-lucide="arrow-left" class="w-3 h-3 text-indigo-400"></i>
              </button>
              <button onclick="window.comparatorInstance.recycleItem('${encodeURIComponent(rf.full_path)}')" 
                      class="p-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition text-[10px]" 
                      title="Enviar a Papelera de Reciclaje">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            ` : ''}
          </div>
        </div>

      </div>
    `;
  }

  setFilter(filterKey) {
    this.activeFilter = filterKey;
    document.querySelectorAll('.cmp-fpill').forEach(btn => {
      const match = (btn.getAttribute('data-f') === filterKey);
      btn.className = `cmp-fpill px-2 py-0.5 rounded text-[11px] font-semibold transition ${
        match ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
      }`;
    });
    this.renderComparisonResults();
  }

  // =========================================================================
  // CONTENT DIFF MODAL (TEXT, IMAGE SPLIT-SLIDER, ARCHIVE ZIP, HEX DUMP)
  // =========================================================================

  async openContentDiff(itemEncoded) {
    const item = JSON.parse(decodeURIComponent(itemEncoded));
    const modal = document.getElementById('cmp-diff-modal');
    const modalBody = document.getElementById('cmp-modal-body');
    const titleEl = document.getElementById('cmp-modal-title');
    const typeBadge = document.getElementById('cmp-modal-type-badge');
    const leftPEl = document.getElementById('cmp-modal-left-p');
    const rightPEl = document.getElementById('cmp-modal-right-p');
    const extraTools = document.getElementById('cmp-modal-extra-tools');

    modal.classList.remove('hidden');
    modalBody.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
        <svg class="animate-spin h-8 w-8 text-indigo-500 mb-3" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span class="font-semibold">Cargando inspección de contenido bit-a-bit...</span>
      </div>
    `;

    const leftFull = item.left ? item.left.full_path : '';
    const rightFull = item.right ? item.right.full_path : '';

    if (titleEl) titleEl.innerText = (item.left ? item.left.rel_path : item.right.rel_path);
    if (leftPEl) leftPEl.innerText = leftFull;
    if (rightPEl) rightPEl.innerText = rightFull;
    if (extraTools) extraTools.innerHTML = '';

    try {
      const res = await fetch('/api/compare/file-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_path: leftFull,
          right_path: rightFull,
          diff_type: 'auto'
        })
      });
      const data = await res.json();
      this.renderDiffModalBody(data, leftFull, rightFull);
    } catch (e) {
      modalBody.innerHTML = `
        <div class="p-8 text-center text-red-400 text-xs">
          Error al comparar archivos: ${e.message}
        </div>
      `;
    }

    if (window.lucide) lucide.createIcons();
  }

  closeContentDiff() {
    const modal = document.getElementById('cmp-diff-modal');
    if (modal) modal.classList.add('hidden');
  }

  renderDiffModalBody(diffData, leftPath, rightPath) {
    const body = document.getElementById('cmp-modal-body');
    const typeBadge = document.getElementById('cmp-modal-type-badge');
    const extraTools = document.getElementById('cmp-modal-extra-tools');

    if (!diffData || diffData.error) {
      body.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">${diffData ? diffData.error : 'Error desconocido'}</div>`;
      return;
    }

    const type = diffData.type;
    if (typeBadge) typeBadge.innerText = type.toUpperCase();

    // 1. TEXT DIFF VIEWER
    if (type === 'text') {
      const pairs = diffData.pairs || [];
      body.innerHTML = `
        <div class="flex flex-col h-full font-mono text-xs select-text">
          <!-- Text Diff Stats Bar -->
          <div class="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] flex-shrink-0">
            <div class="flex items-center space-x-3">
              <span class="text-slate-400">Líneas Izq: <strong class="text-white">${diffData.total_lines_left}</strong></span>
              <span>•</span>
              <span class="text-slate-400">Líneas Der: <strong class="text-white">${diffData.total_lines_right}</strong></span>
              <span>•</span>
              <span class="text-emerald-400">+${diffData.added_count} añadidas</span>
              <span>•</span>
              <span class="text-red-400">-${diffData.deleted_count} eliminadas</span>
              <span>•</span>
              <span class="text-amber-400">~${diffData.modified_count} modificadas</span>
            </div>
            ${diffData.is_identical ? '<span class="text-emerald-400 font-bold">100% Idéntico</span>' : '<span class="text-red-400 font-bold">Contenido Diferente</span>'}
          </div>

          <!-- Dual Aligned Text Lines -->
          <div class="flex-1 overflow-auto divide-y divide-slate-800/40">
            ${pairs.map(p => {
              let tag = p.tag;
              let lBg = '';
              let rBg = '';
              if (tag === 'replace') {
                lBg = 'bg-amber-950/40 text-amber-200';
                rBg = 'bg-amber-950/40 text-amber-200';
              } else if (tag === 'delete') {
                lBg = 'bg-red-950/40 text-red-200';
                rBg = 'diff-blank-hatch opacity-40';
              } else if (tag === 'insert') {
                lBg = 'diff-blank-hatch opacity-40';
                rBg = 'bg-emerald-950/40 text-emerald-200';
              }
              return `
                <div class="grid grid-cols-2 divide-x divide-slate-800 text-[11px] leading-tight font-mono">
                  <div class="flex items-start px-2 py-0.5 ${lBg}">
                    <span class="w-10 text-right pr-2 text-slate-600 select-none flex-shrink-0">${p.left_num !== null ? p.left_num : ''}</span>
                    <pre class="overflow-x-auto whitespace-pre font-mono">${escapeHtml(p.left_text)}</pre>
                  </div>
                  <div class="flex items-start px-2 py-0.5 ${rBg}">
                    <span class="w-10 text-right pr-2 text-slate-600 select-none flex-shrink-0">${p.right_num !== null ? p.right_num : ''}</span>
                    <pre class="overflow-x-auto whitespace-pre font-mono">${escapeHtml(p.right_text)}</pre>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // 2. IMAGE SPLIT-SLIDER DIFF VIEWER
    else if (type === 'image') {
      const info = diffData.info || {};
      const leftUrl = `/api/preview?path=${encodeURIComponent(leftPath)}`;
      const rightUrl = `/api/preview?path=${encodeURIComponent(rightPath)}`;

      body.innerHTML = `
        <div class="flex flex-col h-full">
          <!-- Image Comparison Meta Header -->
          <div class="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs flex-shrink-0">
            <div class="flex items-center space-x-4">
              <div>
                <span class="text-indigo-400 font-bold">Izquierda:</span>
                <span class="text-slate-300 font-mono">${info.left_width}x${info.left_height} (${formatBytes(info.left_bytes)})</span>
              </div>
              <span>vs</span>
              <div>
                <span class="text-sky-400 font-bold">Derecha:</span>
                <span class="text-slate-300 font-mono">${info.right_width}x${info.right_height} (${formatBytes(info.right_bytes)})</span>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${info.same_dimensions ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
                ${info.same_dimensions ? 'Misma Resolución' : 'Diferente Resolución'}
              </span>
            </div>
            <div class="text-[11px] text-slate-400">
              💡 Arrastra la barra central para comparar pixeles antes/después
            </div>
          </div>

          <!-- Split Image Curtain Container -->
          <div class="flex-1 relative flex items-center justify-center p-4 overflow-hidden bg-slate-950">
            <div id="cmp-split-box" class="split-image-container relative max-w-full max-h-[70vh] aspect-auto border border-slate-800 rounded-xl overflow-hidden shadow-2xl select-none" style="cursor: ew-resize;">
              <!-- Base (Left Image) -->
              <img id="cmp-img-base" src="${leftUrl}" alt="Izquierda" class="max-w-full max-h-[70vh] object-contain block pointer-events-none">

              <!-- Overlay (Right Image) clipped -->
              <div id="cmp-img-overlay" class="absolute inset-0 overflow-hidden pointer-events-none" style="width: 50%;">
                <img src="${rightUrl}" alt="Derecha" class="max-w-none max-h-[70vh] object-contain block" style="width: 100%; height: 100%; object-fit: contain;">
              </div>

              <!-- Draggable Slider Handle -->
              <div id="cmp-slider-line" class="split-slider-line" style="left: 50%;">
                <div class="split-slider-handle">↔</div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Attach Split-Slider Drag Logic
      setTimeout(() => {
        const box = document.getElementById('cmp-split-box');
        const overlay = document.getElementById('cmp-img-overlay');
        const line = document.getElementById('cmp-slider-line');
        if (!box || !overlay || !line) return;

        let isDragging = false;
        const updateSplit = (clientX) => {
          const rect = box.getBoundingClientRect();
          let pos = (clientX - rect.left) / rect.width;
          pos = Math.max(0, Math.min(1, pos));
          const pct = (pos * 100).toFixed(1) + '%';
          overlay.style.width = pct;
          line.style.left = pct;
        };

        box.onmousedown = (e) => {
          isDragging = true;
          updateSplit(e.clientX);
        };
        window.onmousemove = (e) => {
          if (isDragging) updateSplit(e.clientX);
        };
        window.onmouseup = () => { isDragging = false; };

        // Touch support
        box.ontouchstart = (e) => {
          isDragging = true;
          if (e.touches[0]) updateSplit(e.touches[0].clientX);
        };
        window.ontouchmove = (e) => {
          if (isDragging && e.touches[0]) updateSplit(e.touches[0].clientX);
        };
        window.ontouchend = () => { isDragging = false; };
      }, 50);
    }

    // 3. ARCHIVE (ZIP) DIFF VIEWER
    else if (type === 'archive') {
      const items = diffData.items || [];
      body.innerHTML = `
        <div class="flex flex-col h-full font-mono text-xs">
          <div class="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] flex-shrink-0">
            <span class="text-slate-300">Total archivos internos en ZIP: <strong class="text-white">${diffData.total_items}</strong></span>
            <span class="text-slate-400">Inspección de miembros sin descomprimir en disco</span>
          </div>

          <div class="flex-1 overflow-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 sticky top-0">
                <tr>
                  <th class="p-2.5">Ruta Interna en ZIP</th>
                  <th class="p-2.5 text-center">Estado CRC</th>
                  <th class="p-2.5">Peso en Izq</th>
                  <th class="p-2.5">Peso en Der</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                ${items.map(it => {
                  let badge = 'bg-slate-800 text-slate-300';
                  if (it.status === 'identical') badge = 'bg-emerald-500/20 text-emerald-400';
                  else if (it.status === 'modified') badge = 'bg-red-500/20 text-red-400 font-bold';
                  else if (it.status === 'left_only') badge = 'bg-indigo-500/20 text-indigo-400';
                  else if (it.status === 'right_only') badge = 'bg-purple-500/20 text-purple-400';

                  return `
                    <tr class="hover:bg-slate-800/40">
                      <td class="p-2.5 font-sans font-medium text-slate-200">${it.name}</td>
                      <td class="p-2.5 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] uppercase ${badge}">${it.status}</span>
                      </td>
                      <td class="p-2.5 text-slate-400 font-mono">${it.left_size !== null ? formatBytes(it.left_size) : '—'}</td>
                      <td class="p-2.5 text-slate-400 font-mono">${it.right_size !== null ? formatBytes(it.right_size) : '—'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 4. BINARY / HEX DIFF VIEWER
    else {
      const leftHex = diffData.left_hex_sample || [];
      const rightHex = diffData.right_hex_sample || [];
      const offset = diffData.first_diff_offset;

      body.innerHTML = `
        <div class="flex flex-col h-full font-mono text-xs select-text">
          <div class="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] flex-shrink-0">
            <div class="flex items-center space-x-3">
              <span class="text-slate-400">Peso Izq: <strong class="text-white">${formatBytes(diffData.left_size)}</strong></span>
              <span>•</span>
              <span class="text-slate-400">Peso Der: <strong class="text-white">${formatBytes(diffData.right_size)}</strong></span>
              <span>•</span>
              <span class="${diffData.is_identical ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}">
                ${diffData.is_identical ? 'Contenido binario 100% exacto' : `Primer byte diferente en offset: 0x${offset !== -1 ? offset.toString(16).toUpperCase() : 'EOF'} (${offset})`}
              </span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">Offset 00-0F | Hexadecimal | ASCII</span>
          </div>

          <div class="flex-1 overflow-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 font-mono text-[11px] leading-relaxed">
            <!-- Left Hex Column -->
            <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800 overflow-x-auto">
              <div class="text-[10px] font-bold text-indigo-400 uppercase mb-2">Lado Izquierdo (Muestra Hexadecimal)</div>
              <pre class="text-slate-300 font-mono whitespace-pre">${leftHex.join('\n')}</pre>
            </div>

            <!-- Right Hex Column -->
            <div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800 overflow-x-auto">
              <div class="text-[10px] font-bold text-sky-400 uppercase mb-2">Lado Derecho (Muestra Hexadecimal)</div>
              <pre class="text-slate-300 font-mono whitespace-pre">${rightHex.join('\n')}</pre>
            </div>
          </div>
        </div>
      `;
    }
  }

  // =========================================================================
  // FOLDER SYNCHRONIZATION ENGINE (MIRROR & UPDATE)
  // =========================================================================

  openSyncDialog(mode) {
    const modal = document.getElementById('cmp-sync-modal');
    const titleEl = document.getElementById('cmp-sync-modal-title');
    const descEl = document.getElementById('cmp-sync-modal-desc');
    const confirmBtn = document.getElementById('cmp-sync-confirm-btn');

    this.leftPath = document.getElementById('cmp-left-path').value.trim();
    this.rightPath = document.getElementById('cmp-right-path').value.trim();

    if (!this.leftPath || !this.rightPath) {
      showToast("Especifica ambas carpetas antes de sincronizar", "error");
      return;
    }

    modal.classList.remove('hidden');

    if (mode === 'mirror') {
      titleEl.innerText = "Sincronización Espejo (Mirror Izq ➔ Der)";
      descEl.innerHTML = `
        <div><strong>Origen (Izq):</strong> <span class="text-indigo-300">${this.leftPath}</span></div>
        <div><strong>Destino (Der):</strong> <span class="text-sky-300">${this.rightPath}</span></div>
        <div class="text-amber-400 pt-1">
          • Copia a la derecha todos los archivos nuevos y modificados de la izquierda.<br>
          • Envía a la papelera los archivos huérfanos que existan en la derecha pero no en la izquierda.
        </div>
      `;
    } else {
      titleEl.innerText = "Actualizar Carpeta Destino (Update Izq ➔ Der)";
      descEl.innerHTML = `
        <div><strong>Origen (Izq):</strong> <span class="text-indigo-300">${this.leftPath}</span></div>
        <div><strong>Destino (Der):</strong> <span class="text-sky-300">${this.rightPath}</span></div>
        <div class="text-emerald-400 pt-1">
          • Copia a la derecha archivos faltantes o más recientes de la izquierda.<br>
          • Conserva intactos los archivos huérfanos que ya estén en la derecha.
        </div>
      `;
    }

    confirmBtn.onclick = () => {
      this.executeSync(mode);
    };

    if (window.lucide) lucide.createIcons();
  }

  async executeSync(mode, itemRelPaths = null) {
    document.getElementById('cmp-sync-modal').classList.add('hidden');
    showToast("Ejecutando sincronización de carpetas...", "info");

    try {
      const res = await fetch('/api/compare/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          left_path: this.leftPath,
          right_path: this.rightPath,
          mode: mode,
          item_rel_paths: itemRelPaths
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Sincronización completada: ${data.copied_count} copiados, ${data.recycled_count} reciclados`, "success");
        // Re-run comparison to see updated identical state
        this.runComparison(this.leftPath, this.rightPath);
      } else {
        showToast("Error en sincronización: " + (data.errors ? data.errors.join(', ') : 'Desconocido'), "error");
      }
    } catch (e) {
      showToast("Error al sincronizar: " + e.message, "error");
    }
  }

  async copyItem(relPathEncoded, mode) {
    const relPath = decodeURIComponent(relPathEncoded);
    showToast(`Copiando ${relPath}...`, "info");
    await this.executeSync(mode, [relPath]);
  }

  async recycleItem(fullPathEncoded) {
    const fullPath = decodeURIComponent(fullPathEncoded);
    if (!confirm(`¿Enviar a la papelera de reciclaje: ${fullPath}?`)) return;

    try {
      const res = await fetch('/api/files/recycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath })
      });
      if (res.ok) {
        showToast("Archivo enviado a la papelera de Windows", "success");
        this.runComparison(this.leftPath, this.rightPath);
      }
    } catch (e) {
      showToast("Error al reciclar: " + e.message, "error");
    }
  }

  async markRightAsDuplicate() {
    const rightP = document.getElementById('cmp-right-path').value.trim();
    if (!rightP) return;

    try {
      await fetch('/api/compare/mark-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: rightP, item_type: 'folder' })
      });
      showToast(`Marcada como Duplicado: ${rightP}`, "success");
      fetchDriveInfo();
    } catch (e) {
      showToast("Error al marcar duplicado: " + e.message, "error");
    }
  }

  async loadDriveDuplicates(force = false) {
    const container = document.getElementById('cmp-drive-dupes-list');
    if (!container) return;
    container.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs font-mono">Buscando duplicados en el disco...</div>`;

    try {
      const res = await fetch('/api/compare/drive-duplicates?root=E:\\');
      this.driveDuplicatesData = await res.json();
      this.renderDriveDuplicates();
    } catch (e) {
      container.innerHTML = `<div class="p-6 text-red-400 text-center text-xs">Error al cargar duplicados de disco.</div>`;
    }
  }

  renderDriveDuplicates() {
    const container = document.getElementById('cmp-drive-dupes-list');
    const data = this.driveDuplicatesData;
    if (!data || !container) return;

    const exacts = data.exact_duplicate_folders || [];
    const nears = data.near_duplicate_folders || [];

    if (exacts.length === 0 && nears.length === 0) {
      container.innerHTML = `
        <div class="p-10 text-center text-slate-500 text-xs">
          No se encontraron duplicados evidentes en el disco.
        </div>
      `;
      return;
    }

    let html = '';

    // Exact Duplicates
    if (exacts.length > 0) {
      html += `
        <div class="mb-5">
          <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Carpetas 100% Idénticas (${exacts.length})</span>
          </h4>
          <div class="space-y-2">
            ${exacts.map(item => `
              <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                <div class="min-w-0 pr-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">100% Match</span>
                    <h5 class="text-xs font-bold text-white truncate">${item.name}</h5>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mt-1 space-y-0.5">
                    <div>Original: <span class="text-slate-300">${item.folder_a}</span></div>
                    <div>Copia Duplicada: <span class="text-red-300">${item.folder_b}</span></div>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                  <button onclick="window.comparatorInstance.setPairAndCompare('${item.folder_a.replace(/\\/g, '\\\\')}', '${item.folder_b.replace(/\\/g, '\\\\')}')" 
                          class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1">
                    <i data-lucide="git-compare" class="w-3.5 h-3.5"></i>
                    <span>Comparar</span>
                  </button>
                  <button onclick="window.comparatorInstance.markDuplicate('${item.folder_b.replace(/\\/g, '\\\\')}')" 
                          class="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold">
                    Etiquetar Duplicado
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Near Duplicates
    if (nears.length > 0) {
      html += `
        <div>
          <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
            <span>Carpetas Casi Idénticas / Variantes (${nears.length})</span>
          </h4>
          <div class="space-y-2">
            ${nears.map(item => `
              <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                <div class="min-w-0 pr-3">
                  <div class="flex items-center space-x-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">${item.similarity}% Similar</span>
                    <h5 class="text-xs font-bold text-white truncate">${item.name}</h5>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono mt-1 space-y-0.5">
                    <div>Original: <span class="text-slate-300">${item.folder_a}</span></div>
                    <div>Variante: <span class="text-amber-300">${item.folder_b}</span></div>
                    <div class="text-[9px] text-slate-500">${item.identical_count} archivos iguales • ${item.diff_count} con cambios</div>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                  <button onclick="window.comparatorInstance.setPairAndCompare('${item.folder_a.replace(/\\/g, '\\\\')}', '${item.folder_b.replace(/\\/g, '\\\\')}')" 
                          class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1">
                    <i data-lucide="git-compare" class="w-3.5 h-3.5"></i>
                    <span>Ver Diferencias</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  setPairAndCompare(left, right) {
    document.getElementById('cmp-left-path').value = left;
    document.getElementById('cmp-right-path').value = right;
    document.getElementById('cmp-tab-side').click();
    this.runComparison(left, right);
  }

  async markDuplicate(path) {
    try {
      await fetch('/api/compare/mark-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, item_type: 'folder' })
      });
      showToast(`Marcado como Duplicado`, 'success');
      fetchDriveInfo();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.FolderComparator = FolderComparator;
