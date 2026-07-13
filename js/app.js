// ==========================================================================
// CONFIGURACIÓN DE FIREBASE Y IMPORTACIONES
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Las credenciales se toman del objeto que quedará expuesto de manera segura en el index.html
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const songsCollection = collection(db, "canciones");

// ==========================================================================
// REFERENCIAS A ELEMENTOS DEL DOM (INTERFAZ)
// ==========================================================================
const songsListContainer = document.getElementById("songsList");
const searchInput = document.getElementById("searchInput");
const songForm = document.getElementById("songForm");
const formOverlay = document.getElementById("formOverlay");
const formTitle = document.getElementById("formTitle");
const btnSubmitForm = document.getElementById("btnSubmitForm");
const btnCancelForm = document.getElementById("btnCancelForm");
const btnOpenForm = document.getElementById("btnOpenForm");

// Variables de estado de la aplicación
let allSongs = [];
let editId = null; // Guardará el ID de la canción si estamos editando (v2.2.2+)

// ==========================================================================
// FUNCIONES DE CONTROL DEL FORMULARIO FLOTANTE (MODAL)
// ==========================================================================
function openModal() {
    formOverlay.style.display = "flex";
}

function closeModal() {
    formOverlay.style.display = "none";
    songForm.reset();
    resetFormStatus();
}

function resetFormStatus() {
    editId = null;
    formTitle.textContent = "Agregar nueva canción";
    formTitle.classList.remove("edit-mode-header");
    btnSubmitForm.textContent = "Guardar Canción";
    btnSubmitForm.classList.remove("btn-edit-save");
}

// Eventos para abrir/cerrar formulario flotante
btnOpenForm.addEventListener("click", openModal);
btnCancelForm.addEventListener("click", closeModal);

// Cerrar si se hace clic fuera del recuadro del formulario
formOverlay.addEventListener("click", (e) => {
    if (e.target === formOverlay) closeModal();
});

// ==========================================================================
// ESCUCHA EN TIEMPO REAL (FIRESTORE -> APP)
// ==========================================================================
onSnapshot(songsCollection, (snapshot) => {
    allSongs = [];
    snapshot.forEach((doc) => {
        allSongs.push({ id: doc.id, ...doc.data() });
    });
    // Ordenar alfabéticamente por título por defecto
    allSongs.sort((a, b) => a.title.localeCompare(b.title));
    renderSongs(allSongs);
});

// ==========================================================================
// RENDERIZADO / DIBUJADO DE TARJETAS EN PANTALLA
// ==========================================================================
function renderSongs(songs) {
    songsListContainer.innerHTML = "";

    if (songs.length === 0) {
        songsListContainer.innerHTML = `<p style="text-align:center; color:var(--text-muted);">No se encontraron canciones.</p>`;
        return;
    }

    songs.forEach((song) => {
        const card = document.createElement("div");
        card.className = "song-card";

        card.innerHTML = `
            <div class="song-header">
                <div class="song-title-area">
                    <div class="song-title">${song.title}</div>
                    <div class="song-genre">${song.genre}</div>
                </div>
            </div>
            <div class="song-meta">
                <div class="meta-item"><strong>Tono:</strong> ${song.key || 'N/A'}</div>
                <div class="meta-item"><strong>BPM:</strong> ${song.bpm || 'N/A'}</div>
            </div>
            <pre class="song-lyrics">${song.lyrics}</pre>
            <div class="song-actions">
                <button class="btn-action btn-edit" data-id="${song.id}">✏️</button>
                <button class="btn-action btn-delete" data-id="${song.id}">🗑️</button>
            </div>
        `;

        songsListContainer.appendChild(card);
    });

    // Asignar eventos a los botones de las tarjetas recién creadas
    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.addEventListener("click", () => editSong(btn.dataset.id));
    });

    document.querySelectorAll(".btn-delete").forEach(btn => {
        btn.addEventListener("click", () => deleteSong(btn.dataset.id));
    });
}

// ==========================================================================
// FILTRO DE BÚSQUEDA en tiempo real
// ==========================================================================
searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = allSongs.filter(song => 
        song.title.toLowerCase().includes(term) || 
        song.genre.toLowerCase().includes(term) ||
        song.lyrics.toLowerCase().includes(term)
    );
    renderSongs(filtered);
});

// ==========================================================================
// LÓGICA DE NEGOCIO: AGREGAR, EDITAR Y ELIMINAR
// ==========================================================================

// Función v2.2.2: Cargar datos en el formulario para editar
function editSong(id) {
    const song = allSongs.find(s => s.id === id);
    if (!song) return;

    editId = id; // Guardamos el ID que estamos editando

    // Cambiar textos de la interfaz visualmente para modo edición
    formTitle.textContent = "Editar canción";
    formTitle.classList.add("edit-mode-header");
    btnSubmitForm.textContent = "Guardar cambios";
    btnSubmitForm.classList.add("btn-edit-save");

    // Precargar datos en los inputs del formulario
    document.getElementById("songTitle").value = song.title;
    document.getElementById("songGenre").value = song.genre;
    document.getElementById("songKey").value = song.key || "";
    document.getElementById("songBpm").value = song.bpm || "";
    document.getElementById("songLyrics").value = song.lyrics;

    openModal();
}

// Función para borrar canción
async function deleteSong(id) {
    if (confirm("¿Seguro que querés eliminar esta canción del cancionero?")) {
        try {
            await deleteDoc(doc(db, "canciones", id));
        } catch (error) {
            console.error("Error al eliminar: ", error);
            alert("No se pudo eliminar la canción.");
        }
    }
}

// Envío del Formulario (Guardar / Modificar)
songForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const updatedData = {
        title: document.getElementById("songTitle").value.trim(),
        genre: document.getElementById("songGenre").value,
        key: document.getElementById("songKey").value.trim(),
        bpm: document.getElementById("songBpm").value.trim(),
        lyrics: document.getElementById("songLyrics").value.trim()
    };

    if (!updatedData.title || !updatedData.lyrics) {
        alert("Por favor, completá al menos el Título y la Letra.");
        return;
    }

    if (editId) {
        // PENDIENTE v2.2.3: Aquí irá la actualización en vez de duplicar.
        // Por ahora, para mantener el estado exacto de la v2.2.2, se deja el aviso.
        alert("Modo edición detectado. En el próximo paso (v2.2.3) activaremos el guardado en Firestore.");
        closeModal();
    } else {
        // Modo Agregar normal
        try {
            await addDoc(songsCollection, updatedData);
            closeModal();
        } catch (error) {
            console.error("Error al agregar canción: ", error);
            alert("Hubo un error al guardar la canción.");
        }
    }
});
