// --- Constants & State ---
const SAMPLING_RATE = 500; 
const PT_STAGES = [
    "Bandpass Filtering (5-11Hz)",
    "Differentiation",
    "Squaring",
    "Moving Window Integration",
    "Thresholding "
];

let state = {
    selectedFile: 'images/ecg1.csv', 
    rawSignal: [],
    ptSignals: {}, 
    timeAxis: [],
    totalDuration: 0, 
    currentPTStep: -1, 
    isZoomedIn: false,
    windowSize: 0, 
    scrollOffset: 0, 
    peaks: [], 
    hasLoaded: false
};

// --- Signal Loading ---
async function loadECGData() {
    try {
        const response = await fetch(state.selectedFile);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        
        const raw = [];
        const time = [];

        const lines = text.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0) continue;
            
            const parts = line.split(',');
            if (parts.length >= 2) {
                time.push(parseFloat(parts[0]));
                raw.push(parseFloat(parts[1]));
            }
        }

        if (time.length === 0) throw new Error("No valid data found");

        state.rawSignal = raw;
        state.timeAxis = time;
        state.totalDuration = time[time.length - 1];
        state.windowSize = state.totalDuration;
        state.scrollOffset = 0;

        return true;
    } catch (error) {
        console.error(error);
        alert(`Error loading ${state.selectedFile}:\n` + error.message);
        return false;
    }
}

// --- DSP Helper: 2nd Order IIR Filter ---
function applyBiquad(input, a0, a1, a2, b0, b1, b2) {
    const output = new Array(input.length).fill(0);
    for (let i = 0; i < input.length; i++) {
        const x_n = input[i];
        const x_n1 = i > 0 ? input[i-1] : 0;
        const x_n2 = i > 1 ? input[i-2] : 0;
        const y_n1 = i > 0 ? output[i-1] : 0;
        const y_n2 = i > 1 ? output[i-2] : 0;

        output[i] = (b0 * x_n + b1 * x_n1 + b2 * x_n2 - a1 * y_n1 - a2 * y_n2) / a0;
    }
    return output;
}

function getButterworthCoeffs(cutoff, sampleRate, type) {
    const w0 = 2 * Math.PI * cutoff / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / Math.sqrt(2);

    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;
    let b0, b1, b2;

    if (type === 'lowpass') {
        b0 = (1 - cosw0) / 2;
        b1 = 1 - cosw0;
        b2 = (1 - cosw0) / 2;
    } else { 
        b0 = (1 + cosw0) / 2;
        b1 = -(1 + cosw0);
        b2 = (1 + cosw0) / 2;
    }
    return { a0, a1, a2, b0, b1, b2 };
}

// --- Pan-Tompkins Algorithm Logic ---
function runPanTompkins(inputSignal) {
    const data = {};

    // --- Stage 1: Bandpass Filtering (Cascade LP + HP) ---
    const lp = getButterworthCoeffs(11, SAMPLING_RATE, 'lowpass');
    const lowPassed = applyBiquad(inputSignal, lp.a0, lp.a1, lp.a2, lp.b0, lp.b1, lp.b2);
    
    const hp = getButterworthCoeffs(5, SAMPLING_RATE, 'highpass');
    let bandPassed = applyBiquad(lowPassed, hp.a0, hp.a1, hp.a2, hp.b0, hp.b1, hp.b2);

    // Apply Gain to match original paper's amplitude expectations
    const GAIN = 35; 
    data[0] = bandPassed.map(v => v * GAIN);

    // --- Stage 2: Derivative ---
    data[1] = data[0].map((v, i, arr) => {
        if (i < 2 || i > arr.length - 3) return 0;
        return (1 / 8) * (-arr[i - 2] - 2 * arr[i - 1] + 2 * arr[i + 1] + arr[i + 2]);
    });

    // --- Stage 3: Squaring ---
    data[2] = data[1].map(v => v * v);

    // --- Stage 4: Moving Window Integration ---
    const winSize = Math.round(0.150 * SAMPLING_RATE); 
    data[3] = data[2].map((v, i, arr) => {
        let sum = 0;
        for (let j = 0; j < winSize; j++) {
            if (arr[i - j] !== undefined) sum += arr[i - j];
        }
        return sum / winSize;
    });

    // --- Stage 5: Thresholding & Detection (EXACT COPY OF ORIGINAL SCRIPT) ---
    const signalMax = Math.max(...data[3]);
    let spki = signalMax * 0.5; // Running estimate of Signal Peak
    let npki = signalMax * 0.1; // Running estimate of Noise Peak
    let threshold1 = npki + 0.25 * (spki - npki); // THR1 formula

    data[4] = new Array(inputSignal.length).fill(0);
    const detectedPeaks = [];
    let inPeak = false;
    let currentMax = 0;
    let currentMaxIdx = 0;
    
    const refractoryPeriod = Math.round(0.200 * SAMPLING_RATE); 
    let lastPeakIdx = -refractoryPeriod;

    for (let i = 0; i < data[3].length; i++) {
        if (i - lastPeakIdx < refractoryPeriod) continue;

        if (data[3][i] > threshold1) {
            if (!inPeak) {
                inPeak = true;
                currentMax = data[3][i];
                currentMaxIdx = i;
            } else if (data[3][i] > currentMax) {
                currentMax = data[3][i];
                currentMaxIdx = i;
            }
        } else {
            if (inPeak) {
                // Confirm peak and update Signal Estimate (SPKI)
                spki = 0.125 * currentMax + 0.875 * spki;
                
                // Backtrack to find true R-peak in Filtered Signal (data[0])
                let searchCenter = Math.max(0, currentMaxIdx - Math.round(winSize / 2));
                let searchRange = Math.round(0.05 * SAMPLING_RATE);
                let searchStart = Math.max(0, searchCenter - searchRange);
                let searchEnd = Math.min(data[0].length, searchCenter + searchRange);
                
                let localMax = -Infinity;
                let preciseIdx = searchCenter;
                for (let k = searchStart; k < searchEnd; k++) {
                    if (data[0][k] > localMax) {
                        localMax = data[0][k];
                        preciseIdx = k;
                    }
                }

                data[4][preciseIdx] = 1; // Mark the precise index in the filtered signal
                detectedPeaks.push(preciseIdx);
                lastPeakIdx = preciseIdx;
                inPeak = false;
            } else {
                // Update Noise Estimate (NPKI) when no peak is present
                npki = 0.125 * data[3][i] + 0.875 * npki;
            }
            // dynamically update threshold after each point
            threshold1 = npki + 0.25 * (spki - npki);
        }
    }
    
    state.peaks = detectedPeaks;
    return data;
}