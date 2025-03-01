// Global variables
let customerData = {};
let capturedDataUrl = "";         // For camera-taken auto-cropped image
let originalCapturedDataUrl = ""; // Full-resolution original (for recropping)
let croppedDataUrl = "";          // Final cropped image
let cropper = null;               // Cropper.js instance
let savedCropBoxData = null;      // Saved crop box data from initial crop
let savedCanvasData = null;       // Saved canvas (pan/zoom) data from initial crop
let cameraStream = null;
let activePointers = new Map();   // For custom pinch-to-zoom
let currentCamera = "environment"; // "environment" for rear, "user" for front
let currentScale = 1;             // CSS-based scale for pinch zoom
let maxZoom = 1;                  // Computed maximum zoom

// Detect iOS device
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

document.addEventListener('DOMContentLoaded', () => {
  if (isIOS) {
    const fitBtn = document.getElementById('fitEntireButton');
    if (fitBtn) { fitBtn.style.display = 'none'; }
  }

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
      savedCanvasData = null;
      savedCropBoxData = null;
      document.getElementById('photoOptions').style.display = 'none';
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

  // Back buttons for upload/URL screens
  document.querySelectorAll('.backToOptions').forEach(btn => {
    btn.addEventListener('click', () => {
      stopCamera();
      hideAllPhotoSections();
      document.getElementById('photoOptions').style.display = 'flex';
    });
  });
  
  // Camera Back button (upper left)
  document.getElementById('cameraBack').addEventListener('click', () => {
    stopCamera();
    hideAllPhotoSections();
    document.getElementById('photoOptions').style.display = 'flex';
  });

  // File Upload – load image into crop mode
  document.getElementById('uploadInput').addEventListener('change', e => {
    savedCanvasData = null;
    savedCropBoxData = null;
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
    savedCanvasData = null;
    savedCropBoxData = null;
    const url = document.getElementById('imageUrlInput').value.trim();
    if (url) {
      originalCapturedDataUrl = url;
      loadImageForCrop(url, true);
    } else {
      alert('Please enter a valid URL.');
    }
  });

  // Capture Photo Button
  document.getElementById('capturePhoto').addEventListener('click', () => {
    savedCanvasData = null;
    savedCropBoxData = null;
    captureFromCamera();
  });

  // Swap Camera Button
  document.getElementById('swapCamera').addEventListener('click', () => {
    currentCamera = currentCamera === "environment" ? "user" : "environment";
    stopCamera();
    startCamera();
  });

  // Flash Toggle
  document.getElementById('flashToggle').addEventListener('click', e => {
    const btn = e.currentTarget;
    if (cameraStream) {
      const [track] = cameraStream.getVideoTracks();
      if (track.getCapabilities().torch) {
        const isOn = btn.classList.contains('flash-on');
        track.applyConstraints({ advanced: [{ torch: !isOn }] });
        btn.classList.toggle('flash-on', !isOn);
        btn.classList.toggle('flash-off', isOn);
      }
    }
  });

  // Crop Button
  document.getElementById('cropButton').addEventListener('click', () => {
    if (cropper) {
      savedCropBoxData = cropper.getCropBoxData();
      savedCanvasData = cropper.getCanvasData();
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

  // "Fit Entire Image" Button
  document.getElementById('fitEntireButton').addEventListener('click', () => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const size = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scaleCover = Math.max(size / img.width, size / img.height);
      const coverWidth = img.width * scaleCover;
      const coverHeight = img.height * scaleCover;
      const coverDx = (size - coverWidth) / 2;
      const coverDy = (size - coverHeight) / 2;
      const scaleFit = Math.min(size / img.width, size / img.height);
      const fitWidth = img.width * scaleFit;
      const fitHeight = img.height * scaleFit;
      const fitDx = (size - fitWidth) / 2;
      const fitDy = (size - fitHeight) / 2;
      if ('filter' in ctx) {
        ctx.filter = 'blur(40px)';
        ctx.drawImage(img, coverDx, coverDy, coverWidth, coverHeight);
        ctx.filter = 'none';
        ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
      } else {
        getBlurredDataURL(img, 40, size, size, (blurredImg) => {
          ctx.drawImage(blurredImg, coverDx, coverDy, coverWidth, coverHeight);
          ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
        });
      }
      croppedDataUrl = canvas.toDataURL('image/jpeg');
      document.getElementById('finalImage').src = croppedDataUrl;
      hideAllPhotoSections();
      showStep('step3');
    };
    img.src = originalCapturedDataUrl || capturedDataUrl;
  });

  // Cropping Page: Change Photo Button
  document.getElementById('changePhoto').addEventListener('click', () => {
    resetPhotoProcess();
    savedCanvasData = null;
    savedCropBoxData = null;
    document.getElementById('photoOptions').style.display = 'flex';
    showStep('step2');
  });

  // Final Page: Adjust Cropping Button
  document.getElementById('adjustCropping').addEventListener('click', () => {
    const cropImageElement = document.getElementById('cropImage');
    cropImageElement.src = originalCapturedDataUrl || capturedDataUrl;
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
    initializeCropper(() => {
      if (savedCanvasData) { cropper.setCanvasData(savedCanvasData); }
      if (savedCropBoxData) { cropper.setCropBoxData(savedCropBoxData); }
    });
    showStep('step2');
  });

  // Final Page: Change Photo Button
  document.getElementById('changeFinalImage').addEventListener('click', () => {
    resetPhotoProcess();
    savedCanvasData = null;
    savedCropBoxData = null;
    showStep('step2');
  });

  // Share Buttons
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
    qr.style.display = (qr.style.display === 'none' ? 'block' : 'none');
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
    document.getElementById('photoOptions').style.display = 'flex';
  });
});

// Utility Functions
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}
function hideAllPhotoSections() {
  document.querySelectorAll('.photo-section').forEach(section => section.style.display = 'none');
}
function resetPhotoProcess() {
  stopCamera();
  hideAllPhotoSections();
  if (cropper) { cropper.destroy(); cropper = null; }
  capturedDataUrl = "";
  croppedDataUrl = "";
  document.getElementById('uploadInput').value = '';
  document.getElementById('imageUrlInput').value = '';
}
function setupPrefilledMessage() {
  const msgTemplate = `${customerData.name},\n\nThanks for purchasing a car with me today. I would appreciate if you followed the link to share a review and photo of your new car on social media, to let your friends and family know!\n\nToby\nDemo Auto Sales`;
  document.getElementById('prefilledMessage').value = msgTemplate;
  document.getElementById('finalImage').src = croppedDataUrl;
}

// Camera Functions
function initPinchZoom(video) {
  activePointers.clear();
  let initialDistance = 0;
  let initialScale = currentScale;
  const zoomIndicator = document.getElementById('zoomIndicator');
  video.addEventListener('pointerdown', e => {
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const points = Array.from(activePointers.values());
      initialDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      initialScale = currentScale;
    }
  });
  video.addEventListener('pointermove', e => {
    e.preventDefault();
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        const points = Array.from(activePointers.values());
        const newDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const ratio = newDistance / initialDistance;
        let newScale = initialScale * ratio;
        currentScale = newScale;
        let transform = video.style.transform;
        let translateX = 0, translateY = 0;
        const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (match) {
          translateX = parseFloat(match[1]);
          translateY = parseFloat(match[2]);
        }
        video.style.transform = `translate(${translateX}px, ${translateY}px) scale(${newScale})`;
        zoomIndicator.style.display = "block";
        zoomIndicator.innerText = ratio > 1 ? "Zooming In..." : "Zooming Out...";
      }
    }
  });
  video.addEventListener('pointerup', e => {
    e.preventDefault();
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) { zoomIndicator.style.display = "none"; }
  });
  video.addEventListener('pointercancel', e => {
    e.preventDefault();
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) { zoomIndicator.style.display = "none"; }
  });
}
function startCamera() {
  const video = document.getElementById('cameraPreview');
  currentScale = 1;
  video.style.transform = `scale(${currentScale})`;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentCamera } })
      .then(stream => {
        cameraStream = stream;
        video.srcObject = stream;
        video.play();
        initPinchZoom(video);
      })
      .catch(err => { alert('Camera access denied or not available.'); });
  }
}
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}
function captureFromCamera() {
  const container = document.getElementById('cameraContainer');
  const rect = container.getBoundingClientRect();
  // Use "cover" scaling: determine the source rectangle from video to fill container
  const video = document.getElementById('cameraPreview');
  let sx, sy, sWidth, sHeight;
  const containerRatio = rect.width / rect.height;
  const videoRatio = video.videoWidth / video.videoHeight;
  if (videoRatio > containerRatio) {
    // Video is wider: fit height, crop sides
    sHeight = video.videoHeight;
    sWidth = sHeight * containerRatio;
    sx = (video.videoWidth - sWidth) / 2;
    sy = 0;
  } else {
    // Video is taller: fit width, crop top and bottom
    sWidth = video.videoWidth;
    sHeight = sWidth / containerRatio;
    sx = 0;
    sy = (video.videoHeight - sHeight) / 2;
  }
  // Draw video frame onto canvas using cover scaling
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = rect.width;
  fullCanvas.height = rect.height;
  const ctx = fullCanvas.getContext('2d');
  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, rect.width, rect.height);
  
  // Now, the overlay hole is centered and is 300x300 within a 400x400 container.
  const offset = (rect.width - 300) / 2; // expected 50 if container is 400x400
  // Crop the canvas using the overlay coordinates.
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = 300;
  cropCanvas.height = 300;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(fullCanvas, offset, offset, 300, 300, 0, 0, 300, 300);
  
  originalCapturedDataUrl = fullCanvas.toDataURL('image/jpeg');
  capturedDataUrl = cropCanvas.toDataURL('image/jpeg');
  croppedDataUrl = capturedDataUrl;
  
  stopCamera();
  document.getElementById('finalImage').src = croppedDataUrl;
  setupPrefilledMessage();
  showStep('step3');
}
function loadImageForCrop(src, isUrl = false) {
  savedCanvasData = null;
  savedCropBoxData = null;
  if (isUrl) { document.getElementById('cropImage').crossOrigin = "Anonymous"; }
  originalCapturedDataUrl = src;
  document.getElementById('cropImage').src = src;
  hideAllPhotoSections();
  document.getElementById('cropSection').style.display = 'block';
  initializeCropper();
}
function initializeCropper(callback) {
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
    background: true,
    dragMode: 'move',
    cropBoxMovable: false,
    toggleDragModeOnDblclick: false,
    ready: function () {
      const imageData = cropper.getImageData();
      const cropBoxData = cropper.getCropBoxData();
      if (imageData.naturalWidth < imageData.naturalHeight) {
         maxZoom = cropBoxData.width / imageData.naturalWidth;
      } else {
         maxZoom = cropBoxData.width / imageData.naturalHeight;
      }
    }
  });
  if (typeof callback === 'function') { setTimeout(callback, 100); }
}
function getBlurredDataURL(img, blurAmount, width, height, callback) { callback(img); }
function resetAll() {
  customerData = {};
  capturedDataUrl = "";
  originalCapturedDataUrl = "";
  croppedDataUrl = "";
  savedCropBoxData = null;
  savedCanvasData = null;
  if (cropper) { cropper.destroy(); cropper = null; }
  document.getElementById('customerForm').reset();
  resetPhotoProcess();
  hideAllPhotoSections();
}
