// Global variables
let customerData = {};
let capturedDataUrl = "";         // For camera-taken auto-cropped image
let originalCapturedDataUrl = ""; // Full-resolution original (for recropping)
let croppedDataUrl = "";          // Final square image after crop adjustments
let cropper = null;               // Cropper.js instance
let cameraStream = null;
let activePointers = new Map();   // For custom pinch-to-zoom
let currentCamera = "environment"; // "environment" for rear, "user" for front
let maxZoom = 1;                  // Maximum allowed zoom (computed per image)

document.addEventListener('DOMContentLoaded', () => {
  // Step 1: Customer Form
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
  document.querySelectorAll('.photo-option').forEach(btn => {
    btn.addEventListener('click', e => {
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

  // Back buttons
  document.querySelectorAll('.backToOptions').forEach(btn => {
    btn.addEventListener('click', () => {
      stopCamera();
      hideAllPhotoSections();
    });
  });

  // File Upload – load image into crop mode
  document.getElementById('uploadInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        originalCapturedDataUrl = ev.target.result;
        loadImageForCrop(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  });

  // URL Input – load image URL into crop mode
  document.getElementById('loadUrlImage').addEventListener('click', () => {
    const url = document.getElementById('imageUrlInput').value.trim();
    if (url) {
      originalCapturedDataUrl = url;
      loadImageForCrop(url);
    } else {
      alert('Please enter a valid URL.');
    }
  });

  // Capture Photo Button – for camera images auto-crop
  document.getElementById('capturePhoto').addEventListener('click', () => {
    captureFromCamera();
  });

  // Camera Toggle
  document.getElementById('cameraToggle').addEventListener('change', (e) => {
    currentCamera = e.target.checked ? "user" : "environment";
    stopCamera();
    startCamera();
  });

  // Flash Toggle
  document.getElementById('flashToggle').addEventListener('change', e => {
    if (cameraStream) {
      const [track] = cameraStream.getVideoTracks();
      if (track.getCapabilities().torch) {
        track.applyConstraints({ advanced: [{ torch: e.target.checked }] });
      }
    }
  });

  // Cropping Page: Crop Button – manual crop action
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
      document.getElementById('finalImage').src = croppedDataUrl;
      hideAllPhotoSections();
      showStep('step3');
    }
  });

  // Cropping Page: Fit Entire Image Button – generate final image with blurred fill
  document.getElementById('fitEntireButton').addEventListener('click', () => {
    const img = new Image();
    img.onload = () => {
      const size = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw heavily blurred background (40px blur)
      const scaleCover = Math.max(size / img.width, size / img.height);
      const coverWidth = img.width * scaleCover;
      const coverHeight = img.height * scaleCover;
      const coverDx = (size - coverWidth) / 2;
      const coverDy = (size - coverHeight) / 2;
      ctx.filter = 'blur(40px)';
      ctx.drawImage(img, coverDx, coverDy, coverWidth, coverHeight);
      ctx.filter = 'none';

      // Draw the full image using "contain" mode so that the SHORTER side aligns with the crop box
      const scaleFit = Math.min(size / img.width, size / img.height);
      const fitWidth = img.width * scaleFit;
      const fitHeight = img.height * scaleFit;
      const fitDx = (size - fitWidth) / 2;
      const fitDy = (size - fitHeight) / 2;
      ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);

      croppedDataUrl = canvas.toDataURL('image/jpeg');
      document.getElementById('finalImage').src = croppedDataUrl;
      hideAllPhotoSections();
      showStep('step3');
    };
    img.src = originalCapturedDataUrl || capturedDataUrl;
  });

  // Cropping Page: Change Photo Button
  document.getElementById('changePhoto').addEventListener('click', resetPhotoProcess);

  // Final Page: Adjust Cropping Button – reload image into crop mode
  document.getElementById('adjustCropping').addEventListener('click', () => {
    document.getElementById('cropImage').src = originalCapturedDataUrl || capturedDataUrl;
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
    initializeCropper();
    showStep('step2');
  });

  // Final Page: Change Photo Button
  document.getElementById('changeFinalImage').addEventListener('click', () => {
    resetPhotoProcess();
    showStep('step2');
  });

  // Final Page: Share Buttons
  document.getElementById('showQR').addEventListener('click', () => {
    const qr = document.getElementById('qrCode');
    qr.style.display = (qr.style.display === 'none' ? 'block' : 'none');
  });
  document.getElementById('copyMessage').addEventListener('click', () => {
    const msg = document.getElementById('prefilledMessage');
    msg.select();
    document.execCommand('copy');
    alert('Message copied to clipboard.');
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
  document.getElementById('startOver').addEventListener('click', () => {
    resetAll();
    showStep('step1');
  });
});

// Utility: Show step
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

// Utility: Hide all photo sections
function hideAllPhotoSections() {
  document.querySelectorAll('.photo-section').forEach(section => section.style.display = 'none');
}

// Reset photo selection
function resetPhotoProcess() {
  stopCamera();
  hideAllPhotoSections();
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  capturedDataUrl = "";
  originalCapturedDataUrl = "";
  croppedDataUrl = "";
  document.getElementById('uploadInput').value = '';
  document.getElementById('imageUrlInput').value = '';
}

// Setup prefilled message on final page
function setupPrefilledMessage() {
  const msgTemplate = `${customerData.name},\n\nThanks for purchasing a car with me today. I would appreciate if you followed the link to share a review and photo of your new car on social media, to let your friends and family know!\n\nToby\nDemo Auto Sales`;
  document.getElementById('prefilledMessage').value = msgTemplate;
  document.getElementById('finalImage').src = croppedDataUrl;
}

// Camera Functions

function initPinchZoom(video, track) {
  activePointers.clear();
  let initialDistance = 0;
  let initialZoom = track.getSettings().zoom || 1;
  const zoomIndicator = document.getElementById('zoomIndicator');

  video.addEventListener('pointerdown', e => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      initialDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      initialZoom = track.getSettings().zoom || 1;
    }
  });
  
  video.addEventListener('pointermove', e => {
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
        zoomIndicator.style.display = "block";
        zoomIndicator.innerText = ratio > 1 ? "Zooming In..." : "Zooming Out...";
      }
    }
  });
  
  video.addEventListener('pointerup', e => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      zoomIndicator.style.display = "none";
    }
  });
  video.addEventListener('pointercancel', e => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      zoomIndicator.style.display = "none";
    }
  });
}

function startCamera() {
  const video = document.getElementById('cameraPreview');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentCamera } })
      .then(stream => {
        cameraStream = stream;
        video.srcObject = stream;
        video.play();
        const [track] = stream.getVideoTracks();
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
          initPinchZoom(video, track);
        }
      })
      .catch(err => {
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
  // Use a centered square crop based on the shorter dimension
  const minDim = Math.min(fullCanvas.width, fullCanvas.height);
  const offsetX = (fullCanvas.width - minDim) / 2;
  const offsetY = (fullCanvas.height - minDim) / 2;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = minDim;
  cropCanvas.height = minDim;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(fullCanvas, offsetX, offsetY, minDim, minDim, 0, 0, minDim, minDim);
  originalCapturedDataUrl = fullCanvas.toDataURL('image/jpeg');
  capturedDataUrl = cropCanvas.toDataURL('image/jpeg');
  croppedDataUrl = capturedDataUrl;
  stopCamera();
  document.getElementById('finalImage').src = croppedDataUrl;
  setupPrefilledMessage();
  showStep('step3');
}

// Cropping Functions

function loadImageForCrop(src) {
  originalCapturedDataUrl = src;
  document.getElementById('cropImage').src = src;
  hideAllPhotoSections();
  document.getElementById('cropSection').style.display = 'block';
  initializeCropper();
}

function initializeCropper() {
  if (cropper) { cropper.destroy(); }
  const image = document.getElementById('cropImage');
  cropper = new Cropper(image, {
    aspectRatio: 1,
    viewMode: 1,
    movable: true,
    zoomable: true,
    rotatable: false,
    scalable: false,
    cropBoxResizable: false,
    autoCropArea: 0.8,
    responsive: true,
    guides: false,
    highlight: false,
    background: false,
    dragMode: 'move',
    cropBoxMovable: false,
    toggleDragModeOnDblclick: false,
    ready: function () {
      const imageData = cropper.getImageData();
      const cropBoxData = cropper.getCropBoxData();
      // For the maximum zoom, we want the image’s shorter side to exactly align with the crop box.
      if (imageData.naturalWidth < imageData.naturalHeight) {
         // Portrait: shorter side is width
         maxZoom = cropBoxData.width / imageData.naturalWidth;
      } else {
         // Landscape: shorter side is height
         maxZoom = cropBoxData.width / imageData.naturalHeight;
      }
      // Allow zooming out arbitrarily (no enforced minZoom) so that empty space may occur.
    },
    zoom: function(e) {
      // Prevent zooming in beyond the point where the image’s shorter side aligns with the crop box.
      if (e.detail.ratio > maxZoom) {
         cropper.zoomTo(maxZoom);
      }
    }
  });
}

// For camera-taken photos, auto-crop using the image’s shortest side
function autoCropCapturedImage(src) {
  const tempImage = new Image();
  tempImage.onload = () => {
    const minDim = Math.min(tempImage.width, tempImage.height);
    const offsetX = (tempImage.width - minDim) / 2;
    const offsetY = (tempImage.height - minDim) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = minDim;
    canvas.height = minDim;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tempImage, offsetX, offsetY, minDim, minDim, 0, 0, minDim, minDim);
    capturedDataUrl = src;
    croppedDataUrl = canvas.toDataURL('image/jpeg');
    setupPrefilledMessage();
    document.getElementById('finalImage').src = croppedDataUrl;
    showStep('step3');
  };
  tempImage.src = src;
}

// Reset Function
function resetAll() {
  customerData = {};
  capturedDataUrl = "";
  originalCapturedDataUrl = "";
  croppedDataUrl = "";
  if (cropper) { cropper.destroy(); cropper = null; }
  document.getElementById('customerForm').reset();
  resetPhotoProcess();
  hideAllPhotoSections();
}
