// Global variables
let currentStream = null;
let demoImagesLoaded = false;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Crack Classification App initialized');
});

// File selection handler
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processImage(file);
    }
}

// Process image (file or from camera)
function processImage(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
    }

    showLoading();
    hideError();
    hideResults();

    const formData = new FormData();
    formData.append('image', file);

    fetch('/api/detect/', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        hideLoading();
        if (data.success) {
            displayResults(data);
        } else {
            showError(data.error || 'Classification failed');
        }
    })
    .catch(error => {
        hideLoading();
        showError('Network error: ' + error.message);
        console.error('Error:', error);
    });
}

// Display classification results
function displayResults(data) {
    const resultSection = document.getElementById('resultSection');
    const processedImage = document.getElementById('processedImage');
    const classificationCard = document.getElementById('classificationCard');
    
    // Show image
    processedImage.src = data.image_base64;
    
    // Display classification
    if (data.classification) {
        displayClassification(data.classification, data.confidence);
    } else {
        showError('No classification data received');
        return;
    }
    
    // Show results section
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

// Display classification information
function displayClassification(classification, confidence) {
    const severityIndicator = document.getElementById('severityIndicator');
    const categoryTitle = document.getElementById('categoryTitle');
    const categoryDescription = document.getElementById('categoryDescription');
    const confidenceFill = document.getElementById('confidenceFill');
    const confidenceValue = document.getElementById('confidenceValue');
    const actionRequired = document.getElementById('actionRequired');
    const classificationCard = document.getElementById('classificationCard');
    
    // Set severity indicator color
    severityIndicator.style.backgroundColor = classification.color;
    
    // Set title and description
    categoryTitle.textContent = `${classification.category} - ${classification.severity} Severity`;
    categoryDescription.textContent = classification.description;
    
    // Set confidence bar
    const confidencePercent = Math.round(confidence * 100);
    confidenceFill.style.width = confidencePercent + '%';
    confidenceValue.textContent = confidencePercent + '%';
    
    // Set action required
    actionRequired.textContent = classification.action_required;
    actionRequired.style.backgroundColor = getSeverityBackgroundColor(classification.severity);
    actionRequired.style.borderColor = classification.color;
    actionRequired.style.color = getSeverityTextColor(classification.severity);
    
    // Update card border
    classificationCard.style.borderLeftColor = classification.color;
}

// Helper functions for severity styling
function getSeverityBackgroundColor(severity) {
    switch(severity.toLowerCase()) {
        case 'low': return 'rgba(40, 167, 69, 0.1)';
        case 'medium': return 'rgba(255, 193, 7, 0.1)';
        case 'high': return 'rgba(220, 53, 69, 0.1)';
        default: return 'rgba(108, 117, 125, 0.1)';
    }
}

function getSeverityTextColor(severity) {
    switch(severity.toLowerCase()) {
        case 'low': return '#155724';
        case 'medium': return '#856404';
        case 'high': return '#721c24';
        default: return '#6c757d';
    }
}

// Camera functions
function openCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
        } 
    })
    .then(stream => {
        currentStream = stream;
        video.srcObject = stream;
        modal.style.display = 'block';
    })
    .catch(error => {
        showError('Camera access denied or not available');
        console.error('Camera error:', error);
    });
}

function closeCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    
    video.srcObject = null;
    modal.style.display = 'none';
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);
    
    // Convert to blob and process
    canvas.toBlob(blob => {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        closeCamera();
        processImage(file);
    }, 'image/jpeg', 0.9);
}

// Demo images functions
function toggleDemoImages() {
    const demoContainer = document.getElementById('demoImages');
    
    if (demoContainer.style.display === 'none') {
        if (!demoImagesLoaded) {
            loadDemoImages();
        }
        demoContainer.style.display = 'block';
    } else {
        demoContainer.style.display = 'none';
    }
}

function loadDemoImages() {
    const demoContainer = document.getElementById('demoImages');
    
    fetch('/api/demo-images/')
    .then(response => response.json())
    .then(data => {
        if (data.demo_images && data.demo_images.length > 0) {
            demoContainer.innerHTML = '';
            
            data.demo_images.forEach(demo => {
                const demoDiv = document.createElement('div');
                demoDiv.className = 'demo-image';
                demoDiv.onclick = () => processDemoImage(demo.image_base64);
                
                demoDiv.innerHTML = `
                    <img src="${demo.image_base64}" alt="${demo.name}">
                    <div class="demo-image-name">${demo.name}</div>
                `;
                
                demoContainer.appendChild(demoDiv);
            });
            
            demoImagesLoaded = true;
        } else {
            demoContainer.innerHTML = '<p style="text-align: center; color: #666;">No demo images available</p>';
        }
    })
    .catch(error => {
        demoContainer.innerHTML = '<p style="text-align: center; color: #dc3545;">Error loading demo images</p>';
        console.error('Demo images error:', error);
    });
}

function processDemoImage(imageBase64) {
    // Convert base64 to blob
    fetch(imageBase64)
    .then(res => res.blob())
    .then(blob => {
        const file = new File([blob], 'demo-image.jpg', { type: 'image/jpeg' });
        processImage(file);
        
        // Hide demo images
        document.getElementById('demoImages').style.display = 'none';
    })
    .catch(error => {
        showError('Error processing demo image');
        console.error('Demo image processing error:', error);
    });
}

// UI helper functions
function showLoading() {
    document.getElementById('loading').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function hideResults() {
    document.getElementById('resultSection').style.display = 'none';
}

// Health check on load
fetch('/api/health/')
.then(response => response.json())
.then(data => {
    console.log('API Health:', data);
})
.catch(error => {
    console.warn('API health check failed:', error);
});