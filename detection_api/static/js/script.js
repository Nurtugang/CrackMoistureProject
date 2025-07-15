let demoImagesLoaded = false;
let currentStream = null;

async function openCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not supported in this browser');
        }

        let stream = null;
        
        const cameraOptions = [
            { video: { facingMode: 'environment' } },
            { video: { facingMode: 'user' } },        
            { video: true },                    
            { video: { facingMode: { ideal: 'environment' } } } 
        ];

        for (let i = 0; i < cameraOptions.length; i++) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(cameraOptions[i]);
                break;
            } catch (err) {
                console.log(`Camera option ${i + 1} failed:`, err.message);
                
                if (i === cameraOptions.length - 1) {
                    throw err;
                }
            }
        }

        if (!stream) {
            throw new Error('No camera stream available');
        }

        currentStream = stream;
        const video = document.getElementById('cameraVideo');
        video.srcObject = stream;
        document.getElementById('cameraModal').style.display = 'block';
        
        showCameraInfo(stream);
        
    } catch (error) {
        handleCameraError(error);
    }
}

function showCameraInfo(stream) {
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    
    let cameraType = 'Unknown';
    if (settings.facingMode === 'environment') {
        cameraType = 'Back Camera';
    } else if (settings.facingMode === 'user') {
        cameraType = 'Front Camera';
    } else {
        cameraType = 'Camera';
    }
    
    console.log(`Using: ${cameraType}`);
}

function handleCameraError(error) {
    let errorMessage = 'Camera access failed';
    let suggestions = '';
    
    switch (error.name) {
        case 'NotAllowedError':
            errorMessage = 'Camera access denied';
            suggestions = 'Please allow camera access in your browser settings and try again.';
            break;
            
        case 'NotFoundError':
            errorMessage = 'No camera found';
            suggestions = 'Make sure your device has a camera and try again.';
            break;
            
        case 'NotReadableError':
            errorMessage = 'Camera is busy';
            suggestions = 'Close other apps using the camera and try again.';
            break;
            
        case 'OverconstrainedError':
            errorMessage = 'Camera constraints not supported';
            suggestions = 'Your camera doesn\'t support the required settings.';
            break;
            
        case 'SecurityError':
            errorMessage = 'Camera access blocked by security';
            suggestions = 'This page needs HTTPS to access camera on mobile devices.';
            break;
            
        default:
            if (error.message.includes('Camera API not supported')) {
                errorMessage = 'Camera not supported';
                suggestions = 'Your browser doesn\'t support camera access.';
            } else {
                errorMessage = 'Camera error: ' + error.message;
                suggestions = 'Please try uploading an image instead.';
            }
    }
    
    showCameraError(errorMessage, suggestions);
}

function showCameraError(message, suggestions) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = `
        <strong>${message}</strong><br>
        <small>${suggestions}</small><br>
        <small style="margin-top: 10px; display: block;">
            💡 <strong>Alternatives:</strong> 
            <span style="color: #007bff; cursor: pointer;" onclick="document.getElementById('fileInput').click()">
                Upload Image
            </span> or 
            <span style="color: #007bff; cursor: pointer;" onclick="toggleDemoImages()">
                Use Demo Images
            </span>
        </small>
    `;
    errorDiv.style.display = 'block';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 8000);
}

function closeCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    document.getElementById('cameraModal').style.display = 'none';
    hideError();
}

function capturePhoto() {
    try {
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        const ctx = canvas.getContext('2d');
        
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            throw new Error('Video not ready for capture');
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        canvas.toBlob(blob => {
            if (blob) {
                closeCamera();
                processImage(blob);
            } else {
                throw new Error('Failed to capture image');
            }
        }, 'image/jpeg', 0.9);
        
    } catch (error) {
        showError('Failed to capture photo: ' + error.message);
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            showError('Please select a valid image file');
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            showError('Image file too large. Please select a file smaller than 10MB');
            return;
        }
        
        processImage(file);
    }
}

function processDemoImage(base64Image) {
    try {
        fetch(base64Image)
            .then(res => {
                if (!res.ok) {
                    throw new Error('Failed to load demo image');
                }
                return res.blob();
            })
            .then(blob => processImage(blob))
            .catch(error => {
                showError('Failed to load demo image: ' + error.message);
            });
    } catch (error) {
        showError('Error processing demo image: ' + error.message);
    }
}

async function loadDemoImages() {
    if (demoImagesLoaded) return;
    
    try {
        showLoading(true);
        const response = await fetch('/api/demo-images/');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        const container = document.getElementById('demoImages');
        container.innerHTML = '';
        
        if (!data.demo_images || data.demo_images.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No demo images available</p>';
            demoImagesLoaded = true;
            return;
        }
        
        data.demo_images.forEach(img => {
            const div = document.createElement('div');
            div.className = 'demo-image';
            div.onclick = () => processDemoImage(img.image_base64);
            
            div.innerHTML = `
                <img src="${img.image_base64}" alt="${img.name}" 
                     onerror="this.parentElement.style.display='none'">
                <div class="demo-image-name">${img.name}</div>
            `;
            
            container.appendChild(div);
        });
        
        demoImagesLoaded = true;
        
    } catch (error) {
        showError('Failed to load demo images: ' + error.message);
        const container = document.getElementById('demoImages');
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Demo images unavailable</p>';
    } finally {
        showLoading(false);
    }
}

function toggleDemoImages() {
    const container = document.getElementById('demoImages');
    if (container.style.display === 'none') {
        container.style.display = 'grid';
        loadDemoImages();
    } else {
        container.style.display = 'none';
    }
}

async function processImage(imageBlob) {
    showLoading(true);
    hideError();
    hideResults();
    
    const formData = new FormData();
    formData.append('image', imageBlob);
    
    try {
        const response = await fetch('/api/detect/', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayResults(data);
        } else {
            showError(data.error || 'Processing failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    } finally {
        showLoading(false);
    }
}

function displayResults(data) {
    const resultSection = document.getElementById('resultSection');
    const processedImage = document.getElementById('processedImage');
    const bboxContainer = document.getElementById('bboxContainer');
    const summaryContainer = document.getElementById('detectionSummary');
    const listContainer = document.getElementById('detectionList');
    
    processedImage.src = data.image_base64;
    processedImage.onload = () => {
        setTimeout(() => {
            drawBoundingBoxes(data.detections);
        }, 100);
    };
    
    const crackCount = data.detections.filter(d => d.type === 'crack').length;
    const moistureCount = data.detections.filter(d => d.type === 'moisture').length;
    
    summaryContainer.innerHTML = `
        <div class="summary-card">
            <h3>${crackCount}</h3>
            <p>Cracks Found</p>
        </div>
        <div class="summary-card">
            <h3>${moistureCount}</h3>
            <p>Moisture Issues</p>
        </div>
        <div class="summary-card">
            <h3>${data.detections.length}</h3>
            <p>Total Defects</p>
        </div>
    `;
    
    listContainer.innerHTML = '';
    data.detections.forEach(detection => {
        const li = document.createElement('li');
        li.className = `detection-item ${detection.type}`;
        li.innerHTML = `
            <strong>${detection.category.name}</strong>
            <span class="confidence">${(detection.confidence * 100).toFixed(1)}%</span>
            <br>
            <small>Type: ${detection.type.charAt(0).toUpperCase() + detection.type.slice(1)}</small>
        `;
        listContainer.appendChild(li);
    });
    
    resultSection.style.display = 'block';
}

function drawBoundingBoxes(detections) {
    const container = document.getElementById('bboxContainer');
    const image = document.getElementById('processedImage');
    
    container.innerHTML = '';
    
    const bboxElements = detections.map((detection, index) => {
        const bbox = detection.bbox;
        const div = document.createElement('div');
        div.className = `bbox bbox-${detection.type}`;
        
        const leftPercent = (bbox.x1 / 512) * 100;
        const topPercent = (bbox.y1 / 512) * 100;
        const widthPercent = ((bbox.x2 - bbox.x1) / 512) * 100;
        const heightPercent = ((bbox.y2 - bbox.y1) / 512) * 100;
        
        div.style.left = leftPercent + '%';
        div.style.top = topPercent + '%';
        div.style.width = widthPercent + '%';
        div.style.height = heightPercent + '%';
        
        const shortName = getShortName(detection.category.name);
        
        const label = document.createElement('div');
        label.className = 'bbox-label';
        label.textContent = shortName;
        label.style.opacity = '0.9';
        
        div.appendChild(label);
        container.appendChild(div);
        
        return {
            element: div,
            label: label,
            bbox: bbox,
            leftPercent,
            topPercent,
            widthPercent,
            heightPercent
        };
    });
    
    positionLabelsIntelligently(bboxElements);
    
    avoidLabelCollisions(bboxElements);
}

function getShortName(fullName) {
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;
    
    if (isSmallMobile) {
        const shortNames = {
            'Serviceability (>5 <15mm)': 'Serv.',
            'Serviceability (>15 <25mm)': 'Serv.',
            'Aesthetic (>1 <5mm)': 'Aest.',
            'Stability (>25mm)': 'Stab.',
            'Rising Damp': 'R.Damp',
            'Penetrating Damp': 'P.Damp',
            'Condensation': 'Cond.',
            'Fine': 'Fine'
        };
        return shortNames[fullName] || fullName.substring(0, 5);
    } else if (isMobile) {
        const mediumNames = {
            'Serviceability (>5 <15mm)': 'Service.',
            'Serviceability (>15 <25mm)': 'Service.',
            'Aesthetic (>1 <5mm)': 'Aesthetic',
            'Stability (>25mm)': 'Stability',
            'Rising Damp': 'Rising Damp',
            'Penetrating Damp': 'Pen. Damp',
            'Condensation': 'Condensation',
            'Fine': 'Fine'
        };
        return mediumNames[fullName] || fullName;
    }
    
    return fullName;
}

function positionLabelsIntelligently(bboxElements) {
    bboxElements.forEach(item => {
        const { label, topPercent, leftPercent, widthPercent, heightPercent } = item;
        
        const isNearTop = topPercent < 15;
        const isNearBottom = topPercent > 85;
        const isNearLeft = leftPercent < 10;
        const isNearRight = leftPercent > 90;
        
        if (isNearTop) {
            label.style.top = '100%';
            label.style.bottom = 'auto';
            label.style.marginTop = '2px';
        } else if (isNearBottom) {
            label.style.top = 'auto';
            label.style.bottom = '100%';
            label.style.marginBottom = '2px';
        } else {
            label.style.top = '-25px';
            label.style.bottom = 'auto';
        }
        
        if (isNearRight) {
            label.style.left = 'auto';
            label.style.right = '0';
        } else {
            label.style.left = '0';
            label.style.right = 'auto';
        }
    });
}

function avoidLabelCollisions(bboxElements) {
    const labels = bboxElements.map(item => ({
        element: item.label,
        bbox: item.element.getBoundingClientRect(),
        originalItem: item
    }));
    
    labels.sort((a, b) => a.bbox.top - b.bbox.top);
    
    for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
            const labelA = labels[i];
            const labelB = labels[j];
            
            if (isColliding(labelA.bbox, labelB.bbox)) {
                adjustLabelPosition(labelB, labelA.bbox);
                
                labelB.bbox = labelB.element.getBoundingClientRect();
            }
        }
    }
}

function isColliding(rect1, rect2) {
    const margin = 5;
    return !(rect1.right + margin < rect2.left || 
             rect1.left > rect2.right + margin || 
             rect1.bottom + margin < rect2.top || 
             rect1.top > rect2.bottom + margin);
}

function adjustLabelPosition(label, conflictingRect) {
    const element = label.element;
    const currentRect = element.getBoundingClientRect();
    
    const rightShift = conflictingRect.right - currentRect.left + 10;
    if (rightShift > 0) {
        element.style.transform = `translateX(${rightShift}px)`;
    }
    
    setTimeout(() => {
        const newRect = element.getBoundingClientRect();
        if (isColliding(newRect, conflictingRect)) {
            const downShift = conflictingRect.bottom - newRect.top + 5;
            element.style.transform = `translate(${rightShift}px, ${downShift}px)`;
        }
    }, 0);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = `
        <strong>⚠️ ${message}</strong><br>
        <small style="margin-top: 5px; display: block;">
            💡 <strong>Try instead:</strong> 
            <span style="color: #007bff; cursor: pointer;" onclick="document.getElementById('fileInput').click()">
                Upload Image
            </span> or 
            <span style="color: #007bff; cursor: pointer;" onclick="toggleDemoImages()">
                Use Demo Images
            </span>
        </small>
    `;
    errorDiv.style.display = 'block';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 6000);
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function hideResults() {
    document.getElementById('resultSection').style.display = 'none';
}

window.addEventListener('resize', () => {
    const container = document.getElementById('bboxContainer');
    if (container.children.length > 0) {
        setTimeout(() => {
            const detections = Array.from(container.children).map(child => ({
                bbox: {
                    x1: parseFloat(child.style.left) * 512 / 100,
                    y1: parseFloat(child.style.top) * 512 / 100,
                    x2: (parseFloat(child.style.left) + parseFloat(child.style.width)) * 512 / 100,
                    y2: (parseFloat(child.style.top) + parseFloat(child.style.height)) * 512 / 100
                },
                type: child.classList.contains('bbox-crack') ? 'crack' : 'moisture',
                category: {
                    name: child.querySelector('.bbox-label').textContent
                }
            }));
            
            drawBoundingBoxes(detections);
        }, 100);
    }
});