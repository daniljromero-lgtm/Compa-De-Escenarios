/* ==========================================================
   Cancionero - Compañero de Escenario

   Archivo: js/app.js
   Versión: 2.5 STABLE
   Estado: Base estable
   Fecha: Julio 2026

   Descripción:
   Lógica principal de la aplicación.
   - Navegación entre pantallas
   - Integración con Firebase Firestore
   - Gestión del Cancionero
   - Vista Previa / Ensayo
   - Modo Escenario
   - Autoscroll
   - Gestión del repertorio

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
let repertoiresArray = [];

let currentGenreFilter = 'chacarera';
let showSetlistIds = [];

let currentRepertoireId = null;
let selectedSongForRepertoire = null;
let currentRepertoire = null;

let screenHistory = ['screen-main-menu'];
let autoStartScroll = false;

/* ==========================================================
   PANTALLA COMPLETA (FULLSCREEN)
========================================================== */

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
let liveOrigin = "preview";
let isAutoscrolling = false;
let autoscrollInterval = null;
let scrollSpeed = 22; 
let currentFontSize = 20;
let triggerNextOnNextScroll = false;
let currentSong = null;

/* ==========================================================
   NAVEGACIÓN ENTRE PANTALLAS
========================================================== */
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
     
     const subtitle =
document.getElementById("main-header-subtitle");
if(subtitle) subtitle.innerText = "";

  } else {
    if (backBtn) backBtn.style.display = 'block';

    if (screenId === 'screen-cancionero-list') {

      if (addBtn) addBtn.style.display = 'block';
      if (headerTitle) headerTitle.innerText = "Cancionero";

      const subtitle = document.getElementById("main-header-subtitle");
      if (subtitle) subtitle.innerText = "";

    } else if (screenId === 'screen-add-song') {

      if (addBtn) addBtn.style.display = 'none';
      if (headerTitle) headerTitle.innerText = "Nueva Canción";

      const subtitle = document.getElementById("main-header-subtitle");
      if (subtitle) subtitle.innerText = "";

    } else if (screenId === 'screen-shows-repertoire') {

      if (addBtn) addBtn.style.display = 'none';
      if (headerTitle) headerTitle.innerText = "Repertorios";

      const subtitle = document.getElementById("main-header-subtitle");
      if (subtitle) subtitle.innerText = "";

    } else if (screenId === 'screen-repertoire-detail') {

      if (addBtn) addBtn.style.display = 'none';
      // El título y el subtítulo los actualiza openRepertoire()

    } else if (screenId === 'screen-live-preview') {

      if (addBtn) addBtn.style.display = 'none';
      if (headerTitle) headerTitle.innerText = "Modo Ensayo";

      const subtitle = document.getElementById("main-header-subtitle");
      if (subtitle) subtitle.innerText = "";

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

/* ==========================================================
   SINCRONIZACIÓN CON FIRESTORE
========================================================== */
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

/* ==========================================================
   REPERTORIOS
========================================================== */

db.collection("Repertorios").onSnapshot((snapshot) => {

    repertoiresArray = [];

    snapshot.forEach((doc) => {

        const data = doc.data();

        repertoiresArray.push({

            id: doc.id,
            nombre: data.nombre || "Sin nombre",
            canciones: data.canciones || []

        });

    });

    renderRepertoires();

});

/* ==========================================================
   RENDERIZADO DE LA INTERFAZ
========================================================== */
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
        <div class="song-actions">

    <button
        class="song-menu-btn"
        onclick="toggleSongMenu('${song.id}')">

        ⋮

    </button>

    <div
        class="song-menu"
        id="song-menu-${song.id}">

        <button
            onclick="openRepertoireModal('${song.id}')">

            📁 ${isAdded ? 'Quitar del repertorio' : 'Agregar al repertorio'}

        </button>

        <button
            onclick="editSong('${song.id}')">

            ✏️ Editar

        </button>

        <button
            onclick="deleteSong('${song.id}')">

            🗑️ Eliminar

        </button>

        </div>

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

/* ==========================================================
   MODO ENSAYO (VISTA PREVIA)
========================================================== */
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
    liveOrigin = "preview";

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

/* ==========================================================
   MODO ESCENARIO (SHOW EN VIVO)
========================================================== */
window.loadLiveSong = function() {
  const selectedSongs = showSetlistIds
    .map(id => songsArray.find(s => s.id === id))
    .filter(song => song);
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
  const selectedSongs = showSetlistIds
    .map(id => songsArray.find(s => s.id === id))
    .filter(song => song);
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

    if(liveOrigin === "preview"){

    const preview = document.getElementById("screen-live-preview");

    if(preview){
        preview.classList.add("active");
    }

   }else{

    document
        .getElementById("live-player-mode")
        .classList.remove("active");

    openRepertoire(currentRepertoireId);

   }

}

/* ==========================================================
   AUTOSCROLL Y CONTROLES DE LECTURA
========================================================== */
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

/* ==========================================================
   EDICIÓN DE CANCIONES
========================================================== */
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

/* ==========================================================
   REPERTORIOS
========================================================== */

window.createNewRepertoire = function () {

    const nombre = prompt("Nombre del repertorio");

    if (!nombre) return;

    db.collection("Repertorios").add({

        nombre: nombre,
        canciones: []

    })

    .then(() => {

        showToast("Repertorio creado");

    })

    .catch(err => {

        showToast(err.message);

    });

}


window.renderRepertoires = function () {

    const target = document.getElementById("repertoires-render-target");

    if (!target) return;

    if (repertoiresArray.length === 0) {

        target.innerHTML = `
            <div class="empty-peña">
                Todavía no hay repertorios.
            </div>
        `;

        return;

    }

    target.innerHTML = repertoiresArray.map(rep => `

    <div class="song-row"
         onclick="openRepertoire('${rep.id}')">

        <div class="song-avatar"
             style="background:var(--card-shows);">
             📁
        </div>

        <div class="song-meta-info">

            <div class="song-row-title">
                ${rep.nombre}
            </div>

            <div class="song-row-sub">
                ${rep.canciones.length} canciones
            </div>

        </div>

        <div class="song-actions">

            <button
                class="song-menu-btn"
                onclick="event.stopPropagation(); toggleRepertoireMenu('${rep.id}')">

                ⋮

            </button>

            <div
                class="song-menu"
                id="repertoire-menu-${rep.id}">

                <button
                    onclick="event.stopPropagation(); renameRepertoire('${rep.id}')">

                    ✏️ Renombrar

                </button>

                <button
                    onclick="event.stopPropagation(); duplicateRepertoire('${rep.id}')">

                    📑 Duplicar

                </button>

                <button
                      onclick="event.stopPropagation(); deleteRepertoire('${rep.id}')">

                    🗑️ Eliminar

                </button>

            </div>

        </div>

    </div>

`).join("");

}

window.openRepertoire = function(id){

    const rep = repertoiresArray.find(r => r.id === id);

    if(!rep) return;

    currentRepertoireId = id;
    currentRepertoire = rep;

   const headerTitle = document.getElementById("main-header-title");

const subtitle =
document.getElementById("main-header-subtitle");

if(headerTitle){
    headerTitle.innerText = "📁 " + rep.nombre;
}

if(subtitle){

    const cantidad = rep.canciones.length;

    subtitle.innerText =
        cantidad === 1
        ? "1 canción"
        : `${cantidad} canciones`;

}

    const target = document.getElementById("repertoire-detail-list");

    const songs = rep.canciones
        .map(songId => songsArray.find(s => s.id === songId))
        .filter(song => song);

    if(songs.length === 0){

        target.innerHTML = `
            <div class="empty-peña">

                Este repertorio todavía no tiene canciones.

            </div>
        `;

    }else{

        target.innerHTML = songs.map((song,index)=>`

    <div class="song-row repertoire-song"
     data-index="${index}"
     onclick="quickViewSong('${song.id}')">

    <div class="song-avatar"
         style="background:var(--card-shows);">

         ${index+1}

    </div>

    <div class="song-meta-info">

        <div class="song-row-title">

            ${song.title}

        </div>

        <div class="song-row-sub">

            ${song.genre.toUpperCase()} • ${song.key}

        </div>

    </div>

    <div
    class="song-actions"
    onclick="event.stopPropagation();">

    <span
    class="drag-handle"
    draggable="true"
    data-index="${index}"
    ondragstart="dragStart(event)"
    ondragover="dragOver(event)"
    ondrop="dropSong(event)"
    ondragend="dragEnd()"
    ontouchstart="touchDragStart(event)"
    ontouchmove="touchDragMove(event)"
    ontouchend="touchDragEnd(event)">

    ☰

    </span>

    </div>

</div>

        `).join("");

    }

    navigateTo("screen-repertoire-detail");

}

window.startRepertoireShow = async function(){

    const repertorioActual =
        repertoiresArray.find(r => r.id === currentRepertoireId);

    if(!repertorioActual){

        showToast("No hay un repertorio abierto.");

        return;

    }

    currentRepertoire = repertorioActual;

    liveOrigin = "repertoire";

    showSetlistIds = [...repertorioActual.canciones];

    currentLiveIndex = 0;

    document.getElementById("live-player-mode")
        .classList.add("active");

    await enterFullscreen();

    loadLiveSong();

}

window.deleteRepertoire = function(id){

    if(!confirm("¿Eliminar este repertorio?")) return;

    db.collection("Repertorios")

        .doc(id)

        .delete()

        .then(()=>{

            showToast("Repertorio eliminado");

        });

}

window.renameRepertoire = function(id){

    const rep =
        repertoiresArray.find(r => r.id === id);

    if(!rep) return;

    const nuevoNombre =
        prompt(
            "Nuevo nombre del repertorio",
            rep.nombre
        );

    if(
        !nuevoNombre ||
        nuevoNombre.trim() === ""
    ){
        return;
    }

    db.collection("Repertorios")
        .doc(id)
        .update({

            nombre: nuevoNombre.trim()

        })

        .then(() => {

            showToast(
                "Repertorio renombrado"
            );

        })

        .catch(err => {

            showToast(
                "Error: " + err.message
            );

        });

}

window.duplicateRepertoire = function(id){

    const rep = repertoiresArray.find(r => r.id === id);

    if(!rep){
        showToast("No se encontró el repertorio.");
        return;
    }

    let nuevoNombre = rep.nombre + " (copia)";

    let contador = 2;

    while(
        repertoiresArray.some(r => r.nombre === nuevoNombre)
    ){

        nuevoNombre = `${rep.nombre} (copia ${contador})`;

        contador++;

    }

    db.collection("Repertorios")
        .add({

            nombre: nuevoNombre,

            canciones: [...rep.canciones]

        })

        .then(()=>{

            showToast("Repertorio duplicado");

        })

        .catch(err=>{

            showToast("Error: " + err.message);

        });

}

window.moveSongInRepertoire = function(direction,index){

    if(!currentRepertoire) return;

    const canciones = [...currentRepertoire.canciones];

    const nuevoIndice = index + direction;

    if(
        nuevoIndice < 0 ||
        nuevoIndice >= canciones.length
    ){
        return;
    }

    const temporal = canciones[index];

    canciones[index] = canciones[nuevoIndice];

    canciones[nuevoIndice] = temporal;

    db.collection("Repertorios")
        .doc(currentRepertoire.id)
        .update({

            canciones: canciones

        })

        .then(()=>{

            currentRepertoire.canciones = canciones;

            openRepertoire(currentRepertoire.id);

        })

        .catch(err=>{

            showToast(err.message);

        });

}

/* ==========================================================
   DRAG & DROP DE CANCIONES EN REPERTORIOS
   Compatible con computadora y celular
   ========================================================== */

let draggedSongIndex = null;
let touchDraggedIndex = null;
let touchDragging = false;
let touchStartX = 0;
let touchStartY = 0;


/* ----------------------------------------------------------
   DRAG & DROP TRADICIONAL
   Computadora / navegador compatible
   ---------------------------------------------------------- */

window.dragStart = function(e){

    draggedSongIndex = Number(
        e.currentTarget.dataset.index
    );

    e.currentTarget.classList.add("dragging");

};


window.dragOver = function(e){

    e.preventDefault();

};


window.dragEnd = function(){

    document
        .querySelectorAll(".dragging")
        .forEach(el => {
            el.classList.remove("dragging");
        });

};


window.dropSong = function(e){

    e.preventDefault();

    const destino = Number(
        e.currentTarget.dataset.index
    );

    if(
        draggedSongIndex === null ||
        destino === draggedSongIndex
    ){
        draggedSongIndex = null;
        return;
    }

    const canciones =
        [...currentRepertoire.canciones];

    const movida =
        canciones.splice(
            draggedSongIndex,
            1
        )[0];

    canciones.splice(
        destino,
        0,
        movida
    );

    db.collection("Repertorios")
        .doc(currentRepertoire.id)
        .update({
            canciones: canciones
        })
        .then(() => {

            currentRepertoire.canciones =
                canciones;

            draggedSongIndex = null;

            openRepertoire(
                currentRepertoire.id
            );

            showToast(
                "Orden actualizado"
            );

        })
        .catch(err => {

            draggedSongIndex = null;

            showToast(
                "Error: " + err.message
            );

        });

};


/* ----------------------------------------------------------
   ARRASTRE TÁCTIL
   Android / celular
   ---------------------------------------------------------- */

window.touchDragStart = function(e){

    if(!e.touches || !e.touches[0]){
        return;
    }

    const touch = e.touches[0];

    touchDraggedIndex =
        Number(
            e.currentTarget.dataset.index
        );

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    touchDragging = false;

};


window.touchDragMove = function(e){

    if(
        touchDraggedIndex === null ||
        !e.touches ||
        !e.touches[0]
    ){
        return;
    }

    const touch = e.touches[0];

    const distanciaX =
        Math.abs(
            touch.clientX - touchStartX
        );

    const distanciaY =
        Math.abs(
            touch.clientY - touchStartY
        );

    /*
       Evitamos activar el arrastre
       por un pequeño movimiento accidental.
    */

    if(
        !touchDragging &&
        distanciaX < 8 &&
        distanciaY < 8
    ){
        return;
    }

    touchDragging = true;

    e.preventDefault();

    const elemento =
        document.elementFromPoint(
            touch.clientX,
            touch.clientY
        );

    if(!elemento){
        return;
    }

    const fila =
        elemento.closest(
            ".repertoire-song"
        );

    if(!fila){
        return;
    }

    const destino =
        Number(
            fila.dataset.index
        );

    if(
        destino === touchDraggedIndex
    ){
        return;
    }

    const lista =
        document.getElementById(
            "repertoire-detail-list"
        );

    if(!lista){
        return;
    }

    const filas =
        [...lista.querySelectorAll(
            ".repertoire-song"
        )];

    const filaArrastrada =
        filas[touchDraggedIndex];

    if(!filaArrastrada){
        return;
    }

    const rect =
        fila.getBoundingClientRect();

    const mitad =
        rect.top +
        (rect.height / 2);

    if(
        touch.clientY < mitad
    ){

        lista.insertBefore(
            filaArrastrada,
            fila
        );

    }else{

        lista.insertBefore(
            filaArrastrada,
            fila.nextSibling
        );

    }

    /*
       Recalculamos los índices visuales.
    */

    const nuevasFilas =
        [...lista.querySelectorAll(
            ".repertoire-song"
        )];

    nuevasFilas.forEach(
        (item, index) => {

            item.dataset.index = index;

        }
    );

    touchDraggedIndex =
        Number(
            filaArrastrada.dataset.index
        );

    document
        .querySelectorAll(
            ".repertoire-song"
        )
        .forEach(item => {

            item.classList.remove(
                "dragging"
            );

        });

    filaArrastrada.classList.add(
        "dragging"
    );

};


window.touchDragEnd = function(e){

    if(
        touchDraggedIndex === null
    ){
        return;
    }

    /*
       Si apenas tocamos el handle
       y no arrastramos, dejamos que
       la interacción normal continúe.
    */

    if(!touchDragging){

        touchDraggedIndex = null;

        return;

    }

    if(e){

        e.preventDefault();
        e.stopPropagation();

    }

    const lista =
        document.getElementById(
            "repertoire-detail-list"
        );

    if(!lista){
        touchDraggedIndex = null;
        touchDragging = false;
        return;
    }

    const filas =
        [...lista.querySelectorAll(
            ".repertoire-song"
        )];

    const nuevoOrden =
        filas.map(
            fila => {

                const indice =
                    Number(
                        fila.dataset.index
                    );

                return currentRepertoire
                    .canciones[indice];

            }
        );

    db.collection("Repertorios")
        .doc(currentRepertoire.id)
        .update({
            canciones: nuevoOrden
        })
        .then(() => {

            currentRepertoire.canciones =
                nuevoOrden;

            touchDraggedIndex = null;
            touchDragging = false;

            openRepertoire(
                currentRepertoire.id
            );

            showToast(
                "Orden actualizado"
            );

        })
        .catch(err => {

            touchDraggedIndex = null;
            touchDragging = false;

            openRepertoire(
                currentRepertoire.id
            );

            showToast(
                "Error: " + err.message
            );

        });

};

/* ==========================================================
   MODAL REPERTORIOS
========================================================== */

window.openRepertoireModal = function(songId){

    selectedSongForRepertoire = songId;

    const modal = document.getElementById("repertoire-modal");
    const list = document.getElementById("modal-repertoire-list");

    if(!modal || !list) return;

    if(repertoiresArray.length === 0){

        list.innerHTML = `
            <div class="empty-peña">
                No hay repertorios creados.
            </div>
        `;

    }else{

        list.innerHTML = repertoiresArray.map(rep=>{

    const alreadyAdded =
        rep.canciones.includes(selectedSongForRepertoire);

    return `

        <div class="modal-repertoire-row"
             onclick="selectRepertoire('${rep.id}')">

            <div class="modal-folder">

                📁

            </div>

            <div style="flex:1;">

                <div class="modal-name">

                    ${rep.nombre}

                </div>

                <div class="modal-count">

                    ${rep.canciones.length} canciones

                </div>

            </div>

            ${
                alreadyAdded
                ? `<div style="
                        color:#58d68d;
                        font-weight:bold;
                        font-size:13px;">
                        ✔
                   </div>`
                : ""
            }

        </div>

    `;

}).join("");

    }

    modal.style.display="flex";

}


window.closeRepertoireModal = function(){

    const modal=document.getElementById("repertoire-modal");

    if(modal){

        modal.style.display="none";

    }

}


window.selectRepertoire = function(id){

    const rep = repertoiresArray.find(r => r.id === id);

    if(!rep) return;

    // Evitar duplicados
    if(rep.canciones.includes(selectedSongForRepertoire)){

        showToast("La canción ya pertenece a este repertorio.");

        closeRepertoireModal();

        return;

    }


    db.collection("Repertorios")
    .doc(id)
    .update({

        canciones: firebase.firestore.FieldValue.arrayUnion(
            selectedSongForRepertoire
        )

    })
        .then(()=>{

            showToast("Canción agregada al repertorio.");

            closeRepertoireModal();

        })
        .catch(err=>{

            showToast("Error: " + err.message);

        });

}

/* ==========================================================
   UTILIDADES
========================================================== */
window.showToast = function(msg) {
  const toast = document.getElementById('toast-msg');
  if(!toast) return;
  toast.innerText = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

/* ==========================================================
   MENÚ CONTEXTUAL DE CANCIONES
========================================================== */

window.toggleSongMenu = function(songId){

    // Cerrar cualquier otro menú abierto
    document.querySelectorAll(".song-menu.active").forEach(menu=>{
        if(menu.id !== `song-menu-${songId}`){
            menu.classList.remove("active");
        }
    });

    const menu = document.getElementById(`song-menu-${songId}`);

    if(menu){
        menu.classList.toggle("active");
    }

}

window.toggleRepertoireMenu = function(repertoireId){

    document
        .querySelectorAll(".song-menu.active")
        .forEach(menu => {

            if(menu.id !== `repertoire-menu-${repertoireId}`){
                menu.classList.remove("active");
            }

        });

    const menu =
        document.getElementById(
            `repertoire-menu-${repertoireId}`
        );

    if(menu){
        menu.classList.toggle("active");
    }

}

// Cerrar el menú al tocar fuera de él
document.addEventListener("click", function(e){

    if(
        !e.target.closest(".song-actions")
    ){

        document.querySelectorAll(".song-menu.active").forEach(menu=>{
            menu.classList.remove("active");
        });

    }

});

/* ==========================================================
   EVENTOS DEL REPRODUCTOR EN VIVO
========================================================== */
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
