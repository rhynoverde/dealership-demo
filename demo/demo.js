// demo.js

// === CONFIGURATION ===
const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632'; // <-- your imgbb API key
const FINAL_WIDTH = 1080;
const FINAL_HEIGHT = 700;
const ASPECT_RATIO = FINAL_WIDTH / FINAL_HEIGHT; // ~1.542857

// === GLOBAL STATE ===
let customerData = {};
let originalCapturedDataUrl = "";
let croppedDataUrl = "";
let cropper = null;
let cameraStream = null;
let activePointers = new Map();
let currentCamera = "environment";
let currentScale = 1;
let maxZoom = 1;

// === UTILITY FUNCTIONS ===
function dataURLtoBlob(dataurl) {
  const parts = dataurl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

// === imgbb UPLOAD FUNCTION ===
async function uploadToImgbb(dataUrl) {
  // Remove the data header and get base64 string only.
  const base64Image = dataUrl.split(',')[1];
  const formData = new FormData();
  formData.append('image', base64Image);
  formData.append('key', IMGBB_API_KEY);
  
  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Upload to imgbb failed: ' + errText);
  }
  const result = await response.json();
  return result.data.display_url; // This is the public image URL from imgbb
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function hideAllPhotoSections() {
  document.querySelectorAll('.photo-section').forEach(s => s.style.display = 'none');
}

function resetPhotoProcess() {
  stopCamera();
  hideAllPhotoSections();
  if (cropper) { cropper.destroy(); cropper = null; }
  originalCapturedDataUrl = "";
  croppedDataUrl = "";
  const up = document.getElementById('uploadInput');
  if (up) up.value = "";
  const urlIn = document.getElementById('imageUrlInput');
  if (urlIn) urlIn.value = "";
}

function setupPrefilledMessage() {
  const msgTemplate = customerData.name + ",\n\nThanks for purchasing a car with me today. I would appreciate if you followed the link to share a review and photo of your new car on social media, to let your friends and family know!\n\nMichael Jones\nDemo Auto Sales";
  const msgField = document.getElementById('prefilledMessage');
  if (msgField) msgField.value = msgTemplate;
}

// === NATIVE B2 CODE REMOVED; imgbb is used instead ===

// === PINCH-ZOOM ON VIDEO ===
function initPinchZoom(video) {
  activePointers.clear();
  let initialDistance = 0, initialScale = currentScale;
  const zoomIndicator = document.getElementById('zoomIndicator');
  video.addEventListener('pointerdown', e => {
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      initialDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialScale = currentScale;
    }
  });
  video.addEventListener('pointermove', e => {
    e.preventDefault();
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      currentScale = initialScale * (newDist / initialDistance);
      video.style.transform = `scale(${currentScale})`;
      if (zoomIndicator) {
        zoomIndicator.style.display = 'block';
        zoomIndicator.innerText = (newDist / initialDistance) > 1 ? 'Zooming In…' : 'Zooming Out…';
      }
    }
  });
  ['pointerup','pointercancel'].forEach(evt => {
    video.addEventListener(evt, e => {
      e.preventDefault();
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2 && zoomIndicator) {
        zoomIndicator.style.display = 'none';
      }
    });
  });
}

// === CAMERA HANDLING ===
function startCamera() {
  const video = document.getElementById('cameraPreview');
  currentScale = 1;
  if (video) video.style.transform = `scale(${currentScale})`;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentCamera } })
      .then(stream => {
        cameraStream = stream;
        if (video) {
          video.srcObject = stream;
          video.play();
          initPinchZoom(video);
        }
      })
      .catch(() => alert('Camera access denied or not available.'));
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

// === IMAGE CAPTURE & CROPPING ===
function captureFromCamera() {
  const container = document.getElementById('cameraContainer');
  const rect = container ? container.getBoundingClientRect() : null;
  const video = document.getElementById('cameraPreview');
  if (!rect || !video) return;
  let sx, sy, sWidth, sHeight;
  const containerRatio = rect.width / rect.height;
  const videoRatio = video.videoWidth / video.videoHeight;
  if (videoRatio > containerRatio) {
    sHeight = video.videoHeight;
    sWidth = sHeight * containerRatio;
    sx = (video.videoWidth - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = video.videoWidth;
    sHeight = sWidth / containerRatio;
    sx = 0;
    sy = (video.videoHeight - sHeight) / 2;
  }
  const captureWidth = 1600;
  const captureHeight = 1600;
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = captureWidth;
  fullCanvas.height = captureHeight;
  const ctx = fullCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, captureWidth, captureHeight);
  }
  const offsetX = (captureWidth - FINAL_WIDTH) / 2;
  const offsetY = (captureHeight - FINAL_HEIGHT) / 2;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = FINAL_WIDTH;
  cropCanvas.height = FINAL_HEIGHT;
  const cropCtx = cropCanvas.getContext('2d');
  if (cropCtx) {
    cropCtx.drawImage(fullCanvas, offsetX, offsetY, FINAL_WIDTH, FINAL_HEIGHT, 0, 0, FINAL_WIDTH, FINAL_HEIGHT);
  }
  originalCapturedDataUrl = fullCanvas.toDataURL('image/jpeg');
  croppedDataUrl = cropCanvas.toDataURL('image/jpeg');
  stopCamera();
  // Upload to imgbb and show final page.
  uploadToImgbb(croppedDataUrl)
    .then(publicUrl => {
      document.getElementById('finalImage').src =
        'https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=' +
        encodeURIComponent(publicUrl);
      showStep('step3');
    })
    .catch(err => alert(err));
}

function loadImageForCrop(src, isUrl = false) {
  originalCapturedDataUrl = src;
  const img = document.getElementById('cropImage');
  if (img) {
    if (isUrl) img.crossOrigin = "Anonymous";
    img.src = src;
  }
  hideAllPhotoSections();
  const cropSection = document.getElementById('cropSection');
  if (cropSection) cropSection.style.display = 'block';
  if (cropper) cropper.destroy();
  cropper = new Cropper(img, {
    aspectRatio: ASPECT_RATIO,
    viewMode: 1,
    autoCropArea: 0.8,
    dragMode: 'move',
    movable: true,
    zoomable: true,
    cropBoxResizable: false,
    cropBoxMovable: false,
    ready() { /* Optional: set maxZoom if desired */ }
  });
}

// === EVENT LISTENERS SETUP ===
document.addEventListener('DOMContentLoaded', () => {
  // Step 1 → Step 2
  document.getElementById('toStep2')?.addEventListener('click', () => {
    const name = document.getElementById('customerName')?.value.trim();
    if (!name) return alert('Please enter the customer name.');
    customerData.name = name;
    customerData.email = document.getElementById('customerEmail')?.value.trim() || '';
    customerData.phone = document.getElementById('customerPhone')?.value.trim() || '';
    showStep('step2');
  });

  // Photo option buttons
  document.querySelectorAll('.photo-option').forEach(btn => {
    btn.addEventListener('click', () => {
      hideAllPhotoSections();
      document.getElementById('photoOptions').style.display = 'none';
      const opt = btn.getAttribute('data-option');
      if (opt === 'take') {
        document.getElementById('takePhotoSection').style.display = 'block';
        startCamera();
      } else if (opt === 'upload') {
        document.getElementById('uploadPhotoSection').style.display = 'block';
      } else {
        document.getElementById('urlPhotoSection').style.display = 'block';
      }
    });
  });

  // Back-to-options
  document.querySelectorAll('.backToOptions').forEach(btn => {
    btn.addEventListener('click', () => {
      resetPhotoProcess();
      document.getElementById('photoOptions').style.display = 'block';
    });
  });
  document.getElementById('cameraBack')?.addEventListener('click', () => {
    resetPhotoProcess();
    document.getElementById('photoOptions').style.display = 'block';
  });

  // File Upload
  document.getElementById('uploadInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadImageForCrop(ev.target.result);
    reader.readAsDataURL(file);
  });

  // Paste URL
  document.getElementById('loadUrlImage')?.addEventListener('click', () => {
    const url = document.getElementById('imageUrlInput')?.value.trim();
    if (!url) return alert('Please enter a valid URL.');
    loadImageForCrop(url, true);
  });

  // Capture
  document.getElementById('capturePhoto')?.addEventListener('click', captureFromCamera);

  // Swap / flash
  document.getElementById('swapCamera')?.addEventListener('click', () => {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    stopCamera(); startCamera();
  });
  document.getElementById('flashToggle')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!cameraStream) return;
    const [track] = cameraStream.getVideoTracks();
    if (!track.getCapabilities().torch) return;
    const on = btn.classList.toggle('flash-on');
    track.applyConstraints({ advanced: [{ torch: on }] });
  });

  // Crop → upload & show final page
  document.getElementById('cropButton')?.addEventListener('click', () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: FINAL_WIDTH, height: FINAL_HEIGHT });
    croppedDataUrl = canvas.toDataURL('image/jpeg');
    cropper.destroy(); cropper = null;
    uploadToImgbb(croppedDataUrl)
      .then(publicUrl => {
        document.getElementById('finalImage').src =
          'https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=' + encodeURIComponent(publicUrl);
        setupPrefilledMessage();
        showStep('step3');
      })
      .catch(err => alert(err));
  });

  // Fit Entire Image
  document.getElementById('fitEntireButton')?.addEventListener('click', () => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FINAL_WIDTH; canvas.height = FINAL_HEIGHT;
      const ctx = canvas.getContext('2d');
      const scaleCover = Math.max(FINAL_WIDTH/img.width, FINAL_HEIGHT/img.height);
      const coverWidth = img.width * scaleCover, coverHeight = img.height * scaleCover;
      const coverDx = (FINAL_WIDTH - coverWidth) / 2, coverDy = (FINAL_HEIGHT - coverHeight) / 2;
      const scaleFit = Math.min(FINAL_WIDTH/img.width, FINAL_HEIGHT/img.height);
      const fitWidth = img.width * scaleFit, fitHeight = img.height * scaleFit;
      const fitDx = (FINAL_WIDTH - fitWidth) / 2, fitDy = (FINAL_HEIGHT - fitHeight) / 2;
      if (ctx) {
        if ('filter' in ctx) {
          ctx.filter = 'blur(40px)';
          ctx.drawImage(img, coverDx, coverDy, coverWidth, coverHeight);
          ctx.filter = 'none';
          ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
        } else {
          getBlurredDataURL(img, 40, FINAL_WIDTH, FINAL_HEIGHT, function(blurredImg) {
            ctx.drawImage(blurredImg, coverDx, coverDy, coverWidth, coverHeight);
            ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
          });
        }
      }
      croppedDataUrl = canvas.toDataURL('image/jpeg');
      uploadToImgbb(croppedDataUrl)
        .then(publicUrl => {
          document.getElementById('finalImage').src =
            'https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=' + encodeURIComponent(publicUrl);
          setupPrefilledMessage();
          showStep('step3');
        })
        .catch(err => alert(err));
    };
    img.src = originalCapturedDataUrl || croppedDataUrl;
  });

  // Change photo
  document.getElementById('changePhoto')?.addEventListener('click', () => {
    resetPhotoProcess();
    document.getElementById('photoOptions').style.display = 'block';
    showStep('step2');
  });

  // Salesperson final page – Text link shows simulated SMS
  document.getElementById('textLink')?.addEventListener('click', () => {
    showStep('textMessagePage');
  });
  document.getElementById('backToStep3')?.addEventListener('click', () => {
    showStep('step3');
  });

  // Text message page – clicking link goes to customer share page
  document.getElementById('messageLink')?.addEventListener('click', e => {
    e.preventDefault();
    uploadToImgbb(croppedDataUrl)
      .then(publicUrl => {
        document.getElementById('customerShareImage').src =
          'https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=' + encodeURIComponent(publicUrl);
        showStep('customerSharePage');
      })
      .catch(err => alert(err));
  });

  // Customer Share Page – Share Now button
  document.getElementById('shareNowButton')?.addEventListener('click', () => {
    if (!navigator.share) return alert('Share API not supported');
    const blob = dataURLtoBlob(croppedDataUrl);
    const file = new File([blob], 'vehicle_review.jpg', { type: blob.type });
    navigator.share({
      files: [file],
      title: 'My Vehicle Purchase',
      text: 'Check out my vehicle purchase review from Michael Jones at Demo Auto Sales!'
    }).catch(console.error);
  });
  document.getElementById('backFromCustomerShare')?.addEventListener('click', () => {
    showStep('textMessagePage');
  });

  // Start over
  document.getElementById('startOver')?.addEventListener('click', () => {
    resetPhotoProcess();
    showStep('step1');
    document.getElementById('photoOptions').style.display = 'block';
  });
});

// === imgbb UPLOAD FUNCTION ===
async function uploadToImgbb(dataUrl) {
  const imgbbApiKey = 'd44d592f97ef193ce535a799d00ef632'; // Your imgbb API key
  // Remove data header and get base64 string only
  const base64Image = dataUrl.split(',')[1];
  const formData = new FormData();
  formData.append('image', base64Image);
  formData.append('key', imgbbApiKey);
  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Upload to imgbb failed: ' + errorText);
  }
  const result = await response.json();
  return result.data.display_url;
}

function getBlurredDataURL(img, blurAmount, width, height, callback) { callback(img); }

function initPinchZoom(video) {
  activePointers.clear();
  let initialDistance = 0;
  let initialScale = currentScale;
  const zoomIndicator = document.getElementById('zoomIndicator');
  video.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      initialDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialScale = currentScale;
    }
  });
  video.addEventListener('pointermove', function(e) {
    e.preventDefault();
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      currentScale = initialScale * (newDist / initialDistance);
      video.style.transform = `scale(${currentScale})`;
      if (zoomIndicator) {
        zoomIndicator.style.display = 'block';
        zoomIndicator.innerText = (newDist / initialDistance) > 1 ? 'Zooming In…' : 'Zooming Out…';
      }
    }
  });
  ['pointerup','pointercancel'].forEach(evt => {
    video.addEventListener(evt, function(e) {
      e.preventDefault();
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2 && zoomIndicator) zoomIndicator.style.display = 'none';
    });
  });
}

function startCamera() {
  const video = document.getElementById('cameraPreview');
  currentScale = 1;
  if (video) video.style.transform = `scale(${currentScale})`;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentCamera } })
      .then(function(stream) {
        cameraStream = stream;
        if (video) {
          video.srcObject = stream;
          video.play();
          initPinchZoom(video);
        }
      })
      .catch(function(err) { alert('Camera access denied or not available.'); });
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(function(track) { track.stop(); });
    cameraStream = null;
  }
}
