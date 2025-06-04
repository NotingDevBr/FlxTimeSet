import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables for Firebase and user ID
let app;
let db;
let auth;
let userId;
let isAuthReady = false;

// UI Elements
const loadingIndicator = document.getElementById('loading-indicator');
const userIdDisplay = document.getElementById('user-id-display');
const messageBox = document.getElementById('message-box');

// Control Tab Elements
const carPlateInput = document.getElementById('car-plate-input');
const driverIdInput = document.getElementById('driver-id-input');
const managementNameInput = document.getElementById('management-name-input');
const operationTypeSelect = document.getElementById('operation-type-select');
const startDelayBtn = document.getElementById('start-delay-btn');
const togglePauseResumeBtn = document.getElementById('toggle-pause-resume-btn');
const endDelayBtn = document.getElementById('end-delay-btn');

// Dashboard Elements
const startDateInput = document.getElementById('start-date-input');
const endDateInput = document.getElementById('end-date-input');
const generatePdfBtn = document.getElementById('generate-pdf-btn');
const activeDelaysList = document.getElementById('active-delays-list');
const completedDelaysTableBody = document.getElementById('completed-delays-table-body');

// Settings Tab Elements - Cars
const settingsCarPlateInput = document.getElementById('settings-car-plate');
const settingsCarModelInput = document.getElementById('settings-car-model');
const addCarBtn = document.getElementById('add-car-btn');
const carsListBody = document.getElementById('cars-list-body');

// Settings Tab Elements - Drivers
const settingsDriverIdInput = document.getElementById('settings-driver-id');
const settingsDriverNameInput = document.getElementById('settings-driver-name');
const addDriverBtn = document.getElementById('add-driver-btn');
const driversListBody = document.getElementById('drivers-list-body');

// Settings Tab Elements - Managements
const settingsManagementNameInput = document.getElementById('settings-management-name');
const addManagementBtn = document.getElementById('add-management-btn');
const managementsListBody = document.getElementById('managements-list-body');

// State for active delay
let activeDelayDoc = null; // Stores the Firestore document snapshot of the active delay
let activeDelayInterval = null; // Stores the interval ID for updating the active delay timer

// --- Utility Functions ---

/**
 * Shows a message box with a given message and type (success, error, info).
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', or 'info'.
 */
function showMessageBox(message, type) {
    messageBox.textContent = message;
    messageBox.classList.remove('hidden', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800', 'bg-blue-100', 'text-blue-800');
    if (type === 'success') {
        messageBox.classList.add('bg-green-100', 'text-green-800');
    } else if (type === 'error') {
        messageBox.classList.add('bg-red-100', 'text-red-800');
    } else { // info
        messageBox.classList.add('bg-blue-100', 'text-blue-800');
    }
    setTimeout(() => {
        messageBox.classList.add('hidden');
    }, 5000); // Hide after 5 seconds
}

/**
 * Formats milliseconds into H:MM:SS format.
 * @param {number} ms - Time in milliseconds.
 * @returns {string} Formatted time string.
 */
function formatDuration(ms) {
    if (ms < 0) return '00:00:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));

    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Calculates the total active duration from segments.
 * @param {Array<Object>} segments - Array of {start: timestamp, end: timestamp | null}
 * @returns {number} Total active duration in milliseconds.
 */
function calculateTotalDuration(segments) {
    let total = 0;
    segments.forEach(segment => {
        if (segment.start && segment.end) {
            total += (segment.end - segment.start);
        } else if (segment.start && !segment.end) {
            // If segment is active, add time up to now
            total += (Date.now() - segment.start);
        }
    });
    return total;
}

/**
 * Toggles loading indicator visibility.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleLoading(show) {
    if (show) {
        loadingIndicator.classList.remove('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

// --- Firebase Initialization and Authentication ---

window.onload = async () => {
    toggleLoading(true);
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                isAuthReady = true;
                console.log("Firebase Auth Ready. User ID:", userId);
                // Once authenticated, start listening for data
                setupFirestoreListeners();
                toggleLoading(false);
            } else {
                // Sign in anonymously if no user is logged in
                try {
                    if (typeof __initial_auth_token !== 'undefined') {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Firebase Auth Error:", error);
                    showMessageBox("Erro ao autenticar. Tente recarregar a página.", "error");
                    toggleLoading(false);
                }
            }
        });

    } catch (error) {
        console.error("Erro na inicialização do Firebase:", error);
        showMessageBox("Erro ao inicializar o aplicativo. Verifique o console.", "error");
        toggleLoading(false);
    }
};

// --- Firestore Data Listeners ---

/**
 * Sets up real-time listeners for all necessary collections.
 */
function setupFirestoreListeners() {
    if (!isAuthReady || !userId) {
        console.warn("Firestore listeners not set up: Auth not ready or userId missing.");
        return;
    }

    // Listen for Cars
    onSnapshot(collection(db, `artifacts/${__app_id}/users/${userId}/cars`), (snapshot) => {
        const cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCarsList(cars);
    }, (error) => {
        console.error("Erro ao carregar carros:", error);
        showMessageBox("Erro ao carregar carros.", "error");
    });

    // Listen for Drivers
    onSnapshot(collection(db, `artifacts/${__app_id}/users/${userId}/drivers`), (snapshot) => {
        const drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDriversList(drivers);
    }, (error) => {
        console.error("Erro ao carregar motoristas:", error);
        showMessageBox("Erro ao carregar motoristas.", "error");
    });

    // Listen for Managements
    onSnapshot(collection(db, `artifacts/${__app_id}/users/${userId}/managements`), (snapshot) => {
        const managements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderManagementsList(managements);
    }, (error) => {
        console.error("Erro ao carregar gerências:", error);
        showMessageBox("Erro ao carregar gerências.", "error");
    });

    // Listen for Delays (active and completed)
    onSnapshot(collection(db, `artifacts/${__app_id}/users/${userId}/delays`), (snapshot) => {
        const delays = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDashboard(delays);
    }, (error) => {
        console.error("Erro ao carregar atrasos:", error);
        showMessageBox("Erro ao carregar atrasos.", "error");
    });
}

// --- Tab Switching Logic ---

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
    });
});

// --- Control Tab Functions ---

/**
 * Enables/Disables control buttons based on active delay state.
 */
function updateControlButtons() {
    if (activeDelayDoc) {
        startDelayBtn.disabled = true;
        togglePauseResumeBtn.disabled = false;
        endDelayBtn.disabled = false;

        if (activeDelayDoc.data().status === 'paused') {
            togglePauseResumeBtn.innerHTML = '<i class="fas fa-play-circle mr-2"></i>Continuar Atraso';
            togglePauseResumeBtn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
            togglePauseResumeBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
        } else {
            togglePauseResumeBtn.innerHTML = '<i class="fas fa-pause-circle mr-2"></i>Pausar Atraso';
            togglePauseResumeBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            togglePauseResumeBtn.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
        }
    } else {
        startDelayBtn.disabled = false;
        togglePauseResumeBtn.disabled = true;
        endDelayBtn.disabled = true;
        togglePauseResumeBtn.innerHTML = '<i class="fas fa-pause-circle mr-2"></i>Pausar / <i class="fas fa-play-circle mr-2"></i>Continuar';
        togglePauseResumeBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        togglePauseResumeBtn.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
    }
}

/**
 * Starts a new delay timer.
 */
startDelayBtn.addEventListener('click', async () => {
    if (!isAuthReady) {
        showMessageBox("Aguarde a autenticação do usuário.", "info");
        return;
    }

    const carPlate = carPlateInput.value.trim().toUpperCase();
    const driverId = driverIdInput.value.trim();
    const managementName = managementNameInput.value.trim();
    const operationType = operationTypeSelect.value;

    if (!carPlate || !driverId || !managementName) {
        showMessageBox("Por favor, preencha todos os campos: Placa, Matrícula do Motorista e Gerência.", "error");
        return;
    }

    // Basic check if car/driver/management exist in settings (optional, can be more robust)
    // For simplicity, we'll assume they exist for now or allow new ones.
    // A more robust system would fetch from settings and validate.

    toggleLoading(true);
    try {
        const newDelayRef = await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/delays`), {
            carPlate,
            driverId,
            managementName,
            operationType,
            status: 'active',
            segments: [{ start: Date.now(), end: null }], // Start the first segment
            totalDurationMs: 0,
            createdAt: Date.now()
        });
        activeDelayDoc = await getDoc(newDelayRef); // Get the snapshot
        showMessageBox("Atraso iniciado com sucesso!", "success");
        updateControlButtons();
        // Clear inputs after starting
        carPlateInput.value = '';
        driverIdInput.value = '';
        managementNameInput.value = '';
    } catch (e) {
        console.error("Erro ao iniciar atraso: ", e);
        showMessageBox("Erro ao iniciar atraso. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});

/**
 * Toggles pause/resume for the active delay.
 */
togglePauseResumeBtn.addEventListener('click', async () => {
    if (!activeDelayDoc || !isAuthReady) return;

    const delayData = activeDelayDoc.data();
    const currentSegments = delayData.segments || [];

    toggleLoading(true);
    try {
        if (delayData.status === 'active') {
            // Pause: Close the last active segment
            const lastSegmentIndex = currentSegments.length - 1;
            if (lastSegmentIndex >= 0 && currentSegments[lastSegmentIndex].end === null) {
                currentSegments[lastSegmentIndex].end = Date.now();
            }
            await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/delays`, activeDelayDoc.id), {
                status: 'paused',
                segments: currentSegments
            });
            showMessageBox("Atraso pausado.", "info");
        } else if (delayData.status === 'paused') {
            // Resume: Add a new segment
            currentSegments.push({ start: Date.now(), end: null });
            await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/delays`, activeDelayDoc.id), {
                status: 'active',
                segments: currentSegments
            });
            showMessageBox("Atraso retomado.", "success");
        }
        activeDelayDoc = await getDoc(doc(db, `artifacts/${__app_id}/users/${userId}/delays`, activeDelayDoc.id)); // Refresh snapshot
        updateControlButtons();
    } catch (e) {
        console.error("Erro ao pausar/continuar atraso: ", e);
        showMessageBox("Erro ao pausar/continuar atraso. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});

/**
 * Ends the active delay and calculates total duration.
 */
endDelayBtn.addEventListener('click', async () => {
    if (!activeDelayDoc || !isAuthReady) return;

    const delayData = activeDelayDoc.data();
    let currentSegments = delayData.segments || [];

    toggleLoading(true);
    try {
        // If active, close the last segment before finalizing
        if (delayData.status === 'active') {
            const lastSegmentIndex = currentSegments.length - 1;
            if (lastSegmentIndex >= 0 && currentSegments[lastSegmentIndex].end === null) {
                currentSegments[lastSegmentIndex].end = Date.now();
            }
        }

        const totalDurationMs = calculateTotalDuration(currentSegments);

        await updateDoc(doc(db, `artifacts/${__app_id}/users/${userId}/delays`, activeDelayDoc.id), {
            status: 'completed',
            segments: currentSegments, // Save final segments
            totalDurationMs: totalDurationMs,
            endTime: Date.now()
        });
        showMessageBox("Atraso finalizado e relatório parcial gerado no Dashboard!", "success");
        activeDelayDoc = null; // Clear active delay
        clearInterval(activeDelayInterval); // Stop updating timer
        updateControlButtons();
    } catch (e) {
        console.error("Erro ao finalizar atraso: ", e);
        showMessageBox("Erro ao finalizar atraso. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});

// --- Dashboard Functions ---

/**
 * Renders the dashboard with active and completed delays.
 * @param {Array<Object>} delays - Array of delay objects from Firestore.
 */
function renderDashboard(delays) {
    const activeDelays = delays.filter(d => d.status === 'active' || d.status === 'paused');
    const completedDelays = delays.filter(d => d.status === 'completed');

    // Render Active Delays
    activeDelaysList.innerHTML = '';
    if (activeDelays.length === 0) {
        activeDelaysList.innerHTML = '<p class="text-gray-500 text-center col-span-full">Nenhum atraso ativo no momento.</p>';
        activeDelayDoc = null; // Ensure no active delay is set if none exist
        clearInterval(activeDelayInterval);
        updateControlButtons();
    } else {
        // Find the delay that is currently being tracked by the control tab
        // For simplicity, we'll assume only one delay can be actively managed at a time
        // If multiple active delays are possible, this logic needs refinement.
        activeDelayDoc = activeDelays.length > 0 ? { id: activeDelays[0].id, data: () => activeDelays[0] } : null;
        updateControlButtons();

        activeDelays.forEach(delay => {
            const delayCard = document.createElement('div');
            delayCard.className = 'bg-gray-50 p-4 rounded-lg shadow-md border border-gray-200';
            delayCard.innerHTML = `
                <p class="text-lg font-semibold text-gray-800 mb-2">${delay.carPlate} - ${delay.operationType}</p>
                <p class="text-gray-600">Motorista: ${delay.driverId}</p>
                <p class="text-gray-600">Gerência: ${delay.managementName}</p>
                <p class="text-gray-600">Status: <span class="font-medium ${delay.status === 'active' ? 'text-green-600' : 'text-yellow-600'}">${delay.status === 'active' ? 'Ativo' : 'Pausado'}</span></p>
                <p class="text-gray-600">Início: ${new Date(delay.segments[0].start).toLocaleString()}</p>
                <p class="text-xl font-bold text-blue-700 mt-2">Duração: <span id="timer-${delay.id}">00:00:00</span></p>
            `;
            activeDelaysList.appendChild(delayCard);

            // Update timer every second
            if (delay.status === 'active') {
                clearInterval(activeDelayInterval); // Clear previous interval if any
                activeDelayInterval = setInterval(() => {
                    const timerSpan = document.getElementById(`timer-${delay.id}`);
                    if (timerSpan) {
                        timerSpan.textContent = formatDuration(calculateTotalDuration(delay.segments));
                    }
                }, 1000);
            } else {
                 // If paused, just show current calculated duration
                 const timerSpan = document.getElementById(`timer-${delay.id}`);
                 if (timerSpan) {
                     timerSpan.textContent = formatDuration(calculateTotalDuration(delay.segments));
                 }
            }
        });
    }

    // Render Completed Delays
    completedDelaysTableBody.innerHTML = '';
    if (completedDelays.length === 0) {
        completedDelaysTableBody.innerHTML = '<tr><td colspan="7" class="py-4 px-6 text-center text-gray-500">Nenhum atraso finalizado.</td></tr>';
    } else {
        completedDelays.forEach(delay => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-200 hover:bg-gray-100';
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${delay.carPlate}</td>
                <td class="py-3 px-6 text-left">${delay.driverId}</td>
                <td class="py-3 px-6 text-left">${delay.managementName}</td>
                <td class="py-3 px-6 text-left">${delay.operationType}</td>
                <td class="py-3 px-6 text-left">${new Date(delay.segments[0].start).toLocaleString()}</td>
                <td class="py-3 px-6 text-left">${delay.endTime ? new Date(delay.endTime).toLocaleString() : 'N/A'}</td>
                <td class="py-3 px-6 text-left font-semibold">${formatDuration(delay.totalDurationMs)}</td>
            `;
            completedDelaysTableBody.appendChild(row);
        });
    }
}

// --- Settings Tab Functions ---

/**
 * Adds a new car to Firestore.
 */
addCarBtn.addEventListener('click', async () => {
    if (!isAuthReady) { showMessageBox("Aguarde a autenticação do usuário.", "info"); return; }
    const plate = settingsCarPlateInput.value.trim().toUpperCase();
    const model = settingsCarModelInput.value.trim();

    if (!plate) {
        showMessageBox("A placa do carro é obrigatória.", "error");
        return;
    }

    toggleLoading(true);
    try {
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/cars`), {
            plate: plate,
            model: model || 'N/A',
            createdAt: Date.now()
        });
        showMessageBox("Carro adicionado com sucesso!", "success");
        settingsCarPlateInput.value = '';
        settingsCarModelInput.value = '';
    } catch (e) {
        console.error("Erro ao adicionar carro: ", e);
        showMessageBox("Erro ao adicionar carro. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});

/**
 * Renders the list of registered cars.
 * @param {Array<Object>} cars - Array of car objects.
 */
function renderCarsList(cars) {
    carsListBody.innerHTML = '';
    if (cars.length === 0) {
        carsListBody.innerHTML = '<tr><td colspan="3" class="py-4 px-6 text-center text-gray-500">Nenhum carro cadastrado.</td></tr>';
    } else {
        cars.forEach(car => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-200 hover:bg-gray-100';
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${car.plate}</td>
                <td class="py-3 px-6 text-left">${car.model}</td>
                <td class="py-3 px-6 text-center">
                    <button data-id="${car.id}" data-type="car" class="delete-btn bg-red-400 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-lg text-xs shadow-md transition-all duration-200">
                        <i class="fas fa-trash-alt"></i> Excluir
                    </button>
                </td>
            `;
            carsListBody.appendChild(row);
        });
    }
}

/**
 * Adds a new driver to Firestore.
 */
addDriverBtn.addEventListener('click', async () => {
    if (!isAuthReady) { showMessageBox("Aguarde a autenticação do usuário.", "info"); return; }
    const id = settingsDriverIdInput.value.trim();
    const name = settingsDriverNameInput.value.trim();

    if (!id || !name) {
        showMessageBox("Matrícula e nome do motorista são obrigatórios.", "error");
        return;
    }

    toggleLoading(true);
    try {
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/drivers`), {
            id: id,
            name: name,
            createdAt: Date.now()
        });
        showMessageBox("Motorista adicionado com sucesso!", "success");
        settingsDriverIdInput.value = '';
        settingsDriverNameInput.value = '';
    } catch (e) {
        console.error("Erro ao adicionar motorista: ", e);
        showMessageBox("Erro ao adicionar motorista. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});

/**
 * Renders the list of registered drivers.
 * @param {Array<Object>} drivers - Array of driver objects.
 */
function renderDriversList(drivers) {
    driversListBody.innerHTML = '';
    if (drivers.length === 0) {
        driversListBody.innerHTML = '<tr><td colspan="3" class="py-4 px-6 text-center text-gray-500">Nenhum motorista cadastrado.</td></tr>';
    } else {
        drivers.forEach(driver => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-200 hover:bg-gray-100';
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${driver.id}</td>
                <td class="py-3 px-6 text-left">${driver.name}</td>
                <td class="py-3 px-6 text-center">
                    <button data-id="${driver.id}" data-type="driver" class="delete-btn bg-red-400 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-lg text-xs shadow-md transition-all duration-200">
                        <i class="fas fa-trash-alt"></i> Excluir
                    </button>
                </td>
            `;
            driversListBody.appendChild(row);
        });
    }
}

/**
 * Adds a new management entry to Firestore.
 */
addManagementBtn.addEventListener('click', async () => {
    if (!isAuthReady) { showMessageBox("Aguarde a autenticação do usuário.", "info"); return; }
    const name = settingsManagementNameInput.value.trim();

    if (!name) {
        showMessageBox("O nome da gerência é obrigatório.", "error");
        return;
    }

    toggleLoading(true);
    try {
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/managements`), {
            name: name,
            createdAt: Date.now()
        });
        showMessageBox("Gerência adicionada com sucesso!", "success");
        settingsManagementNameInput.value = '';
    } catch (e) {
        console.error("Erro ao adicionar gerência: ", e);
        showMessageBox("Erro ao adicionar gerência. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});

/**
 * Renders the list of registered managements.
 * @param {Array<Object>} managements - Array of management objects.
 */
function renderManagementsList(managements) {
    managementsListBody.innerHTML = '';
    if (managements.length === 0) {
        managementsListBody.innerHTML = '<tr><td colspan="2" class="py-4 px-6 text-center text-gray-500">Nenhuma gerência cadastrada.</td></tr>';
    } else {
        managements.forEach(management => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-200 hover:bg-gray-100';
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${management.name}</td>
                <td class="py-3 px-6 text-center">
                    <button data-id="${management.id}" data-type="management" class="delete-btn bg-red-400 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-lg text-xs shadow-md transition-all duration-200">
                        <i class="fas fa-trash-alt"></i> Excluir
                    </button>
                </td>
            `;
            managementsListBody.appendChild(row);
        });
    }
}

/**
 * Handles deletion of items from settings.
 */
document.addEventListener('click', async (event) => {
    if (event.target.classList.contains('delete-btn')) {
        if (!isAuthReady) { showMessageBox("Aguarde a autenticação do usuário.", "info"); return; }
        const itemId = event.target.dataset.id;
        const itemType = event.target.dataset.type; // 'car', 'driver', 'management'

        let collectionPath = '';
        if (itemType === 'car') {
            collectionPath = `artifacts/${__app_id}/users/${userId}/cars`;
        } else if (itemType === 'driver') {
            collectionPath = `artifacts/${__app_id}/users/${userId}/drivers`;
        } else if (itemType === 'management') {
            collectionPath = `artifacts/${__app_id}/users/${userId}/managements`;
        } else {
            console.error("Tipo de item desconhecido para exclusão.");
            return;
        }

        toggleLoading(true);
        try {
            await deleteDoc(doc(db, collectionPath, itemId));
            showMessageBox(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} excluído com sucesso!`, "success");
        } catch (e) {
            console.error(`Erro ao excluir ${itemType}: `, e);
            showMessageBox(`Erro ao excluir ${itemType}. Tente novamente.`, "error");
        } finally {
            toggleLoading(false);
        }
    }
});

// --- PDF Generation ---

generatePdfBtn.addEventListener('click', async () => {
    if (!isAuthReady) {
        showMessageBox("Aguarde a autenticação do usuário para gerar o PDF.", "info");
        return;
    }

    toggleLoading(true);
    try {
        let delaysQuery = query(collection(db, `artifacts/${__app_id}/users/${userId}/delays`), where('status', '==', 'completed'));

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (startDate) {
            const startTimestamp = new Date(startDate).getTime();
            delaysQuery = query(delaysQuery, where('createdAt', '>=', startTimestamp));
        }
        if (endDate) {
            // To include the whole end day, set the end of the day
            const endTimestamp = new Date(endDate);
            endTimestamp.setHours(23, 59, 59, 999); // Set to end of the day
            delaysQuery = query(delaysQuery, where('createdAt', '<=', endTimestamp.getTime()));
        }

        const completedDelaysSnapshot = await getDocs(delaysQuery);
        const completedDelays = completedDelaysSnapshot.docs.map(doc => doc.data());

        if (completedDelays.length === 0) {
            showMessageBox("Nenhum atraso finalizado para gerar o relatório PDF no período selecionado.", "info");
            toggleLoading(false);
            return;
        }

        // Correct way to instantiate jsPDF from the global object
        const doc = new window.jspdf.jsPDF();
        let y = 10;
        const margin = 10;
        const lineHeight = 7;
        const pageHeight = doc.internal.pageSize.height;

        doc.setFontSize(18);
        doc.text("Relatório de Atrasos de Veículos", margin, y);
        y += lineHeight * 2;

        doc.setFontSize(12);
        doc.text(`Gerado em: ${new Date().toLocaleString()}`, margin, y);
        if (startDate || endDate) {
            doc.text(`Período: ${startDate || 'Início'} a ${endDate || 'Fim'}`, margin, y + lineHeight);
            y += lineHeight;
        }
        y += lineHeight * 2;

        completedDelays.forEach((delay, index) => {
            if (y + lineHeight * 8 > pageHeight - margin) { // Check if new page is needed
                doc.addPage();
                y = margin;
                doc.setFontSize(18);
                doc.text("Relatório de Atrasos de Veículos (Continuação)", margin, y);
                y += lineHeight * 2;
                doc.setFontSize(12);
            }

            doc.setFontSize(14);
            doc.text(`Atraso #${index + 1}`, margin, y);
            y += lineHeight;

            doc.setFontSize(10);
            doc.text(`  Placa: ${delay.carPlate}`, margin, y); y += lineHeight;
            doc.text(`  Motorista: ${delay.driverId}`, margin, y); y += lineHeight;
            doc.text(`  Gerência: ${delay.managementName}`, margin, y); y += lineHeight;
            doc.text(`  Operação: ${delay.operationType}`, margin, y); y += lineHeight;
            doc.text(`  Início: ${new Date(delay.segments[0].start).toLocaleString()}`, margin, y); y += lineHeight;
            doc.text(`  Fim: ${delay.endTime ? new Date(delay.endTime).toLocaleString() : 'N/A'}`, margin, y); y += lineHeight;
            doc.text(`  Duração Total: ${formatDuration(delay.totalDurationMs)}`, margin, y); y += lineHeight;
            y += lineHeight; // Extra space between entries
        });

        doc.save("relatorio_atrasos.pdf");
        showMessageBox("Relatório PDF gerado com sucesso!", "success");

    } catch (e) {
        console.error("Erro ao gerar PDF: ", e);
        showMessageBox("Erro ao gerar relatório PDF. Tente novamente.", "error");
    } finally {
        toggleLoading(false);
    }
});
