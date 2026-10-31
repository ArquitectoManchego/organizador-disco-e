/**
 * SwipeDrive - Tinder-style File & Image Organizer
 * Modes: Mover, Etiquetar, Borrar/Depurar
 * Accelerated drag physics, 4-edge targeting & Windows Recycle Bin integration
 */

class SwipeDriveOrganizer {
  constructor() {
    this.active = false;
    this.mode = 'delete'; // 'move', 'tag', 'delete'
    this.folderPath = 'E:\\';
    this.files = [];
    this.currentIndex = 0;
    this.historyStack = []; // For Undo functionality

    // Assigned slots for the 4 screen edges: { top, right, bottom, left }
    this.slots = {
      top: null,
      right: null,
      bottom: null,
      left: null
    };

    // Drag tracking & Tinder physics state
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.startTime = 0;
    this.dragDx = 0;
    this.dragDy = 0;

    this.overlayEl = null;
    this.activeCardEl = null;
    this.underCardEl = null;

    // Available folders cache for the picker
    this.pickerFolders = [];
  }

  /**
   * Opens the Setup Modal before entering fullscreen Swipe Mode
   */
  async openSetup(folderPath) {
    this.folderPath = folderPath || (window.state ? window.state.currentPath : 'E:\\');
    
    // Gather files in current folder
    if (window.state && window.state.currentFolderData && window.state.currentFolderData.files) {
      this.files = [...window.state.currentFolderData.files];
    } else {
      this.files = [];
    }

    if (this.files.length === 0) {
      showToast("No hay archivos en esta carpeta para organizar con Swipe", "error");
      return;
    }

    this.currentIndex = 0;
    this.historyStack = [];

    // Reset slots
    this.slots = { top: null, right: null, bottom: null, left: null };

    // Fetch popular folders for move mode picker
    try {
      const res = await fetch('/api/folders/picker');
      if (res.ok) {
        const data = await res.json();
        this.pickerFolders = data.folders || [];
      }
    } catch (e) {
      this.pickerFolders = [];
    }

    this.renderSetupModal();
  }

  renderSetupModal() {
    let modal = document.getElementById('swipe-setup-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'swipe-setup-modal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 md:p-4 select-none';
      document.body.appendChild(modal);
    }

    const folderName = this.folderPath.split('\\').filter(Boolean).pop() || 'Disco E:';

    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        
        <!-- Header -->
        <div class="p-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-rose-950/40 via-slate-900 to-indigo-950/40">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20 text-white">
              <i data-lucide="flame" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="text-sm font-black text-white tracking-wide">ORGANIZAR CON SWIPE</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">SwipeDrive</span>
              </div>
              <p class="text-xs text-slate-400 truncate max-w-xs font-mono">${folderName} (${this.files.length} archivos)</p>
            </div>
          </div>
          <button onclick="window.swipeOrganizer.closeSetup()" class="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Body / Mode Selection -->
        <div class="p-5 overflow-y-auto space-y-4 flex-1">
          <div>
            <label class="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">1. Selecciona el Modo de Organización</label>
            <div class="grid grid-cols-3 gap-2">
              <button type="button" onclick="window.swipeOrganizer.setSetupMode('move')" id="sw-btn-mode-move" 
                      class="sw-mode-btn p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1.5 ${this.mode === 'move' ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'}">
                <i data-lucide="folder-input" class="w-5 h-5 text-indigo-400"></i>
                <span class="text-xs font-bold">Mover</span>
                <span class="text-[9px] text-slate-400">1 a 4 carpetas</span>
              </button>

              <button type="button" onclick="window.swipeOrganizer.setSetupMode('tag')" id="sw-btn-mode-tag" 
                      class="sw-mode-btn p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1.5 ${this.mode === 'tag' ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'}">
                <i data-lucide="tag" class="w-5 h-5 text-purple-400"></i>
                <span class="text-xs font-bold">Etiquetar</span>
                <span class="text-[9px] text-slate-400">1 a 4 tags</span>
              </button>

              <button type="button" onclick="window.swipeOrganizer.setSetupMode('delete')" id="sw-btn-mode-delete" 
                      class="sw-mode-btn p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1.5 ${this.mode === 'delete' ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'}">
                <i data-lucide="trash-2" class="w-5 h-5 text-rose-400"></i>
                <span class="text-xs font-bold">Depurar</span>
                <span class="text-[9px] text-slate-400">Papelera / Mantener</span>
              </button>
            </div>
          </div>

          <!-- Mode Configuration Container -->
          <div id="sw-mode-config" class="bg-slate-950/80 rounded-2xl p-4 border border-slate-800">
            ${this.renderModeConfigHTML()}
          </div>
        </div>

        <!-- Footer / Start Button -->
        <div class="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <button onclick="window.swipeOrganizer.closeSetup()" class="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition">
            Cancelar
          </button>

          <button onclick="window.swipeOrganizer.startSwipeSession()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white text-xs font-black shadow-lg shadow-rose-500/30 flex items-center space-x-2 transition transform active:scale-95">
            <i data-lucide="play" class="w-4 h-4 fill-white"></i>
            <span>INICIAR MODO SWIPE</span>
          </button>
        </div>

      </div>
    `;

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  setSetupMode(m) {
    this.mode = m;
    this.slots = { top: null, right: null, bottom: null, left: null };

    // Auto-setup defaults for delete mode
    if (m === 'delete') {
      this.slots.right = { name: 'Mantener Archivo', action: 'keep' };
      this.slots.left = { name: 'A Papelera de Reciclaje', action: 'recycle' };
      this.slots.top = { name: 'Siguiente Archivo', action: 'skip' };
      this.slots.bottom = { name: 'Archivo Anterior', action: 'prev' };
    }

    this.renderSetupModal();
  }

  renderModeConfigHTML() {
    if (this.mode === 'move') {
      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-slate-200">Elige entre 1 y 4 carpetas de destino</h4>
            <span class="text-[10px] text-indigo-400 font-mono">Los 4 extremos de la pantalla</span>
          </div>
          <p class="text-[11px] text-slate-400">
            Asigna carpetas a los 4 extremos (Arriba, Derecha, Abajo, Izquierda). Al arrastrar el archivo hacia ese lado se moverá automáticamente.
          </p>

          <!-- 4 Edge Slots Display -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-sky-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
                <span>Arriba:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 font-mono text-[11px]">${this.slots.top ? this.slots.top.name : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>

            <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-emerald-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                <span>Derecha:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 font-mono text-[11px]">${this.slots.right ? this.slots.right.name : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>

            <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-amber-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                <span>Abajo:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 font-mono text-[11px]">${this.slots.bottom ? this.slots.bottom.name : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>

            <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-rose-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
                <span>Izquierda:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 font-mono text-[11px]">${this.slots.left ? this.slots.left.name : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>
          </div>

          <!-- Folder search & picker -->
          <div class="mt-2">
            <input type="text" id="sw-folder-search-input" oninput="window.swipeOrganizer.filterFolders(this.value)" placeholder="Buscar carpeta en disco E:..." 
                   class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2">
            
            <div id="sw-folder-picker-list" class="max-h-36 overflow-y-auto space-y-1 pr-1">
              ${this.renderFolderPickerOptions()}
            </div>
          </div>
        </div>
      `;
    }

    if (this.mode === 'tag') {
      const allTags = [];
      if (window.state && window.state.tags) {
        Object.values(window.state.tags).forEach(group => {
          if (Array.isArray(group)) allTags.push(...group);
        });
      }

      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-slate-200">Elige entre 1 y 4 etiquetas</h4>
            <button type="button" onclick="openNewTagModal()" class="text-[11px] text-indigo-400 hover:underline flex items-center space-x-1">
              <i data-lucide="plus" class="w-3 h-3"></i>
              <span>Crear Etiqueta</span>
            </button>
          </div>
          <p class="text-[11px] text-slate-400">
            Al arrastrar hacia una etiqueta se aplicará al archivo (puede tener varias). 
            <strong class="text-indigo-300">Toca en la derecha para avanzar o izquierda para retroceder</strong>.
          </p>

          <!-- 4 Tag Slots -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="p-2 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-sky-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
                <span>Arriba:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 text-[11px]">${this.slots.top ? `<span class="px-1.5 py-0.5 rounded text-[10px]" style="background:${this.slots.top.color}25; color:${this.slots.top.color}">${this.slots.top.name}</span>` : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>

            <div class="p-2 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-emerald-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                <span>Derecha:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 text-[11px]">${this.slots.right ? `<span class="px-1.5 py-0.5 rounded text-[10px]" style="background:${this.slots.right.color}25; color:${this.slots.right.color}">${this.slots.right.name}</span>` : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>

            <div class="p-2 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-amber-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-down" class="w-3.5 h-3.5"></i>
                <span>Abajo:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 text-[11px]">${this.slots.bottom ? `<span class="px-1.5 py-0.5 rounded text-[10px]" style="background:${this.slots.bottom.color}25; color:${this.slots.bottom.color}">${this.slots.bottom.name}</span>` : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>

            <div class="p-2 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
              <span class="text-rose-400 font-bold flex items-center space-x-1">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
                <span>Izquierda:</span>
              </span>
              <span class="truncate ml-2 text-slate-300 text-[11px]">${this.slots.left ? `<span class="px-1.5 py-0.5 rounded text-[10px]" style="background:${this.slots.left.color}25; color:${this.slots.left.color}">${this.slots.left.name}</span>` : '<span class="text-slate-600">(Vacío)</span>'}</span>
            </div>
          </div>

          <!-- Tags list to pick from -->
          <div class="mt-2 max-h-36 overflow-y-auto flex flex-wrap gap-1.5 p-1">
            ${allTags.map(t => `
              <button type="button" onclick="window.swipeOrganizer.assignTagSlot(${t.id}, '${t.name.replace(/'/g, "\\'")}', '${t.color}')" 
                      class="px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-medium hover:border-indigo-500 transition flex items-center space-x-1" 
                      style="color: ${t.color}">
                <span class="w-2 h-2 rounded-full" style="background-color: ${t.color}"></span>
                <span>${t.name}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Default: 'delete' (Depurar / Papelera)
    return `
      <div class="space-y-3">
        <h4 class="text-xs font-bold text-slate-200">Controles del Modo Depuración (Tinder Style):</h4>
        
        <div class="space-y-2 text-xs">
          <div class="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-between">
            <span class="text-emerald-400 font-bold flex items-center space-x-2">
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
              <span>Swipe DERECHA</span>
            </span>
            <span class="px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300">MANTENER ARCHIVO</span>
          </div>

          <div class="p-2.5 rounded-xl bg-slate-900 border border-rose-500/30 flex items-center justify-between">
            <span class="text-rose-400 font-bold flex items-center space-x-2">
              <i data-lucide="arrow-left" class="w-4 h-4"></i>
              <span>Swipe IZQUIERDA</span>
            </span>
            <span class="px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300">MANDAR A PAPELERA</span>
          </div>

          <div class="p-2.5 rounded-xl bg-slate-900 border border-sky-500/30 flex items-center justify-between">
            <span class="text-sky-400 font-bold flex items-center space-x-2">
              <i data-lucide="arrow-up" class="w-4 h-4"></i>
              <span>Swipe ARRIBA</span>
            </span>
            <span class="px-2 py-0.5 rounded font-bold bg-sky-500/20 text-sky-300">SIGUIENTE ARCHIVO</span>
          </div>

          <div class="p-2.5 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-between">
            <span class="text-amber-400 font-bold flex items-center space-x-2">
              <i data-lucide="arrow-down" class="w-4 h-4"></i>
              <span>Swipe ABAJO</span>
            </span>
            <span class="px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300">ARCHIVO ANTERIOR</span>
          </div>
        </div>

        <div class="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/40 text-[11px] text-slate-300 flex items-start space-x-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"></i>
          <span>
            <strong>Seguro:</strong> Los archivos no se borran permanentemente. Se envían a la <strong>Papelera de Reciclaje de Windows</strong> y quedan registrados en el módulo <strong>Papelera</strong> para consultarlos.
          </span>
        </div>
      </div>
    `;
  }

  renderFolderPickerOptions(folders) {
    const list = folders || this.pickerFolders;
    if (!list || list.length === 0) {
      return '<div class="text-xs text-slate-500 p-2">Escribe para buscar carpetas...</div>';
    }

    return list.slice(0, 15).map(f => `
      <div class="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 flex items-center justify-between transition">
        <div class="min-w-0 pr-2">
          <div class="font-medium text-xs text-slate-200 truncate">${f.name}</div>
          <div class="text-[10px] text-slate-500 truncate font-mono">${f.path}</div>
        </div>
        <div class="flex items-center space-x-1 flex-shrink-0">
          <button type="button" onclick="window.swipeOrganizer.assignFolderSlot('${f.path.replace(/\\/g, '\\\\')}', '${f.name.replace(/'/g, "\\'")}', 'top')" class="p-1 rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white text-[10px]" title="Asignar Arriba">↑</button>
          <button type="button" onclick="window.swipeOrganizer.assignFolderSlot('${f.path.replace(/\\/g, '\\\\')}', '${f.name.replace(/'/g, "\\'")}', 'right')" class="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white text-[10px]" title="Asignar Derecha">→</button>
          <button type="button" onclick="window.swipeOrganizer.assignFolderSlot('${f.path.replace(/\\/g, '\\\\')}', '${f.name.replace(/'/g, "\\'")}', 'bottom')" class="p-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white text-[10px]" title="Asignar Abajo">↓</button>
          <button type="button" onclick="window.swipeOrganizer.assignFolderSlot('${f.path.replace(/\\/g, '\\\\')}', '${f.name.replace(/'/g, "\\'")}', 'left')" class="p-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white text-[10px]" title="Asignar Izquierda">←</button>
        </div>
      </div>
    `).join('');
  }

  async filterFolders(query) {
    if (!query) {
      document.getElementById('sw-folder-picker-list').innerHTML = this.renderFolderPickerOptions(this.pickerFolders);
      return;
    }
    try {
      const res = await fetch(`/api/folders/picker?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const el = document.getElementById('sw-folder-picker-list');
        if (el) el.innerHTML = this.renderFolderPickerOptions(data.folders || []);
      }
    } catch (e) {}
  }

  assignFolderSlot(path, name, preferredEdge = null) {
    // If preferredEdge given, assign to that edge
    const edges = ['top', 'right', 'bottom', 'left'];
    if (preferredEdge && edges.includes(preferredEdge)) {
      this.slots[preferredEdge] = { path, name };
      this.renderSetupModal();
      return;
    }

    // Otherwise assign to first empty slot
    const emptyEdge = edges.find(e => !this.slots[e]);
    if (emptyEdge) {
      this.slots[emptyEdge] = { path, name };
    } else {
      // Overwrite top
      this.slots.top = { path, name };
    }
    this.renderSetupModal();
  }

  assignTagSlot(id, name, color) {
    const edges = ['top', 'right', 'bottom', 'left'];
    // Find if already assigned
    const existing = edges.find(e => this.slots[e] && this.slots[e].id === id);
    if (existing) {
      this.slots[existing] = null;
      this.renderSetupModal();
      return;
    }

    const emptyEdge = edges.find(e => !this.slots[e]);
    if (emptyEdge) {
      this.slots[emptyEdge] = { id, name, color };
    } else {
      this.slots.top = { id, name, color };
    }
    this.renderSetupModal();
  }

  closeSetup() {
    const modal = document.getElementById('swipe-setup-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Starts the fullscreen Tinder-style Swipe Experience
   */
  startSwipeSession() {
    // Validation
    if (this.mode === 'move') {
      const assigned = Object.values(this.slots).filter(Boolean);
      if (assigned.length === 0) {
        showToast("Selecciona al menos 1 carpeta de destino para los extremos", "error");
        return;
      }
    } else if (this.mode === 'tag') {
      const assigned = Object.values(this.slots).filter(Boolean);
      if (assigned.length === 0) {
        showToast("Selecciona al menos 1 etiqueta para asignar", "error");
        return;
      }
    }

    this.closeSetup();
    this.active = true;
    this.currentIndex = 0;
    this.historyStack = [];

    this.renderFullscreenOverlay();
  }

  renderFullscreenOverlay() {
    let overlay = document.getElementById('swipedrive-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'swipedrive-overlay';
      overlay.className = 'fixed inset-0 z-50 bg-slate-950 flex flex-col select-none touch-none overflow-hidden';
      document.body.appendChild(overlay);
    }

    const modeLabels = {
      move: '📁 MODO MOVER',
      tag: '🏷️ MODO ETIQUETAR',
      delete: '🗑️ MODO DEPURACIÓN'
    };

    overlay.innerHTML = `
      <!-- TOP HEADER -->
      <div class="h-14 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between z-30 flex-shrink-0">
        <div class="flex items-center space-x-2">
          <span class="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 tracking-wider">
            ${modeLabels[this.mode]}
          </span>
          <span id="sw-counter-text" class="text-xs font-mono text-slate-300">
            ${this.currentIndex + 1} / ${this.files.length}
          </span>
        </div>

        <!-- Center Progress bar -->
        <div class="hidden sm:block w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div id="sw-progress-fill" class="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full transition-all duration-300" style="width: ${(1 / this.files.length) * 100}%"></div>
        </div>

        <!-- Exit button -->
        <button onclick="window.swipeOrganizer.exitSwipeSession()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center space-x-1.5 transition">
          <i data-lucide="x" class="w-4 h-4"></i>
          <span class="hidden sm:inline">Finalizar</span>
        </button>
      </div>

      <!-- VIEWPORT FOR THE 4 EDGES & CARD STACK -->
      <div class="relative flex-1 flex items-center justify-center p-3 md:p-6 overflow-hidden tinder-viewport" id="tinder-viewport">
        
        <!-- 4 Screen Edge Glow Indicators -->
        <div id="edge-glow-top" class="edge-glow absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-sky-500/40 to-transparent opacity-0 flex items-start justify-center pt-2 z-20">
          <div class="px-4 py-1 rounded-full bg-sky-950/90 border border-sky-400 text-sky-300 text-xs font-black shadow-xl">
            ${this.getEdgeLabel('top')}
          </div>
        </div>

        <div id="edge-glow-right" class="edge-glow absolute right-0 inset-y-0 w-20 bg-gradient-to-l from-emerald-500/40 to-transparent opacity-0 flex items-center justify-end pr-2 z-20">
          <div class="px-3 py-2 rounded-2xl bg-emerald-950/90 border border-emerald-400 text-emerald-300 text-xs font-black shadow-xl text-center">
            ${this.getEdgeLabel('right')}
          </div>
        </div>

        <div id="edge-glow-bottom" class="edge-glow absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-amber-500/40 to-transparent opacity-0 flex items-end justify-center pb-2 z-20">
          <div class="px-4 py-1 rounded-full bg-amber-950/90 border border-amber-400 text-amber-300 text-xs font-black shadow-xl">
            ${this.getEdgeLabel('bottom')}
          </div>
        </div>

        <div id="edge-glow-left" class="edge-glow absolute left-0 inset-y-0 w-20 bg-gradient-to-r from-rose-500/40 to-transparent opacity-0 flex items-center justify-start pl-2 z-20">
          <div class="px-3 py-2 rounded-2xl bg-rose-950/90 border border-rose-400 text-rose-300 text-xs font-black shadow-xl text-center">
            ${this.getEdgeLabel('left')}
          </div>
        </div>

        <!-- Tap navigation hint for Tag mode -->
        ${this.mode === 'tag' ? `
          <div class="absolute inset-y-0 left-0 w-1/3 z-10 flex items-center justify-start pl-4 pointer-events-none tap-zone-hint">
            <span class="px-2 py-1 rounded bg-black/60 text-slate-300 text-[10px] font-bold">← Toca para Anterior</span>
          </div>
          <div class="absolute inset-y-0 right-0 w-1/3 z-10 flex items-center justify-end pr-4 pointer-events-none tap-zone-hint">
            <span class="px-2 py-1 rounded bg-black/60 text-slate-300 text-[10px] font-bold">Toca para Siguiente →</span>
          </div>
        ` : ''}

        <!-- CARD CONTAINER -->
        <div class="relative w-full max-w-sm md:max-w-md h-[64vh] md:h-[68vh] flex items-center justify-center" id="card-stage">
          <!-- Active Card (top) and Background Card (under) rendered dynamically -->
        </div>

      </div>

      <!-- BOTTOM ACTION DOCK -->
      <div class="h-20 border-t border-slate-800/80 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-center space-x-3 sm:space-x-5 z-30 flex-shrink-0">
        
        <!-- Undo button -->
        <button onclick="window.swipeOrganizer.triggerUndo()" class="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-400 border border-slate-700 flex items-center justify-center shadow-lg transition" title="Deshacer última acción (Undo)">
          <i data-lucide="rotate-ccw" class="w-5 h-5"></i>
        </button>

        <!-- Left Button -->
        <button onclick="window.swipeOrganizer.triggerDirectionalAction('left')" class="w-14 h-14 rounded-2xl bg-rose-600/20 hover:bg-rose-600 active:scale-95 text-rose-400 hover:text-white border border-rose-500/40 flex items-center justify-center shadow-lg transition" title="${this.getEdgeLabel('left')}">
          <i data-lucide="arrow-left" class="w-6 h-6"></i>
        </button>

        <!-- Down Button -->
        <button onclick="window.swipeOrganizer.triggerDirectionalAction('bottom')" class="w-12 h-12 rounded-2xl bg-amber-600/20 hover:bg-amber-600 active:scale-95 text-amber-400 hover:text-white border border-amber-500/40 flex items-center justify-center shadow-lg transition" title="${this.getEdgeLabel('bottom')}">
          <i data-lucide="arrow-down" class="w-5 h-5"></i>
        </button>

        <!-- Up Button -->
        <button onclick="window.swipeOrganizer.triggerDirectionalAction('top')" class="w-12 h-12 rounded-2xl bg-sky-600/20 hover:bg-sky-600 active:scale-95 text-sky-400 hover:text-white border border-sky-500/40 flex items-center justify-center shadow-lg transition" title="${this.getEdgeLabel('top')}">
          <i data-lucide="arrow-up" class="w-5 h-5"></i>
        </button>

        <!-- Right Button -->
        <button onclick="window.swipeOrganizer.triggerDirectionalAction('right')" class="w-14 h-14 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600 active:scale-95 text-emerald-400 hover:text-white border border-emerald-500/40 flex items-center justify-center shadow-lg transition" title="${this.getEdgeLabel('right')}">
          <i data-lucide="arrow-right" class="w-6 h-6"></i>
        </button>

      </div>
    `;

    overlay.classList.remove('hidden');
    this.overlayEl = overlay;
    this.renderCardStack();
    if (window.lucide) lucide.createIcons();
  }

  getEdgeLabel(edge) {
    const slot = this.slots[edge];
    if (!slot) return 'Sin asignar';
    if (this.mode === 'move') {
      return `📁 ${slot.name}`;
    }
    if (this.mode === 'tag') {
      return `🏷️ ${slot.name}`;
    }
    // Delete mode
    if (edge === 'right') return '✓ MANTENER';
    if (edge === 'left') return '🗑️ A PAPELERA';
    if (edge === 'top') return '⬆️ SIGUIENTE';
    if (edge === 'bottom') return '⬇️ ANTERIOR';
    return slot.name;
  }

  renderCardStack() {
    const stage = document.getElementById('card-stage');
    if (!stage) return;

    if (this.currentIndex >= this.files.length) {
      // Completed all items!
      stage.innerHTML = `
        <div class="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center max-w-sm shadow-2xl animate-slide-up">
          <div class="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-500 to-sky-400 flex items-center justify-center text-white mb-4 shadow-xl">
            <i data-lucide="check-check" class="w-8 h-8"></i>
          </div>
          <h3 class="text-lg font-black text-white mb-2">¡Carpeta Organizada!</h3>
          <p class="text-xs text-slate-400 mb-6">Has revisado todos los archivos de esta carpeta.</p>
          <button onclick="window.swipeOrganizer.exitSwipeSession()" class="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition">
            Volver al Explorador
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const currentFile = this.files[this.currentIndex];
    const nextFile = this.files[this.currentIndex + 1];

    stage.innerHTML = `
      ${nextFile ? this.buildCardHTML(nextFile, 'card-under') : ''}
      ${this.buildCardHTML(currentFile, 'card-active')}
    `;

    this.activeCardEl = stage.querySelector('.card-active');
    this.underCardEl = stage.querySelector('.card-under');

    // Bind Tinder swipe physics listeners
    if (this.activeCardEl) {
      this.bindDragEvents(this.activeCardEl);
    }

    // Update Counter & Progress
    const counterEl = document.getElementById('sw-counter-text');
    if (counterEl) {
      counterEl.innerText = `${this.currentIndex + 1} / ${this.files.length}`;
    }
    const progEl = document.getElementById('sw-progress-fill');
    if (progEl) {
      progEl.style.width = `${((this.currentIndex + 1) / this.files.length) * 100}%`;
    }

    if (window.lucide) lucide.createIcons();
  }

  buildCardHTML(file, extraClass) {
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(file.extension ? file.extension.toLowerCase() : '');
    const isUnder = extraClass.includes('card-under');
    const previewSrc = isImage 
      ? (window.API_BASE ? `${window.API_BASE.replace(/\/$/, '')}/api/preview?path=${encodeURIComponent(file.path)}` : `/api/preview?path=${encodeURIComponent(file.path)}`) 
      : null;

    return `
      <div class="tinder-card ${extraClass} absolute inset-0 rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col user-select-none" data-path="${file.path.replace(/"/g, '&quot;')}">
        
        <!-- Media Container -->
        <div class="relative flex-1 bg-black/60 flex items-center justify-center overflow-hidden">
          ${isImage ? `
            <img src="${previewSrc}" alt="${file.name}" class="w-full h-full object-contain pointer-events-none select-none" loading="${isUnder ? 'lazy' : 'eager'}" onerror="this.src='/static/style.css'; this.classList.add('hidden');">
          ` : `
            <div class="flex flex-col items-center justify-center p-6 text-center select-none">
              <div class="w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
                <i data-lucide="${getFileIcon(file.extension)}" class="w-10 h-10"></i>
              </div>
              <span class="text-xs font-mono text-slate-400 uppercase tracking-widest font-bold">${file.extension || 'ARCHIVO'}</span>
            </div>
          `}

          <!-- Stamp Badges Overlay (Tinder Style) -->
          <div class="stamp-badge tinder-stamp tinder-stamp-right text-emerald-400 border-emerald-400 -rotate-12 absolute top-6 right-6 px-4 py-1.5 rounded-xl border-4 text-sm md:text-base opacity-0">
            ${this.mode === 'delete' ? 'MANTENER' : (this.slots.right ? this.slots.right.name : 'DERECHA')}
          </div>

          <div class="stamp-badge tinder-stamp tinder-stamp-left text-rose-500 border-rose-500 rotate-12 absolute top-6 left-6 px-4 py-1.5 rounded-xl border-4 text-sm md:text-base opacity-0">
            ${this.mode === 'delete' ? 'PAPELERA' : (this.slots.left ? this.slots.left.name : 'IZQUIERDA')}
          </div>

          <div class="stamp-badge tinder-stamp tinder-stamp-top text-sky-400 border-sky-400 absolute top-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl border-4 text-sm md:text-base opacity-0">
            ${this.mode === 'delete' ? 'SIGUIENTE' : (this.slots.top ? this.slots.top.name : 'ARRIBA')}
          </div>

          <div class="stamp-badge tinder-stamp tinder-stamp-bottom text-amber-400 border-amber-400 absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl border-4 text-sm md:text-base opacity-0">
            ${this.mode === 'delete' ? 'ANTERIOR' : (this.slots.bottom ? this.slots.bottom.name : 'ABAJO')}
          </div>
        </div>

        <!-- Card Footer Info -->
        <div class="p-3.5 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-between z-20">
          <div class="min-w-0 pr-2">
            <h4 class="text-xs font-bold text-white truncate">${file.name}</h4>
            <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-0.5">
              <span>${formatBytes(file.size_bytes)}</span>
              <span>•</span>
              <span class="truncate">${file.folder_path || ''}</span>
            </div>
          </div>

          <div class="flex items-center space-x-1 flex-shrink-0">
            ${(file.tags || []).slice(0, 2).map(t => `
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold" style="background:${t.color}25; color:${t.color}">
                ${t.name}
              </span>
            `).join('')}
          </div>
        </div>

      </div>
    `;
  }

  /**
   * Binds Touch and Pointer events with Non-linear Accelerated Tinder Physics
   */
  bindDragEvents(cardEl) {
    const onStart = (clientX, clientY) => {
      this.isDragging = true;
      this.startX = clientX;
      this.startY = clientY;
      this.currentX = clientX;
      this.currentY = clientY;
      this.startTime = Date.now();
      cardEl.style.transition = 'none';
    };

    const onMove = (clientX, clientY) => {
      if (!this.isDragging) return;
      this.currentX = clientX;
      this.currentY = clientY;

      const rawDx = this.currentX - this.startX;
      const rawDy = this.currentY - this.startY;
      const rawDist = Math.hypot(rawDx, rawDy);

      // NON-LINEAR ACCELERATION FORMULA:
      // Small displacement begins smooth, accelerating rapidly with distance
      // "arrastrarlo hacia la derecha por 10 pixeles hará que se desplace 20 pixeles"
      const accelX = 1.7 + Math.min(Math.abs(rawDx) / 120, 1.5);
      const accelY = 1.7 + Math.min(Math.abs(rawDy) / 120, 1.5);

      const renderX = rawDx * accelX;
      const renderY = rawDy * accelY;
      this.dragDx = renderX;
      this.dragDy = renderY;

      // Rotation synchronized with lateral drag
      const rotation = (renderX / (window.innerWidth * 0.45)) * 26;

      cardEl.style.transform = `translate3d(${renderX}px, ${renderY}px, 0) rotate(${rotation}deg)`;

      // Update stamp badge overlays and edge glows based on dominant direction
      this.updateDragFeedback(renderX, renderY, rawDist);
    };

    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;

      const rawDx = this.currentX - this.startX;
      const rawDy = this.currentY - this.startY;
      const rawDist = Math.hypot(rawDx, rawDy);
      const duration = Date.now() - this.startTime;

      // TAP DETECTION:
      if (rawDist < 15 && duration < 300) {
        // In Tag mode: Right side tap = next file, Left side tap = prev file
        if (this.mode === 'tag') {
          const rect = cardEl.getBoundingClientRect();
          const clickOffset = this.currentX - rect.left;
          if (clickOffset > rect.width * 0.6) {
            this.advanceCard(1); // Next
            return;
          } else if (clickOffset < rect.width * 0.4) {
            this.advanceCard(-1); // Prev
            return;
          }
        }
      }

      // THRESHOLD FOR SWIPE TRIGGER:
      const threshold = 80;
      const velocity = rawDist / (duration || 1);
      const passed = (Math.abs(this.dragDx) > threshold || Math.abs(this.dragDy) > threshold || velocity > 0.45);

      if (passed) {
        // Determine dominant direction: right, left, top, bottom
        const isHoriz = Math.abs(this.dragDx) > Math.abs(this.dragDy);
        let direction = '';
        if (isHoriz) {
          direction = this.dragDx > 0 ? 'right' : 'left';
        } else {
          direction = this.dragDy > 0 ? 'bottom' : 'top';
        }

        this.executeSwipeFlyOut(cardEl, direction);
      } else {
        // Spring back smoothly to center
        this.springBack(cardEl);
      }

      this.resetEdgeGlows();
    };

    // Touch events for Mobile
    cardEl.ontouchstart = (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    window.ontouchmove = (e) => {
      if (this.isDragging && e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    window.ontouchend = () => {
      if (this.isDragging) onEnd();
    };

    // Mouse events for Desktop
    cardEl.onmousedown = (e) => {
      if (e.button === 0) {
        onStart(e.clientX, e.clientY);
      }
    };
    window.onmousemove = (e) => {
      if (this.isDragging) {
        onMove(e.clientX, e.clientY);
      }
    };
    window.onmouseup = () => {
      if (this.isDragging) onEnd();
    };
  }

  updateDragFeedback(dx, dy, rawDist) {
    const isHoriz = Math.abs(dx) > Math.abs(dy);
    const alpha = Math.min(1, Math.max(0, (rawDist - 15) / 75));

    // Stamps
    const stampRight = this.activeCardEl.querySelector('.tinder-stamp-right');
    const stampLeft = this.activeCardEl.querySelector('.tinder-stamp-left');
    const stampTop = this.activeCardEl.querySelector('.tinder-stamp-top');
    const stampBottom = this.activeCardEl.querySelector('.tinder-stamp-bottom');

    [stampRight, stampLeft, stampTop, stampBottom].forEach(s => {
      if (s) s.style.opacity = '0';
    });

    // Reset edge glows
    const glowTop = document.getElementById('edge-glow-top');
    const glowRight = document.getElementById('edge-glow-right');
    const glowBottom = document.getElementById('edge-glow-bottom');
    const glowLeft = document.getElementById('edge-glow-left');

    [glowTop, glowRight, glowBottom, glowLeft].forEach(g => {
      if (g) g.style.opacity = '0';
    });

    if (rawDist < 15) return;

    if (isHoriz) {
      if (dx > 0) {
        if (stampRight) stampRight.style.opacity = alpha;
        if (glowRight) glowRight.style.opacity = alpha;
      } else {
        if (stampLeft) stampLeft.style.opacity = alpha;
        if (glowLeft) glowLeft.style.opacity = alpha;
      }
    } else {
      if (dy < 0) {
        if (stampTop) stampTop.style.opacity = alpha;
        if (glowTop) glowTop.style.opacity = alpha;
      } else {
        if (stampBottom) stampBottom.style.opacity = alpha;
        if (glowBottom) glowBottom.style.opacity = alpha;
      }
    }
  }

  resetEdgeGlows() {
    ['edge-glow-top', 'edge-glow-right', 'edge-glow-bottom', 'edge-glow-left'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = '0';
    });
  }

  springBack(cardEl) {
    cardEl.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
    const stamps = cardEl.querySelectorAll('.stamp-badge');
    stamps.forEach(s => s.style.opacity = '0');
  }

  /**
   * Executes the Fly-Out animation and triggers the corresponding action
   */
  async executeSwipeFlyOut(cardEl, direction) {
    if (navigator.vibrate) navigator.vibrate(25); // Subtle haptic buzz on mobile

    const flyDistance = window.innerWidth * 1.5;
    let targetX = 0;
    let targetY = 0;
    let targetRot = 0;

    if (direction === 'right') {
      targetX = flyDistance;
      targetRot = 35;
    } else if (direction === 'left') {
      targetX = -flyDistance;
      targetRot = -35;
    } else if (direction === 'top') {
      targetY = -flyDistance;
    } else if (direction === 'bottom') {
      targetY = flyDistance;
    }

    // In 'tag' mode, the user requested:
    // "al arrastrarlas hacia una de las etiquetas se etiquetara y puede tener más de una etiqueta, 
    // para avanzar al siguiente archivo se va a dar un toque en la pantalla en el extremo derecho o izquierdo para ir hacia atras o hacia adelante."
    // So in tag mode, we apply the tag, flash a stamp, and spring back so they can apply a second tag if desired!
    if (this.mode === 'tag') {
      await this.handleAction(direction);
      this.springBack(cardEl);
      return;
    }

    // Fly off screen smoothly
    cardEl.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.32s ease';
    cardEl.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) rotate(${targetRot}deg)`;
    cardEl.style.opacity = '0';

    // Under card smoothly comes forward
    if (this.underCardEl) {
      this.underCardEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      this.underCardEl.style.transform = 'scale(1) translateY(0)';
      this.underCardEl.style.opacity = '1';
    }

    // Trigger Action & Advance
    setTimeout(async () => {
      await this.handleAction(direction);
      this.advanceCard(1);
    }, 280);
  }

  /**
   * Triggers action from bottom buttons or keyboard
   */
  triggerDirectionalAction(direction) {
    if (!this.activeCardEl) return;
    this.executeSwipeFlyOut(this.activeCardEl, direction);
  }

  /**
   * Handles action execution: Move, Tag, or Recycle
   */
  async handleAction(direction) {
    const currentFile = this.files[this.currentIndex];
    if (!currentFile) return;

    if (this.mode === 'delete') {
      if (direction === 'right') {
        // MANTENER
        this.historyStack.push({ type: 'keep', file: currentFile });
        showToast(`Mantener: ${currentFile.name}`, "info");
      } else if (direction === 'left') {
        // PAPELERA
        await this.recycleFile(currentFile);
      } else if (direction === 'top') {
        // SIGUIENTE
        this.historyStack.push({ type: 'skip', file: currentFile });
      } else if (direction === 'bottom') {
        // ANTERIOR
        this.advanceCard(-1);
      }
    } else if (this.mode === 'move') {
      const slot = this.slots[direction];
      if (slot && slot.path) {
        await this.moveFile(currentFile, slot.path, slot.name);
      } else {
        showToast("Extremo no asignado", "info");
      }
    } else if (this.mode === 'tag') {
      const slot = this.slots[direction];
      if (slot && slot.id) {
        await this.tagFile(currentFile, slot.id, slot.name);
      } else {
        showToast("Extremo no asignado", "info");
      }
    }
  }

  async recycleFile(file) {
    try {
      const res = await fetch('/api/files/recycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path })
      });
      if (res.ok) {
        this.historyStack.push({ type: 'recycle', file: file });
        showToast(`🗑️ Enviado a Papelera: ${file.name}`, "success");
      } else {
        throw new Error("Error en servidor");
      }
    } catch (e) {
      showToast(`Error al reciclar ${file.name}: ${e.message}`, "error");
    }
  }

  async moveFile(file, destFolder, destName) {
    try {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src_path: file.path, dest_folder: destFolder })
      });
      if (res.ok) {
        const data = await res.json();
        this.historyStack.push({ type: 'move', file: file, old_path: file.path, new_path: data.new_path, destFolder });
        showToast(`📁 Movido a ${destName}: ${file.name}`, "success");
      } else {
        throw new Error("No se pudo mover archivo");
      }
    } catch (e) {
      showToast(`Error al mover: ${e.message}`, "error");
    }
  }

  async tagFile(file, tagId, tagName) {
    try {
      const res = await fetch('/api/files/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, tag_id: tagId })
      });
      if (res.ok) {
        showToast(`🏷️ Etiquetado con "${tagName}"`, "success");
        // Update tags on file object
        if (!file.tags) file.tags = [];
        if (!file.tags.some(t => t.id === tagId)) {
          file.tags.push({ id: tagId, name: tagName, color: '#6366f1' });
        }
      }
    } catch (e) {
      showToast(`Error al etiquetar: ${e.message}`, "error");
    }
  }

  advanceCard(step) {
    this.currentIndex += step;
    if (this.currentIndex < 0) this.currentIndex = 0;
    this.renderCardStack();
  }

  triggerUndo() {
    if (this.historyStack.length === 0) {
      showToast("No hay acciones recientes para deshacer", "info");
      return;
    }
    const last = this.historyStack.pop();
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
    this.renderCardStack();
    showToast(`Deshecho: ${last.file.name}`, "info");
  }

  exitSwipeSession() {
    this.active = false;
    if (this.overlayEl) {
      this.overlayEl.classList.add('hidden');
    }
    // Refresh folder view
    if (window.loadFolder && window.state) {
      window.loadFolder(window.state.currentPath);
    }
    showToast("Sesión de Swipe finalizada", "info");
  }
}

// Global Singleton Instance
window.swipeOrganizer = new SwipeDriveOrganizer();

function openSwipeSetupModal() {
  window.swipeOrganizer.openSetup();
}
