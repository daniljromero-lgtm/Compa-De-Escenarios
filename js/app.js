/* ==========================================================
   CANCIONERO - COMPAÑERO DE ESCENARIO
   Versión 2.5 STABLE
   Archivo principal de lógica (app.js)
========================================================== */

/* ==========================================================
   FIREBASE
========================================================== */

// Inicializar Cloud Firestore (Usando el objeto expuesto globalmente)
const db = firebase.firestore();

/* ==========================================================
   ESTADO GLOBAL DE LA APLICACIÓN
========================================================== */
let songsArray = [];
let currentGenreFilter = 'chacarera';
let showSetlistIds = [];
let screenHistory = ['screen-main-menu'];
let autoStartScroll = false;

/* ===================== PANTALLA COMPLETA ===================== */

window.enterFullscreen = async function () {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  } catch (e) {
    console.log("Fullscreen no disponible:", e);
  }
}

window.exitFullscreen = async function () {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    } else if (document.msFullscreenElement) {
      document.msExitFullscreen();
    }
  } catch (e) {
    console.log("No se pudo salir del modo pantalla completa:", e);
  }
}

// ===== MODO EDICIÓN =====
let editingSongId = null;
let editingSongData = null;

// Control de Vivo / Ensayo
let currentLiveIndex = 0;
let isAutoscrolling = false;
let autoscrollInterval = null;
let scrollSpeed = 22; 
let currentFontSize = 20;
let triggerNextOnNextScroll = false;
let currentSong = null;

/* ===================== NAVEGACIÓN UNIFICADA ===================== */
window.showScreen = function(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const activeScreen = document.getElementById(screenId);
  if(activeScreen) activeScreen.classList.add('active');

  const backBtn = document.getElementById('global-back-btn');
  const addBtn = document.getElementById('header-add-btn');
  const headerTitle = document.getElementById('main-header-title');

  if (screenId === 'screen-main-menu') {
    if (backBtn) backBtn.style.display = 'none';
    if (addBtn) addBtn.style.display = 'none';
    if (headerTitle) headerTitle.innerText = "Cancionero";
  } else {
    if (backBtn) backBtn.style.display = 'block';
    if (screenId === 'screen-cancionero-list') {
      if (addBtn) addBtn.style.display = 'block';
      if (headerTitle) headerTitle.innerText = "Cancionero";
    } else if (screenId === 'screen-add-song') {
      if (addBtn) addBtn.style.display = 'none';
      if (headerTitle) headerTitle.innerText = "Nueva Canción";
    } else if (screenId === 'screen-shows-repertoire') {
      if (addBtn) addBtn.style.display = 'none';
      if (headerTitle) headerTitle.innerText = "Shows en Vivo";
    } else if (screenId === 'screen-live-preview') {
      if (addBtn) addBtn.style.display = 'none';
      if (headerTitle) headerTitle.innerText = "Modo Ensayo";
    }
  }
}

window.navigateTo = function(screenId) {
  if (screenHistory[screenHistory.length - 1] !== screenId) {
    screenHistory.push(screenId);
  }
  showScreen(screenId);
}

window.navigateBack = function() {
  if (screenHistory.length > 1) {
    screenHistory.pop();
    const prevScreen = screenHistory[screenHistory.length - 1];
    showScreen(prevScreen);
  }
}

window.openCancioneroView = function() { 
  navigateTo('screen-cancionero-list'); 
  renderSongs();
}

window.openShowsView = function(){
  navigateTo("screen-shows-repertoire");
  renderShowRepertoire();
  renderPrepareShow();
}

window.renderPrepareShow = function(){
  const target = document.getElementById("prepare-show-preview");
  if(!target) return;

  const repertorio = songsArray.filter(song => showSetlistIds.includes(song.id));
  if(repertorio.length === 0){
    target.innerHTML = `<div class="empty-peña">No hay canciones seleccionadas.</div>`;
    return;
  }

  target.innerHTML = repertorio.map((song,index)=>`
      <div class="song-row">
        <div class="song-avatar" style="background:var(--card-shows);">${index+1}</div>
        <div class="song-meta-info">
          <div class="song-row-title">${song.title}</div>
          <div class="song-row-sub">${song.key} • ${song.genre.toUpperCase()}</div>
        </div>
      </div>
  `).join("");

  const fontVal = document.getElementById("prepare-font-size-value");
  if (fontVal) fontVal.innerText = `${currentFontSize}px`;

  const speedVal = document.getElementById("prepare-scroll-speed-value");
  if (speedVal) speedVal.innerText = scrollSpeed;
}

window.startPreparedShow = async function(){
  const autoCheckbox = document.getElementById("prepare-autostart-scroll");
  autoStartScroll = autoCheckbox ? autoCheckbox.checked : false;

  if(showSetlistIds.length === 0){
    showToast("Agregá canciones al repertorio.");
    return;
  }

  currentLiveIndex = 0;
  document.getElementById("live-player-mode").classList.add("active");
  await enterFullscreen();
  loadLiveSong();

  if(autoStartScroll){
    setTimeout(()=>{ startAutoscroll(); }, 500);
  }
}

/* ===================== CONEXIÓN EN TIEMPO REAL CON CLOUD FIRESTORE ===================== */
db.collection('Canciones').onSnapshot((snapshot) => {
  songsArray = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    songsArray.push({
      id: doc.id,
      title: data.titulo || 'Sin título',
      genre: (data.estilo || 'otros').toLowerCase(),
      key: data.tonalidad || 'Am', 
      bpm: data.bpm || 90,
      lyrics: data.letra || ''
    });
  });
  renderSongs();
  renderShowRepertoire();
}, (error) => {
  console.error("Error cargando Firestore: ", error);
});

/* ===================== RENDERS INTERFAZ ===================== */
window.filterByGenre = function(genre) {
  currentGenreFilter = genre.toLowerCase();
  document.querySelectorAll('.tab-item').forEach(btn => {
    if(btn.onclick && btn.onclick.toString().includes(`'${genre}'`)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderSongs();
}

window.renderSongs = function() {
  const target = document.getElementById('songs-render-target');
  if(!target) return;
  const searchInput = document.getElementById('search-input');
  const searchVal = searchInput ? searchInput.value.toLowerCase() : '';

  const filtered = songsArray.filter(s => {
    const matchesGenre = s.genre === currentGenreFilter;
    const matchesSearch = s.title.toLowerCase().includes(searchVal);
    return matchesGenre && matchesSearch;
  });

  if (filtered.length === 0) {
    target.innerHTML = `<div class="empty-peña">🎵 No hay canciones en este género todavía.<br>Tocá el + para agregar una.</div>`;
    return;
  }

  target.innerHTML = filtered.map(song => {
    const isAdded = showSetlistIds.includes(song.id);
    return `
      <div class="song-row">
        <div class="song-avatar" onclick="quickViewSong('${song.id}')">${song.title.charAt(0).toUpperCase()}</div>
        <div class="song-meta-info" onclick="quickViewSong('${song.id}')">
          <div class="song-row-title">${song.title}</div>
          <div class="song-row-sub">${song.key} • ${song.bpm} BPM</div>
        </div>
        <div class="action-icons-wrap">
          <button class="add-to-show-btn ${isAdded ? 'added' : ''}" onclick="toggleSongInSetlist('${song.id}')">
            ${isAdded ? '✓ Show' : '+ Show'}
          </button>
          <button class="delete-btn" style="color:#4da3ff" onclick="editSong('${song.id}')">✏️</button>
          <button class="delete-btn" onclick="deleteSong('${song.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

window.renderShowRepertoire = function() {
  const target = document.getElementById('show-repertoire-target');
  if(!target) return;
  const selectedSongs = songsArray.filter(s => showSetlistIds.includes(s.id));

  if (selectedSongs.length === 0) {
    target.innerHTML = `<div class="empty-peña">🎤 No armaste ningún repertorio todavía.<br>Andá al Cancionero y sumá temas al show.</div>`;
    return;
  }

  target.innerHTML = selectedSongs.map((song, idx) => `
    <div class="song-row">
      <div class="song-avatar" style="background: var(--card-shows);">${idx + 1}</div>
      <div class="song-meta-info">
        <div class="song-row-title">${song.title}</div>
        <div class="song-row-sub">${song.genre.toUpperCase()} • ${song.key}</div>
      </div>
      <button class="delete-btn" onclick="toggleSongInSetlist('${song.id}')" style="color:var(--text-dorado)">Quitar</button>
    </div>
  `).join('');

  renderPrepareShow();
}

window.toggleSongInSetlist = function(id) {
  const index = showSetlistIds.indexOf(id);
  if (index > -1) {
    showSetlistIds.splice(index, 1);
  } else {
    showSetlistIds.push(id);
  }
  renderSongs();
  renderShowRepertoire();
}

window.handleFormSubmit = function(e) {
  e.preventDefault();
  const newSong = {
    titulo: document.getElementById('form-title').value,
    estilo: document.getElementById('form-genre').value,
    tonalidad: document.getElementById('form-key').value,
    bpm: parseInt(document.getElementById('form-bpm').value) || 90,
    letra: document.getElementById('form-lyrics').value,
    id_cancion: ""
  };

  db.collection('Canciones').add(newSong)
    .then(() => {
      showToast("¡Canción guardada en Firestore!");
      e.target.reset();
      navigateBack();
    })
    .catch(err => showToast("Error al guardar: " + err.message));
}

window.deleteSong = function(id) {
  if(confirm("¿Seguro que querés borrar esta canción, paisano?")) {
    db.collection('Canciones').doc(id).delete()
      .then(() => showToast("Canción eliminada de la nube"));
  }
}

/* ===================== MODO ENSAYO (PREVIEW) ===================== */
window.openPreviewSong = function(song) {
  if (!song) return;
  currentSong = song;

  const titleEl = document.getElementById("preview-song-title");
  if (titleEl) titleEl.textContent = song.title || song.titulo || "Sin título";

  const metaEl = document.getElementById("preview-song-meta");
  if (metaEl) {
    const genero = (song.genre || song.estilo || "Chacarera").toUpperCase();
    const tono = song.key || song.tonalidad || "--";
    const bpm = song.bpm ? `${song.bpm} BPM` : "-- BPM";
    metaEl.textContent = `${genero} • Tonalidad: ${tono} • ${bpm}`;
  }

  const lyricsEl = document.getElementById("preview-lyrics");
  if (lyricsEl) {
    const rawLyrics = song.lyrics || song.letra || "Sin letra disponible";
    const processedLyrics = rawLyrics.replace(/\[([^\]]+)\]/g, '<span class="chord" style="color: #d4af37; font-weight: bold;">$1</span>');
    lyricsEl.innerHTML = processedLyrics;
  }

  // Uso limpio de la navegación
  navigateTo("screen-live-preview");

  const container = document.getElementById('preview-scroll-container');
  if (container) container.scrollTop = 0;
}

window.quickViewSong = function(id) {
  const song = songsArray.find(s => s.id === id);
  if (!song) {
    showToast("No se encontró la canción");
    return;
  }
  openPreviewSong(song);
}

window.closePreview = function() {

    stopAutoscroll();

    const container = document.getElementById("preview-scroll-container");
    if (container) {
        container.scrollTop = 0;
    }

    currentSong = null;

    navigateBack();

}

window.goToStageMode = async function() {
    if (!currentSong) return;

    // Ocultar la vista previa
    const preview = document.getElementById("screen-live-preview");
    if (preview) {
        preview.classList.remove("active");
    }

    // Preparar el show
    showSetlistIds = [currentSong.id];
    currentLiveIndex = 0;

    // Mostrar el reproductor
    const player = document.getElementById("live-player-mode");
    if (player) {
        player.classList.add("active");
    }

    await enterFullscreen();

    loadLiveSong();
}

/* ===================== MOTOR SHOW EN VIVO ===================== */
window.loadLiveSong = function() {
  const selectedSongs = songsArray.filter(s => showSetlistIds.includes(s.id));
  const song = selectedSongs[currentLiveIndex];
  if (!song) return;

  const titleEl = document.getElementById('live-meta-title');
  if (titleEl) titleEl.innerText = song.title;

  const subEl = document.getElementById('live-meta-sub');
  if (subEl) subEl.innerText = `${song.genre.toUpperCase()} • Tonalidad: ${song.key} • ${song.bpm} BPM`;

  const processedLyrics = song.lyrics.replace(/\[([^\]]+)\]/g, '<span class="chord">$1</span>');
  const target = document.getElementById('lyrics-render-target');
  if (target) {
    target.innerHTML = processedLyrics;
    target.style.fontSize = `${currentFontSize}px`;
  }

  const prevBtn = document.getElementById('live-prev-btn');
  if (prevBtn) prevBtn.classList.toggle('disabled', currentLiveIndex === 0);

  const nextBtn = document.getElementById('live-next-btn');
  if (nextBtn) nextBtn.classList.toggle('disabled', currentLiveIndex === selectedSongs.length - 1);

  triggerNextOnNextScroll = false;
  resetLiveScroll();
}

window.changeLiveSong = function(direction) {
  const selectedSongs = songsArray.filter(s => showSetlistIds.includes(s.id));
  const nextIndex = currentLiveIndex + direction;
  if (nextIndex >= 0 && nextIndex < selectedSongs.length) {
    currentLiveIndex = nextIndex;
    loadLiveSong();
  } else if (nextIndex >= selectedSongs.length) {
    showToast("¡Fin del show!");
    exitLiveShow();
  }
}

window.exitLiveShow = async function() {

    stopAutoscroll();

    const player = document.getElementById("live-player-mode");
    if (player) {
        player.classList.remove("active");
    }

    await exitFullscreen();

    // Volver a mostrar la vista previa
    const preview = document.getElementById("screen-live-preview");
    if (preview) {
        preview.classList.add("active");
    }

}

/* ===================== AUTOSCROLL Y CONTROLES ===================== */
window.toggleAutoscroll = function() {
  if (isAutoscrolling) { stopAutoscroll(); } else { startAutoscroll(); }
}

window.startAutoscroll = function() {
  isAutoscrolling = true;
  
  const scrollBtn = document.getElementById('preview-scroll-toggle');
  if (scrollBtn) scrollBtn.innerText = "Pausa ⏸";

  const centerBtn = document.getElementById('center-play-trigger');
  if (centerBtn) centerBtn.innerText = "⏸";
  
  // Buscar qué contenedor mover (Ensayo o Show)
  const isShowActive = document.getElementById('live-player-mode').classList.contains('active');
  const container = isShowActive ? document.getElementById('live-scroll-area') : document.getElementById('preview-scroll-container');

  autoscrollInterval = setInterval(() => {
    if (container) {
      container.scrollTop += 1;
      if (container.scrollTop >= (container.scrollHeight - container.clientHeight - 2)) {
        stopAutoscroll();
        if (isShowActive) {
          setTimeout(() => { changeLiveSong(1); }, 800);
        }
      }
    }
  }, scrollSpeed);
}

window.stopAutoscroll = function() {
  isAutoscrolling = false;
  
  const scrollBtn = document.getElementById('preview-scroll-toggle');
  if (scrollBtn) scrollBtn.innerText = "Play ▶";

  const centerBtn = document.getElementById('center-play-trigger');
  if (centerBtn) centerBtn.innerText = "▶";
  
  clearInterval(autoscrollInterval);
}

window.resetLiveScroll = function() {
  stopAutoscroll();
  const area = document.getElementById('live-scroll-area');
  if (area) area.scrollTop = 0;
}

window.adjustFontSize = function(delta) {
  currentFontSize = Math.max(12, Math.min(60, currentFontSize + delta));
  
  const lyricsPreview = document.getElementById("preview-lyrics");
  if (lyricsPreview) lyricsPreview.style.fontSize = `${currentFontSize}px`;

  const lyricsStage = document.getElementById("lyrics-render-target");
  if (lyricsStage) lyricsStage.style.fontSize = `${currentFontSize}px`;

  const label = document.getElementById("prepare-font-size-value");
  if (label) label.innerText = `${currentFontSize} px`;
}

window.adjustScrollSpeed = function(delta){
  scrollSpeed = Math.max(5, scrollSpeed - (delta * 3));
  if(isAutoscrolling){
    stopAutoscroll();
    startAutoscroll();
  }
  const label = document.getElementById("prepare-scroll-speed-value");
  if(label) label.innerText = scrollSpeed;
}

window.editSong = function(id){
  editingSongId = id;
  editingSongData = songsArray.find(s => s.id === id);
  
  if(!editingSongData){
    showToast("No se encontró la canción");
    return;
  }
  
  document.getElementById("form-title").value = editingSongData.title;
  document.getElementById("form-genre").value = editingSongData.genre;
  document.getElementById("form-key").value = editingSongData.key;
  document.getElementById("form-bpm").value = editingSongData.bpm;
  document.getElementById("form-lyrics").value = editingSongData.lyrics;
  
  document.getElementById("song-form-title").innerText = "Editar canción";
  document.getElementById("song-submit-btn").innerText = "Guardar cambios";
  
  navigateTo("screen-add-song");
}

window.showToast = function(msg) {
  const toast = document.getElementById('toast-msg');
  if(!toast) return;
  toast.innerText = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// Event Listeners para scroll táctil / mouse en Vivo
const liveScrollArea = document.getElementById('live-scroll-area');
if (liveScrollArea) {
  liveScrollArea.addEventListener('scroll', function(e) {
    const el = e.target;
    if (el.scrollTop >= (el.scrollHeight - el.clientHeight - 5)) {
      if (!isAutoscrolling && !triggerNextOnNextScroll) triggerNextOnNextScroll = true;
    }
  });

  liveScrollArea.addEventListener('wheel', function(e) {
    if (triggerNextOnNextScroll && e.deltaY > 0) {
      triggerNextOnNextScroll = false;
      changeLiveSong(1);
    }
  });

  liveScrollArea.addEventListener('touchend', function(e) {
    const el = e.currentTarget;
    if (el.scrollTop >= (el.scrollHeight - el.clientHeight - 5)) {
      if(triggerNextOnNextScroll) {
        triggerNextOnNextScroll = false;
        changeLiveSong(1);
      } else {
        triggerNextOnNextScroll = true;
      }
    }
  });
}
