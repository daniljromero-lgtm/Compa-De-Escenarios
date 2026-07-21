// Inicializar Cloud Firestore (Usando el objeto expuesto globalmente)
const db = firebase.firestore();

/* ===================== ESTADO DE LA APLICACIÓN ===================== */
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

// Control de Vivo
let currentLiveIndex = 0;
let isAutoscrolling = false;
let autoscrollInterval = null;
let scrollSpeed = 22; 
let currentFontSize = 20;
let triggerNextOnNextScroll = false;

/* ===================== NAVEGACIÓN ===================== */
window.showScreen = function(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const activeScreen = document.getElementById(screenId);
  if(activeScreen) activeScreen.classList.add('active');
  
  const backBtn = document.getElementById('global-back-btn');
  const addBtn = document.getElementById('header-add-btn');
  const headerTitle = document.getElementById('main-header-title');

  if (screenId === 'screen-main-menu') {
    backBtn.style.display = 'none';
    addBtn.style.display = 'none';
    headerTitle.innerText = "Cancionero";
  } else {
    backBtn.style.display = 'block';
    if (screenId === 'screen-cancionero-list') {
      addBtn.style.display = 'block';
      headerTitle.innerText = "Cancionero";
    } else if (screenId === 'screen-add-song') {
      addBtn.style.display = 'none';
      headerTitle.innerText = "Nueva Canción";
    } else if (screenId === 'screen-shows-repertoire') {
      addBtn.style.display = 'none';
      headerTitle.innerText = "Shows en Vivo";
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

window.openCancioneroView = function() { navigateTo('screen-cancionero-list'); renderSongs(); }
window.openShowsView = function(){

  navigateTo(
    "screen-shows-repertoire"
  );

  renderShowRepertoire();

  renderPrepareShow();

}
window.renderPrepareShow = function(){

  const target =
    document.getElementById(
      "prepare-show-preview"
    );

  if(!target) return;

  const repertorio =
    songsArray.filter(song =>
      showSetlistIds.includes(song.id)
    );

  if(repertorio.length === 0){

    target.innerHTML = `
      <div class="empty-peña">
        No hay canciones seleccionadas.
      </div>
    `;

    return;

  }

  target.innerHTML = repertorio.map(

    (song,index)=>`

      <div class="song-row">

        <div
          class="song-avatar"
          style="background:var(--card-shows);">

          ${index+1}

        </div>

        <div class="song-meta-info">

          <div class="song-row-title">

            ${song.title}

          </div>

          <div class="song-row-sub">

            ${song.key}
            •
            ${song.genre.toUpperCase()}

          </div>

        </div>

      </div>

    `

  ).join("");

  document.getElementById(
    "prepare-font-size-value"
  ).innerText =
    `${currentFontSize}px`;

  document.getElementById(
    "prepare-scroll-speed-value"
  ).innerText =
    scrollSpeed;

}
window.startPreparedShow = async function(){

  autoStartScroll =
    document.getElementById(
      "prepare-autostart-scroll"
    ).checked;

  if(showSetlistIds.length===0){

    showToast(
      "Agregá canciones al repertorio."
    );

    return;

  }

  currentLiveIndex = 0;

  document
    .getElementById("live-player-mode")
    .classList.add("active");

  await enterFullscreen();

  loadLiveSong();

  if(autoStartScroll){

    setTimeout(()=>{

      startAutoscroll();

    },500);

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
    if(btn.onclick.toString().includes(`'${genre}'`)) {
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
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  
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

/* ===================== MOTOR SHOW EN VIVO ===================== */
window.startLiveShow = async function() {

  if (showSetlistIds.length === 0) {
    showToast("Agregá canciones al show primero");
    return;
  }

  await enterFullscreen();

  currentLiveIndex = 0;

  document
    .getElementById('live-player-mode')
    .classList.add('active');

  loadLiveSong();
}

window.exitLiveShow = async function() {

  stopAutoscroll();

  document
    .getElementById('live-player-mode')
    .classList.remove('active');

  await exitFullscreen();
}
/******************************************************************
 * V2.5
 * MODO ENSAYO
 ******************************************************************/

function openPreviewSong(song) {

    if (!song) return;

    currentSong = song;

    document.getElementById("preview-song-title").textContent =
        song.title || "Sin título";

    document.getElementById("preview-lyrics").innerHTML =
        formatLyrics(song.lyrics || "");

    showScreen("screen-live-preview");

}
window.quickViewSong = async function(id) {

  showSetlistIds = [id];

  currentLiveIndex = 0;

  await enterFullscreen();

  document
    .getElementById('live-player-mode')
    .classList.add('active');

  loadLiveSong();
}

window.loadLiveSong = function() {
  const selectedSongs = songsArray.filter(s => showSetlistIds.includes(s.id));
  const song = selectedSongs[currentLiveIndex];
  if (!song) return;

  document.getElementById('live-meta-title').innerText = song.title;
  document.getElementById('live-meta-sub').innerText = `${song.genre.toUpperCase()} • Tonalidad: ${song.key} • ${song.bpm} BPM`;

  const processedLyrics = song.lyrics.replace(/\[([^\]]+)\]/g, '<span class="chord">$1</span>');
  const target = document.getElementById('lyrics-render-target');
  target.innerHTML = processedLyrics;
  target.style.fontSize = `${currentFontSize}px`;

  document.getElementById('live-prev-btn').classList.toggle('disabled', currentLiveIndex === 0);
  document.getElementById('live-next-btn').classList.toggle('disabled', currentLiveIndex === selectedSongs.length - 1);

  triggerNextOnNextScroll = false;
  resetLiveScroll();
  document.getElementById("live-scroll-area").scrollTop = 0;
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

window.toggleAutoscroll = function() {
  if (isAutoscrolling) { stopAutoscroll(); } else { startAutoscroll(); }
}

window.startAutoscroll = function() {
  isAutoscrolling = true;
  document.getElementById('scroll-play-btn').innerText = "Pausa ⏸";
  document.getElementById('center-play-trigger').innerText = "⏸";
  
  const container = document.getElementById('live-scroll-area');
  autoscrollInterval = setInterval(() => {
    container.scrollTop += 1;
    if (container.scrollTop >= (container.scrollHeight - container.clientHeight - 2)) {
      stopAutoscroll();
      setTimeout(() => { changeLiveSong(1); }, 800);
    }
  }, scrollSpeed);
}

window.stopAutoscroll = function() {
  isAutoscrolling = false;
  document.getElementById('scroll-play-btn').innerText = "Play ▶";
  document.getElementById('center-play-trigger').innerText = "▶";
  clearInterval(autoscrollInterval);
}

window.resetLiveScroll = function() {
  stopAutoscroll();
  document.getElementById('live-scroll-area').scrollTop = 0;
}

document.getElementById('live-scroll-area').addEventListener('scroll', function(e) {
  const el = e.target;
  if (el.scrollTop >= (el.scrollHeight - el.clientHeight - 5)) {
    if (!isAutoscrolling) { 
      if (!triggerNextOnNextScroll) triggerNextOnNextScroll = true;
    }
  }
});

document.getElementById('live-scroll-area').addEventListener('wheel', function(e) {
  if (triggerNextOnNextScroll && e.deltaY > 0) {
    triggerNextOnNextScroll = false;
    changeLiveSong(1);
  }
});

document.getElementById('live-scroll-area').addEventListener('touchend', function(e) {
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

window.adjustFontSize = function(delta){
  currentFontSize = Math.max(12, Math.min(36, currentFontSize + delta));
  const lyrics = document.getElementById("lyrics-render-target");
  if(lyrics){
    lyrics.style.fontSize = `${currentFontSize}px`;
  }
  const label = document.getElementById("prepare-font-size-value");
  if(label){
    label.innerText = `${currentFontSize} px`;
  }
}

window.adjustScrollSpeed = function(delta){
  scrollSpeed = Math.max(5, scrollSpeed - (delta * 3));
  if(isAutoscrolling){
    stopAutoscroll();
    startAutoscroll();
  }
  const label = document.getElementById("prepare-scroll-speed-value");
  if(label){
    label.innerText = scrollSpeed;
  }
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
