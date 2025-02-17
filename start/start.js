// Global variables
let customerData = {};
let capturedDataUrl = "";  // Full captured image from camera/upload/url
let croppedDataUrl = "";   // Cropped image (auto-cropped or via Cropper.js)
let cropper = null;        // Cropper.js instance
let cameraStream = null;
let activePointers = new Map();  // For custom pinch-to-zoom

document.addEventListener('DOMContentLoaded', () => {
  // Step 1: Customer Info
  document.getElementById('toStep2').addEventListener('click', () => {
    const name = document.getElementById('customerName').value.trim();
    if (!name) {
      alert('Please enter the customer name.');
      return;
    }
    customerData.name = name;
    customerData.email = document.getElementById('customerEmail').value.trim();
    customerData.phone = document.getElementById('customerPhone').value.trim();
    showStep('step2');
  });

  // Photo Option Buttons
  document.querySelectorAll('.photo-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const option = e.currentTarget.getAttribute('data-option');
      hideAllPhotoSections();
      if (option === 'take') {
        document.getElementById('takePhotoSection').style.display = 'block';
        startCamera();
      } else if (option === 'upload') {
        document.getElementById('uploadPhotoSection').style.display = 'block';
      } else if (option === 'url') {
        document.getElementById('urlPhotoSection').style.display = 'block';
      }
    });
  });

  // Back Buttons
  document.querySelectorAll('.backToOptions').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopCamera();
      hideAllPhotoSections();
    });
  });

  // Handle Upload
  document.getElementById('uploadInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        capturedDataUrl = ev.target.result;
        autoCropCapturedImage(capturedDataUrl);
      };
      reader.readAsDataURL(file);
    }
  });

  // Handle URL input
  document.getElementById('loadUrlImage').addEventListener('click', () => {
    const url = document.getElementById('imageUrlInput').value.trim();
    if (url) {
      capturedDataUrl = url;
      autoCropCapturedImage(capturedDataUrl);
    } else {
      alert('Please enter a valid URL.');
    }
  });

  // Capture Photo from Camera
  document.getElementById('capturePhoto').addEventListener('click', () => {
    captureFromCamera();
  });

  // Flash Toggle (switch)
  document.getElementById('flashToggle').addEventListener('change', (e) => {
    if (cameraStream) {
      const [track] = cameraStream.getVideoTracks();
      if (track.getCapabilities().torch) {
        track.applyConstraints({ advanced: [{ torch: e.target.checked }] });
      }
    }
  });

  // Cropping Section Buttons
  document.getElementById('cropButton').addEventListener('click', () => {
    if (cropper) {
      const croppedCanvas = cropper.getCroppedCanvas({
        width: 1080,
        height: 1080,
        imageSmoothingQuality: 'high'
      });
      croppedDataUrl = croppedCanvas.toDataURL('image/jpeg');
      cropper.destroy();
      cropper = null;
      document.getElementById('previewImage').src = croppedDataUrl;
      hideAllPhotoSections();
      document.getElementById('previewSection').style.display = 'block';
    }
  });

  document.getElementById('fitEntireButton').addEventListener('click', () => {
    if (cropper) {
      const srcCanvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
      const size = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'blur(20px)';
      ctx.drawImage(srcCanvas, 0, 0, size, size);
      ctx.filter = 'none';
      const scale = Math.min(size / srcCanvas.width, size / srcCanvas.height);
      const imgW = srcCanvas.width * scale;
      const imgH = srcCanvas.height * scale;
      const dx = (size - imgW) / 2;
      const dy = (size - imgH) / 2;
      ctx.drawImage(srcCanvas, dx, dy, imgW, imgH);
      croppedDataUrl = canvas.toDataURL('image/jpeg');
      document.getElementById('previewImage').src = croppedDataUrl;
      hideAllPhotoSections();
      document.getElementById('previewSection').style.display = 'block';
    }
  });

  document.getElementById('recropFromPreview').addEventListener('click', () => {
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
    initializeCropper();
  });
  document.getElementById('changePhoto').addEventListener('click', resetPhotoProcess);
  document.getElementById('changePhotoFromPreview').addEventListener('click', resetPhotoProcess);

  // Confirm Photo: Set final image and go to final page
  document.getElementById('confirmPhoto').addEventListener('click', () => {
    document.getElementById('finalImage').src = croppedDataUrl;
    setupPrefilledMessage();
    showStep('step3');
  });

  // Final Page Buttons
  document.getElementById('adjustCropping').addEventListener('click', () => {
    document.getElementById('cropImage').src = capturedDataUrl;
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
    initializeCropper();
    showStep('step2');
  });
  document.getElementById('changeFinalImage').addEventListener('click', () => {
    resetPhotoProcess();
    showStep('step2');
  });

  document.getElementById('copyLink').addEventListener('click', () => {
    const linkText = document.getElementById('shortLink').innerText;
    navigator.clipboard.writeText(linkText).then(() => {
      alert('Link copied to clipboard.');
    });
  });
  document.getElementById('textLink').addEventListener('click', () => {
    alert('Simulating sending a text message.');
  });
  document.getElementById('emailLink').addEventListener('click', () => {
    alert('Simulating sending an email.');
  });
  document.getElementById('bothLink').addEventListener('click', () => {
    alert('Simulating sending text and email.');
  });
  document.getElementById('showQR').addEventListener('click', () => {
    const qr = document.getElementById('qrCode');
    qr.style.display = qr.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('copyMessage').addEventListener('click', () => {
    const msg = document.getElementById('prefilledMessage');
    msg.select();
    document.execCommand('copy');
    alert('Message copied to clipboard.');
  });
  document.getElementById('startOver').addEventListener('click', () => {
    resetAll();
    showStep('step1');
  });
});

// Utility: Show a step
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

// Utility: Hide all photo sections
function hideAllPhotoSections() {
  document.querySelectorAll('.photo-section').forEach(section => {
    section.style.display = 'none';
  });
}

// Reset photo flow
function resetPhotoProcess() {
  stopCamera();
  hideAllPhotoSections();
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  capturedDataUrl = "";
  croppedDataUrl = "";
  document.getElementById('uploadInput').value = '';
  document.getElementById('imageUrlInput').value = '';
}

// Setup prefilled message
function setupPrefilledMessage() {
  const msgTemplate = `${customerData.name},\n\nThanks for purchasing a car with me today. I would appreciate if you followed the link to share a review and photo of your new car on social media, to let your friends and family know!\n\nToby\nDemo Auto Sales`;
  document.getElementById('prefilledMessage').value = msgTemplate;
}

// --- Camera Functions ---

// Custom pinch-to-zoom using pointer events on the video element
function initPinchZoom(video, track) {
  activePointers.clear();
  let initialDistance = 0;
  let initialZoom = track.getSettings().zoom || 1;
  
  video.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      initialDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      initialZoom = track.getSettings().zoom || 1;
    }
  });
  
  video.addEventListener('pointermove', (e) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        const points = Array.from(activePointers.values());
        const newDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const ratio = newDistance / initialDistance;
        let newZoom = initialZoom * ratio;
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
          newZoom = Math.max(capabilities.zoom.min, Math.min(newZoom, capabilities.zoom.max));
          track.applyConstraints({ advanced: [{ zoom: newZoom }] });
        }
      }
    }
  });
  
  video.addEventListener('pointerup', (e) => activePointers.delete(e.pointerId));
  video.addEventListener('pointercancel', (e) => activePointers.delete(e.pointerId));
}

function startCamera() {
  const video = document.getElementById('cameraPreview');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        cameraStream = stream;
        video.srcObject = stream;
        video.play();
        const [track] = stream.getVideoTracks();
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
          initPinchZoom(video, track);
        }
      })
      .catch((err) => {
        alert('Camera access denied or not available.');
      });
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function captureFromCamera() {
  const video = document.getElementById('cameraPreview');
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = video.videoWidth;
  fullCanvas.height = video.videoHeight;
  const ctx = fullCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
  // Calculate crop from the fixed overlay:
  // The camera container is 400x400; overlay "hole" is 300x300 centered.
  const containerSize = 400;
  const holeSize = 300;
  const scale = fullCanvas.width / containerSize;
  const offset = ((containerSize - holeSize) / 2) * scale;
  const cropSize = holeSize * scale;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropSize;
  cropCanvas.height = cropSize;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(fullCanvas, offset, offset, cropSize, cropSize, 0, 0, cropSize, cropSize);
  capturedDataUrl = cropCanvas.toDataURL('image/jpeg');
  croppedDataUrl = capturedDataUrl;
  stopCamera();
  // Go directly to final page with auto-cropped image
  document.getElementById('finalImage').src = croppedDataUrl;
  showStep('step3');
}

// --- Cropping Functions ---
function loadImageForCrop(src) {
  capturedDataUrl = src;
  document.getElementById('cropImage').src = src;
  hideAllPhotoSections();
  document.getElementById('cropSection').style.display = 'block';
  initializeCropper();
}

function initializeCropper() {
  if (cropper) {
    cropper.destroy();
  }
  const image = document.getElementById('cropImage');
  cropper = new Cropper(image, {
    aspectRatio: 1,
    viewMode: 1,
    movable: true,
    zoomable: true,
    rotatable: false,
    scalable: false,
    cropBoxResizable: false,
    autoCropArea: 1,
    responsive: true,
    guides: false,
    highlight: false,
    background: false,
    dragMode: 'move',
    cropBoxMovable: false,
    toggleDragModeOnDblclick: false,
    ready: function () {
      const imageData = cropper.getImageData();
      const containerData = cropper.getContainerData();
      const scale = Math.max(containerData.width / imageData.naturalWidth, containerData.height / imageData.naturalHeight);
      cropper.zoomTo(scale);
    }
  });
}

// Auto-crop function for upload/url: use same calculations as captureFromCamera.
function autoCropCapturedImage(src) {
  const tempImage = new Image();
  tempImage.onload = () => {
    const containerSize = 400;
    const holeSize = 300;
    const scale = tempImage.width / containerSize;
    const offset = ((containerSize - holeSize) / 2) * scale;
    const cropSize = holeSize * scale;
    const canvas = document.createElement('canvas');
    canvas.width = cropSize;
    canvas.height = cropSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tempImage, offset, offset, cropSize, cropSize, 0, 0, cropSize, cropSize);
    capturedDataUrl = src;
    croppedDataUrl = canvas.toDataURL('image/jpeg');
    document.getElementById('finalImage').src = croppedDataUrl;
    showStep('step3');
  };
  tempImage.src = src;
}

// Reset everything
function resetAll() {
  customerData = {};
  capturedDataUrl = "";
  croppedDataUrl = "";
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById('customerForm').reset();
  resetPhotoProcess();
  hideAllPhotoSections();
}
