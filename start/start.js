// Global variables
let customerData = {};
let capturedDataUrl = "";         // For camera-taken auto-cropped image
let originalCapturedDataUrl = ""; // Full-resolution original (for recropping)
let croppedDataUrl = "";          // Final square image after crop adjustments
let cropper = null;               // Cropper.js instance
let cameraStream = null;
let activePointers = new Map();   // For custom pinch-to-zoom
let currentCamera = "environment"; // "environment" for rear, "user" for front
let maxZoom = 1;                  // Maximum allowed zoom (computed in crop mode)

// Helper: SVG-based blur fallback (if needed)
function getBlurredDataURL(img, blurAmount, width, height, callback) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <filter id="blurFilter">
        <feGaussianBlur stdDeviation="${blurAmount}" />
      </filter>
      <image filter="url(#blurFilter)" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" xlink:href="${img.src}" />
    </svg>
  `;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const blurredImg = new Image();
  blurredImg.onload = function() {
    URL.revokeObjectURL(url);
    callback(blurredImg);
  };
  blurredImg.src = url;
}

// Helper: Minimal StackBlur implementation (adapted from open-source StackBlur)
function stackBlurCanvasRGBA(canvas, top_x, top_y, width, height, radius) {
  if (isNaN(radius) || radius < 1) return;
  radius |= 0;
  const context = canvas.getContext("2d");
  let imageData;
  try {
    imageData = context.getImageData(top_x, top_y, width, height);
  } catch(e) {
    console.error(e);
    return;
  }
  const pixels = imageData.data;
  const div = radius + radius + 1;
  const w4 = width << 2;
  let r, g, b, a, x, y, i, p, yp, yi, yw;
  const mul_sum =  (div+1) >> 1;
  const shg_sum = 1; // simplified for small radius
  let r_sum, g_sum, b_sum, a_sum, r_out_sum, g_out_sum, b_out_sum, a_out_sum, r_in_sum, g_in_sum, b_in_sum, a_in_sum;
  let pr, pg, pb, pa, rbs;
  const stack = [];
  for(i = 0; i < div; i++){
    stack[i] = { r:0, g:0, b:0, a:0 };
  }
  yw = yi = 0;
  for (y = 0; y < height; y++) {
    r_sum = g_sum = b_sum = a_sum = r_in_sum = g_in_sum = b_in_sum = a_in_sum = 0;
    r_out_sum = g_out_sum = b_out_sum = a_out_sum = 0;
    for(i = 0; i < div; i++){
      p = yi + ((Math.min(i, width - 1)) << 2);
      const sir = stack[i];
      sir.r = pixels[p];
      sir.g = pixels[p+1];
      sir.b = pixels[p+2];
      sir.a = pixels[p+3];
      const rbs = i + 1;
      r_sum += sir.r * rbs;
      g_sum += sir.g * rbs;
      b_sum += sir.b * rbs;
      a_sum += sir.a * rbs;
      if (i > 0) {
        r_in_sum += sir.r;
        g_in_sum += sir.g;
        b_in_sum += sir.b;
        a_in_sum += sir.a;
      }
    }
    for (x = 0; x < width; x++) {
      pixels[yi+3] = pa = (a_sum / div)|0;
      pixels[yi] = ((r_sum / div)|0);
      pixels[yi+1] = ((g_sum / div)|0);
      pixels[yi+2] = ((b_sum / div)|0);
      r_sum -= r_out_sum;
      g_sum -= g_out_sum;
      b_sum -= b_out_sum;
      a_sum -= a_out_sum;
      const stackStart = stack.shift();
      r_out_sum -= stackStart.r;
      g_out_sum -= stackStart.g;
      b_out_sum -= stackStart.b;
      a_out_sum -= stackStart.a;
      p = yi + (( (x + radius + 1) < width ? (x + radius + 1) : (width - 1) ) << 2);
      stackStart.r = pixels[p];
      stackStart.g = pixels[p+1];
      stackStart.b = pixels[p+2];
      stackStart.a = pixels[p+3];
      r_in_sum += stackStart.r;
      g_in_sum += stackStart.g;
      b_in_sum += stackStart.b;
      a_in_sum += stackStart.a;
      r_sum += r_in_sum;
      g_sum += g_in_sum;
      b_sum += b_in_sum;
      a_sum += a_in_sum;
      stack.push(stackStart);
      r_out_sum += stack[0].r;
      g_out_sum += stack[0].g;
      b_out_sum += stack[0].b;
      a_out_sum += stack[0].a;
      r_in_sum -= stack[0].r;
      g_in_sum -= stack[0].g;
      b_in_sum -= stack[0].b;
      a_in_sum -= stack[0].a;
      yi += 4;
    }
    yw += width;
  }
  context.putImageData(imageData, top_x, top_y);
}

// Detect iOS device
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

document.addEventListener('DOMContentLoaded', () => {
  // --- Initialization code as in previous versions (customer form, photo options, camera, etc.)
  // (For brevity, the initialization code below is identical to Version 1.4)

  // Step 1: Customer Form
  document.getElementById('toStep2').addEventListener('click', () => {
    const name = document.getElementById('customerName').value.trim();
    if (!name) { alert('Please enter the customer name.'); return; }
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
    btn.addEventListener('click', () => { stopCamera(); hideAllPhotoSections(); });
  });

  // File Upload
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

  // URL Input
  document.getElementById('loadUrlImage').addEventListener('click', () => {
    const url = document.getElementById('imageUrlInput').value.trim();
    if (url) { originalCapturedDataUrl = url; loadImageForCrop(url); }
    else { alert('Please enter a valid URL.'); }
  });

  // Capture Photo Button
  document.getElementById('capturePhoto').addEventListener('click', () => { captureFromCamera(); });

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
      if (track.getCapabilities().torch) { track.applyConstraints({ advanced: [{ torch: e.target.checked }] }); }
    }
  });

  // Cropping Page: Crop Button
  document.getElementById('cropButton').addEventListener('click', () => {
    if (cropper) {
      const croppedCanvas = cropper.getCroppedCanvas({ width: 1080, height: 1080, imageSmoothingQuality: 'high' });
      croppedDataUrl = croppedCanvas.toDataURL('image/jpeg');
      cropper.destroy();
      cropper = null;
      document.getElementById('finalImage').src = croppedDataUrl;
      hideAllPhotoSections();
      showStep('step3');
    }
  });

  // Cropping Page: Fit Entire Image Button
  document.getElementById('fitEntireButton').addEventListener('click', () => {
    const img = new Image();
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

      // On iOS, use the StackBlur fallback if canvas.filter causes hangs.
      if (isIOS) {
        ctx.drawImage(img, coverDx, coverDy, coverWidth, coverHeight);
        // Apply StackBlur to the background region.
        stackBlurCanvasRGBA(canvas, 0, 0, size, size, 40);
        // Then overlay the contained image.
        ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
        croppedDataUrl = canvas.toDataURL('image/jpeg');
        document.getElementById('finalImage').src = croppedDataUrl;
        hideAllPhotoSections();
        showStep('step3');
      } else if (!('filter' in ctx)) {
        // If canvas.filter is not supported, use SVG fallback.
        getBlurredDataURL(img, 40, size, size, (blurredImg) => {
          ctx.drawImage(blurredImg, coverDx, coverDy, coverWidth, coverHeight);
          ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
          croppedDataUrl = canvas.toDataURL('image/jpeg');
          document.getElementById('finalImage').src = croppedDataUrl;
          hideAllPhotoSections();
          showStep('step3');
        });
      } else {
        // Default: use canvas.filter.
        ctx.filter = 'blur(40px)';
        ctx.drawImage(img, coverDx, coverDy, coverWidth, coverHeight);
        ctx.filter = 'none';
        ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
        croppedDataUrl = canvas.toDataURL('image/jpeg');
        document.getElementById('finalImage').src = croppedDataUrl;
        hideAllPhotoSections();
        showStep('step3');
      }
    };
    img.src = originalCapturedDataUrl || capturedDataUrl;
  });

  // Cropping Page: Change Photo Button
  document.getElementById('changePhoto').addEventListener('click', resetPhotoProcess);

  // Final Page: Adjust Cropping Button
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
    navigator.clipboard.writeText(linkText).then(() => { alert('Link copied to clipboard.'); });
  });
  document.getElementById('textLink').addEventListener('click', () => { alert('Simulating sending a text message.'); });
  document.getElementById('emailLink').addEventListener('click', () => { alert('Simulating sending an email.'); });
  document.getElementById('bothLink').addEventListener('click', () => { alert('Simulating sending text and email.'); });
  document.getElementById('startOver').addEventListener('click', () => { resetAll(); showStep('step1'); });
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
  if (cropper) { cropper.destroy(); cropper = null; }
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
    if (activePointers.size < 2) { zoomIndicator.style.display = "none"; }
  });
  video.addEventListener('pointercancel', e => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) { zoomIndicator.style.display = "none"; }
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
        if (capabilities.zoom) { initPinchZoom(video, track); }
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
  const video = document.getElementById('cameraPreview');
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = video.videoWidth;
  fullCanvas.height = video.videoHeight;
  const ctx = fullCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
  // Use centered square crop based on the shorter dimension
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
      // For maximum zoom: limit so the image’s shorter side exactly fills the crop box.
      if (imageData.naturalWidth < imageData.naturalHeight) {
         maxZoom = cropBoxData.width / imageData.naturalWidth;
      } else {
         maxZoom = cropBoxData.width / imageData.naturalHeight;
      }
    },
    zoom: function(e) {
      if (e.detail.ratio > maxZoom) { cropper.zoomTo(maxZoom); }
    }
  });
}

// For camera-taken photos auto-crop (using the shorter side)
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
