
// --- 1. DOM Elements ---
const els = {
    signalSelect: document.getElementById('signalSelect'),
    btnLoad: document.getElementById('btnLoad'),
    btnReset: document.getElementById('btnReset'),
    btnPtStartWrapper: document.getElementById('btnPtStartWrapper'),

    // Chart Containers
    chart1Wrapper: document.querySelectorAll('.chart-wrapper')[0],
    chart2Wrapper: document.querySelectorAll('.chart-wrapper')[1],

    // Downloads & Notifications
    btnDownload1: document.getElementById('btnDownload1'),
    btnDownload2: document.getElementById('btnDownload2'),
    toast: document.getElementById('toast'),

    // Controls & Sliders
    timeSlider: document.getElementById('timeSlider'),
    intervalValue: document.getElementById('intervalValue'),
    btnZoom: document.getElementById('btnZoomToggle'),
    popupScroll: document.getElementById('popupScrollContainer'),
    scrollSlider: document.getElementById('scrollSlider'),

    // Pan Tompkins UI
    ptStartContainer: document.getElementById('ptStartContainer'),
    ptStepsContainer: document.getElementById('ptStepsContainer'),
    btnPtStart: document.getElementById('btnPtStart'),
    btnPtNext: document.getElementById('btnPtNext'),
    btnPtPrev: document.getElementById('btnPtPrev'),
    btnDisplayResult: document.getElementById('btnDisplayResult'),
    ptChecklist: document.getElementById('ptChecklist'),

    // Data Table Cells
    valRRCurrent: document.getElementById('valRRCurrent'),
    valHRCurrent: document.getElementById('valHRCurrent'),
    valRRAvg: document.getElementById('valRRAvg'),
    valHRAvg: document.getElementById('valHRAvg'),

    // Modal
    btnInstructions: document.getElementById('btnInstructions'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalContent: document.getElementById('modalContent')
};

// --- 2. Chart Configurations ---
const ctx1 = document.getElementById('chart1').getContext('2d');
const ctx2 = document.getElementById('chart2').getContext('2d');

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { mode: 'index', intersect: false },
    elements: {
        point: { radius: 0 },
        line: { borderWidth: 1.5, tension: 0.1 }
    },
    scales: {
        x: { type: 'linear', min: 0, ticks: { callback: (val) => val.toFixed(1) + 's' } },
        y: { display: true }
    },
    plugins: {
        legend: { display: false },
        title: {
            display: true,
            font: { weight: 'bold', size: 14 }
        }
    }
};

const chart1 = new Chart(ctx1, {
    type: 'line',
    data: { datasets: [] },
    options: JSON.parse(JSON.stringify(commonOptions))
});

const chart2 = new Chart(ctx2, {
    type: 'line',
    data: { datasets: [] },
    options: JSON.parse(JSON.stringify(commonOptions))
});

chart1.options.plugins.title.text = 'Upper Graph';
chart2.options.plugins.title.text = 'Output Graph';

// --- 3. Animation & Feedback Helpers ---

function animateValue(obj, start, end, duration) {
    if (end === "-" || isNaN(end)) {
        obj.innerHTML = end;
        return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = (progress * (end - start) + start).toFixed(obj.id.includes('RR') ? 3 : 1);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('show');
    void els.toast.offsetWidth; // Trigger reflow
    els.toast.classList.add('show');
}

// --- 4. Core Logic & UI Sync ---

function updateChecklist() {
    els.ptChecklist.innerHTML = "";
    PT_STAGES.forEach((stage, idx) => {
        const div = document.createElement('div');
        let className = 'checklist-item';
        // Update: Check is done if current step is 6 (Result) or if index is less than current step
        let isDone = (state.currentPTStep === 6) || (idx < state.currentPTStep);

        if (!isDone && idx === state.currentPTStep) className += ' active';
        if (isDone) className += ' done';

        div.className = className;
        div.innerHTML = `
            <span class="check-icon">${isDone ? '✓' : ''}</span>
            <span class="check-text">${idx + 1}. ${stage}</span>
`;

        els.ptChecklist.appendChild(div);
    });
}

function updateGraphs() {
    const minX = state.scrollOffset;
    const maxX = state.scrollOffset + state.windowSize;

    [chart1, chart2].forEach(c => {
        c.options.scales.x.min = minX;
        c.options.scales.x.max = maxX;
    });

    if (state.hasLoaded && state.currentPTStep === -1) {
        chart1.data.datasets = [{
            label: 'Raw Signal',
            data: state.rawSignal.map((v, i) => ({ x: state.timeAxis[i], y: v })),
            borderColor: 'red'
        }];
        chart1.options.plugins.title.text = "RAW ECG SIGNAL";
        chart2.data.datasets = [];
    }

    if (state.currentPTStep >= 0) {
        const { rawSignal: raw, ptSignals: sigs, timeAxis: time } = state;
        let uData = [], oData = [], uTitle = "", oTitle = "";

        switch (state.currentPTStep) {
            case 0:
                uTitle = "RAW ECG SIGNAL";
                uData = [{ label: 'Raw', data: raw.map((v, i) => ({ x: time[i], y: v })), borderColor: 'red' }];
                oTitle = "OUTPUT GRAPH ";
                break;
            case 1:
                uTitle = "RAW ECG SIGNAL";
                uData = [{ label: 'Raw', data: raw.map((v, i) => ({ x: time[i], y: v })), borderColor: 'red' }];
                oTitle = "BANDPASS FILTERED SIGNAL";
                oData = [{ label: 'Bandpass', data: sigs[0].map((v, i) => ({ x: time[i], y: v })), borderColor: 'blue' }];
                break;
            case 2:
                uTitle = "BANDPASS FILTERED SIGNAL";
                uData = [{ label: 'Bandpass', data: sigs[0].map((v, i) => ({ x: time[i], y: v })), borderColor: 'blue' }];
                oTitle = "DIFFERENTIATED SIGNAL";
                oData = [{ label: 'Differentiated', data: sigs[1].map((v, i) => ({ x: time[i], y: v })), borderColor: 'green' }];
                break;
            case 3:
                uTitle = "DIFFERENTIATED SIGNAL";
                uData = [{ label: 'Differentiated', data: sigs[1].map((v, i) => ({ x: time[i], y: v })), borderColor: 'green' }];
                oTitle = "SQUARED SIGNAL";
                oData = [{ label: 'Squared', data: sigs[2].map((v, i) => ({ x: time[i], y: v })), borderColor: 'purple' }];
                break;
            case 4:
                uTitle = "SQUARED SIGNAL";
                uData = [{ label: 'Squared', data: sigs[2].map((v, i) => ({ x: time[i], y: v })), borderColor: 'purple' }];
                oTitle = "INTEGRATED SIGNAL";
                oData = [{ label: 'Integrated', data: sigs[3].map((v, i) => ({ x: time[i], y: v })), borderColor: 'orange' }];
                break;
            // NEW CASE: Step 5 (Thresholding - visualizes Integration before Peak detection)
            // Inside updateGraphs() switch statement:

            case 5:
                uTitle = "SQUARED SIGNAL";
                uData = [{ label: 'Squared', data: sigs[2].map((v, i) => ({ x: time[i], y: v })), borderColor: 'purple' }];

                // MODIFIED: Added peak marking logic here so it shows on "Next"
                oTitle = "THRESHOLDING & PEAK DETECTION";
                const step5Peaks = sigs[4].map((v, i) => v ? { x: time[i], y: sigs[3][i] } : null).filter(v => v);
                oData = [
                    { label: 'Integrated', data: sigs[3].map((v, i) => ({ x: time[i], y: v })), borderColor: 'orange' },
                    { type: 'scatter', label: 'Detected Peaks', data: step5Peaks, backgroundColor: 'red', pointRadius: 6 }
                ];
                break;

            case 6:
                // This case now mainly handles the final "Result" state for the graphs
                uTitle = "BANDPASS FILTERED";
                const uPeaks = sigs[4].map((v, i) => v ? { x: time[i], y: sigs[0][i] } : null).filter(v => v);
                uData = [
                    { label: 'Bandpass', data: sigs[0].map((v, i) => ({ x: time[i], y: v })), borderColor: 'blue' },
                    { type: 'scatter', label: 'R-Peaks', data: uPeaks, backgroundColor: 'red', pointRadius: 6 }
                ];
                oTitle = "INTEGRATED SIGNAL WITH DETECTED PEAKS";
                const oPeaks = sigs[4].map((v, i) => v ? { x: time[i], y: sigs[3][i] } : null).filter(v => v);
                oData = [
                    { label: 'Integrated', data: sigs[3].map((v, i) => ({ x: time[i], y: v })), borderColor: 'grey' },
                    { type: 'scatter', label: 'Detected Peaks', data: oPeaks, backgroundColor: 'red', pointRadius: 6 }
                ];
                break;
                break;
        }
        chart1.options.plugins.title.text = uTitle;
        chart1.data.datasets = uData;
        chart2.options.plugins.title.text = oTitle;
        chart2.data.datasets = oData;
    }

    chart1.update();
    chart2.update();
    updatePopupSliderVisibility();
    updateDataTable();
}

function updatePopupSliderVisibility() {
    const isFullView = state.windowSize >= (state.totalDuration - 0.1);
    if (!isFullView) {
        els.popupScroll.classList.add('active');
        els.scrollSlider.max = (state.totalDuration - state.windowSize) * 10;
        els.scrollSlider.value = state.scrollOffset * 10;
    } else {
        els.popupScroll.classList.remove('active');
    }
}

let hasAnimatedResult = false;

function updateDataTable() {
    // Update: Only show results if state is 6 (Result displayed)
    if (state.currentPTStep !== 6 || state.peaks.length < 2) {
        ["valRRCurrent", "valHRCurrent", "valRRAvg", "valHRAvg"].forEach(id => els[id].innerText = "-");
        hasAnimatedResult = false;
        return;
    }

    const rrIntervals = [];
    for (let i = 1; i < state.peaks.length; i++) {
        rrIntervals.push(state.timeAxis[state.peaks[i]] - state.timeAxis[state.peaks[i - 1]]);
    }
    const avgRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;

    if (!hasAnimatedResult) {
        animateValue(els.valRRAvg, 0, avgRR, 800);
        animateValue(els.valHRAvg, 0, (60 / avgRR), 800);
        hasAnimatedResult = true;
    } else {
        els.valRRAvg.innerText = avgRR.toFixed(3);
        els.valHRAvg.innerText = (60 / avgRR).toFixed(1);
    }

    const minX = state.scrollOffset;
    const maxX = minX + state.windowSize;
    const visiblePeaks = state.peaks.filter(idx => state.timeAxis[idx] >= minX && state.timeAxis[idx] <= maxX);

    if (visiblePeaks.length >= 2) {
        let currentRR = state.timeAxis[visiblePeaks[1]] - state.timeAxis[visiblePeaks[0]];
        els.valRRCurrent.innerText = currentRR.toFixed(3);
        els.valHRCurrent.innerText = (60 / currentRR).toFixed(1);
    } else {
        els.valRRCurrent.innerText = "-";
        els.valHRCurrent.innerText = "-";
    }
}

// --- 5. Event Listeners ---

// Input Handling
els.signalSelect.addEventListener('change', (e) => {
    state.selectedFile = e.target.value;
    els.btnLoad.textContent = "Load Raw Signal";
    els.btnPtStart.disabled = true;
});

els.btnLoad.addEventListener('click', async () => {
    els.btnLoad.disabled = true;
    if (await loadECGData()) {
        state.hasLoaded = true;
        state.currentPTStep = -1;
        state.peaks = [];
        els.chart1Wrapper.style.display = 'block';
        els.chart2Wrapper.style.display = 'none';
        els.ptStartContainer.style.display = 'block';
        els.ptStepsContainer.style.display = 'none';
        els.btnPtNext.disabled = false;
        els.btnPtNext.textContent = "Next";
        els.btnPtPrev.disabled = true;
        els.btnDisplayResult.style.display = 'none';
        els.btnPtNext.style.display = 'inline-block';
        els.timeSlider.disabled = false;
        els.timeSlider.max = state.totalDuration;
        const isMobile = window.innerWidth <= 768;
        state.isZoomedIn = true; // Set to true since we are zooming into 10s
        state.windowSize = isMobile ? Math.min(1.0, state.totalDuration) : Math.min(10.0, state.totalDuration);
        els.btnZoom.innerText = "Zoom Out"; 
        els.timeSlider.value = state.windowSize;
        els.intervalValue.innerText = state.windowSize.toFixed(1) + 's';
        els.btnZoom.disabled = false; // Added: enable zoom after load
        
        updateChecklist();
        updateGraphs();
    }
    els.btnLoad.disabled = false;
});
// Navigation & Zoom
els.timeSlider.addEventListener('input', (e) => {
    state.windowSize = parseFloat(e.target.value);
    els.intervalValue.innerText = state.windowSize.toFixed(1) + 's';
    if (state.scrollOffset + state.windowSize > state.totalDuration) {
        state.scrollOffset = Math.max(0, state.totalDuration - state.windowSize);
    }
    els.btnZoom.innerText = state.windowSize < state.totalDuration - 0.1 ? "Zoom Out" : "Zoom In";
    updateGraphs();
});

els.scrollSlider.addEventListener('input', (e) => {
    state.scrollOffset = parseFloat(e.target.value) / 10;
    updateGraphs();
});

els.btnZoom.addEventListener('click', () => {
    if (state.isZoomedIn) {
        state.windowSize = state.totalDuration;
        state.scrollOffset = 0;
        els.btnZoom.innerText = "Zoom In";
    } else {
        state.windowSize = Math.min(1.0, state.totalDuration);
        els.btnZoom.innerText = "Zoom Out";
    }
    state.isZoomedIn = !state.isZoomedIn;
    els.timeSlider.value = state.windowSize;
    els.intervalValue.innerText = state.windowSize.toFixed(1) + 's';
    updateGraphs();
});

els.btnReset.addEventListener('click', () => location.reload());

// Pan-Tompkins Step Control
els.btnPtStart.addEventListener('click', () => {
    if (!state.hasLoaded) { // Changed: check state instead of disabled attribute
        Swal.fire({
            icon: 'warning',
            title: 'Please Load Raw Signal',
            confirmButtonText: 'OK',
            confirmButtonColor: '#3085d6'
        });
        return;
    }
    state.ptSignals = runPanTompkins(state.rawSignal);
    els.chart2Wrapper.style.display = 'block';
    els.ptStartContainer.style.display = 'none';
    els.ptStepsContainer.style.display = 'block';
    els.ptStepsContainer.classList.add('animate-entry');
    
    state.currentPTStep = 0;
    els.btnPtNext.textContent = "Next";
    els.btnPtNext.style.display = 'inline-block';
    els.btnDisplayResult.style.display = 'none';
    els.btnPtNext.disabled = false;
    els.btnPtPrev.disabled = true;
    
    updateChecklist();
    updateGraphs();
});

els.btnPtNext.addEventListener('click', () => {
    // Update: Allow stepping up to step 5 (Thresholding)
    if (state.currentPTStep < 5) {
        state.currentPTStep++;
        els.btnPtPrev.disabled = false;

        // If we are at step 5 (Thresholding), hide Next and show Result button
        if (state.currentPTStep === 5) {
            els.btnPtNext.style.display = 'none';
            els.btnDisplayResult.style.display = 'block';
        }
        updateChecklist();
        updateGraphs();
    }
});

els.btnDisplayResult.addEventListener('click', () => {
    // Update: Move to Step 6 (Result) when clicked
    state.currentPTStep = 6;
    els.btnDisplayResult.style.display = 'none';
    els.btnPtNext.style.display = 'inline-block';
    els.btnPtNext.disabled = true;
    els.btnPtNext.textContent = "Result Displayed";
    updateChecklist();
    updateGraphs();
});

els.btnPtPrev.addEventListener('click', () => {
    if (state.currentPTStep > 0) {
        // Update: If coming back from Step 6 (Result)
        if (state.currentPTStep === 6) {
            els.btnPtNext.style.display = 'none';
            els.btnDisplayResult.style.display = 'block';
            els.btnPtNext.disabled = false;
        }
        state.currentPTStep--;

        // Update: If coming back to Step 4 from 5
        if (state.currentPTStep === 4) {
            els.btnDisplayResult.style.display = 'none';
            els.btnPtNext.style.display = 'inline-block';
            els.btnPtNext.textContent = "Next";
        }

        if (state.currentPTStep === 0) els.btnPtPrev.disabled = true;
        updateChecklist();
        updateGraphs();
    }
});

// Exports
els.btnDownload1.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'upper_graph.png';
    link.href = document.getElementById('chart1').toDataURL();
    link.click();
    showToast("Upper Graph Downloaded");
});

els.btnDownload2.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'output_graph.png';
    link.href = document.getElementById('chart2').toDataURL();
    link.click();
    showToast("Output Graph Downloaded");
});

// Modal Logic
els.btnInstructions.addEventListener('click', (e) => {
    e.stopPropagation();
    els.modalOverlay.style.display = 'flex';
});

els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) els.modalOverlay.style.display = 'none';
});