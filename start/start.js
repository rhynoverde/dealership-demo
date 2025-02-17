// Global variables
let customerData = {};
let originalImage = new Image(); // Holds the loaded image
let croppedDataUrl = '';
let cropper = null;  // Cropper.js instance
let cameraStream = null;

document.addEventListener('DOMContentLoaded', () => {
  // Step 1: Customer Form Next Button
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

  // Back to Options buttons
  document.querySelectorAll('.backToOptions').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopCamera();
      hideAllPhotoSections();
    });
  });

  // Handle Upload Photo
  document.getElementById('uploadInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        loadImageForCrop(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  });

  // Handle Load URL Photo
  document.getElementById('loadUrlImage').addEventListener('click', () => {
    const url = document.getElementById('imageUrlInput').value.trim();
    if (url) {
      loadImageForCrop(url);
    } else {
      alert('Please enter a valid URL.');
    }
  });

  // Capture photo from camera
  document.getElementById('capturePhoto').addEventListener('click', () => {
    captureFromCamera();
  });

  // Toggle flash button
  document.getElementById('toggleFlash').addEventListener('click', () => {
    // Try to toggle torch if supported
    if (cameraStream) {
      const [track] = cameraStream.getVideoTracks();
      const capabilities = track.getCapabilities();
      if (capabilities.torch) {
        const current = track.getSettings().torch || false;
        track.applyConstraints({ advanced: [{ torch: !current }] });
      } else {
        alert('Flash/torch not supported on this device.');
      }
    }
  });

  // Crop Button: Use Cropper.js to get cropped image
  document.getElementById('cropButton').addEventListener('click', () => {
    if (cropper) {
      // Get high-res cropped canvas
      const croppedCanvas = cropper.getCroppedCanvas({
        width: 1080,
        height: 1080,
        imageSmoothingQuality: 'high'
      });
      croppedDataUrl = croppedCanvas.toDataURL('image/jpeg');
      cropper.destroy();
      cropper = null;
      // Show preview of cropped image in preview container
      document.getElementById('previewImage').src = croppedDataUrl;
      hideAllPhotoSections();
      document.getElementById('previewSection').style.display = 'block';
    }
  });

  // Fit Entire Image Button: Create a square canvas that contains the entire image with blurred edges
  document.getElementById('fitEntireButton').addEventListener('click', () => {
    if (cropper) {
      // Get current cropped canvas from cropper (it may not cover the entire image)
      const srcCanvas = cropper.getCroppedCanvas({
        imageSmoothingQuality: 'high'
      });
      // Create a new square canvas
      const size = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Draw a blurred version of the source to fill background
      ctx.filter = 'blur(20px)';
      ctx.drawImage(srcCanvas, 0, 0, size, size);
      ctx.filter = 'none';
      
      // Calculate scale to fit entire source image in the square
      const scale = Math.min(size / srcCanvas.width, size / srcCanvas.height);
      const imgW = srcCanvas.width * scale;
      const imgH = srcCanvas.height * scale;
      const dx = (size - imgW) / 2;
      const dy = (size - imgH) / 2;
      // Draw the original image (without blur) on top, centered
      ctx.drawImage(srcCanvas, dx, dy, imgW, imgH);
      
      croppedDataUrl = canvas.toDataURL('image/jpeg');
      // Show preview of fitted image
      document.getElementById('previewImage').src = croppedDataUrl;
      hideAllPhotoSections();
      document.getElementById('previewSection').style.display = 'block';
    }
  });

  // Recrop and Change Photo Buttons
  document.getElementById('recropFromPreview').addEventListener('click', () => {
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
    initializeCropper(); // Reinitialize cropper on the same image
  });
  document.getElementById('changePhoto').addEventListener('click', resetPhotoProcess);
  document.getElementById('changePhotoFromPreview').addEventListener('click', resetPhotoProcess);

  // Confirm photo and move to step 3
  document.getElementById('confirmPhoto').addEventListener('click', () => {
    // Set final image src for display on step 3
    document.getElementById('finalImage').src = croppedDataUrl;
    setupPrefilledMessage();
    showStep('step3');
  });

  // "Change Image" button on Step 3: send user back to Step 2 to choose a new image
  document.getElementById('changeFinalImage').addEventListener('click', () => {
    resetPhotoProcess();
    showStep('step2');
  });

  // Step 3 Buttons
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

  // Copy Link Button in Step 3
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

// Utility: Show step by id
function showStep(stepId) {
  document.querySelectorAll('.step').forEach((el) => {
    el.classList.remove('active');
  });
  document.getElementById(stepId).classList.add('active');
}

// Hide all photo sections
function hideAllPhotoSections() {
  document.querySelectorAll('.photo-section').forEach((section) => {
    section.style.display = 'none';
  });
}

// Reset photo selection process
function resetPhotoProcess() {
  stopCamera();
  hideAllPhotoSections();
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById('uploadInput').value = '';
  document.getElementById('imageUrlInput').value = '';
}

// Setup prefilled message in step 3
function setupPrefilledMessage() {
  const msgTemplate = `${customerData.name},\n\nThanks for purchasing a car with me today. I would appreciate if you followed the link to share a review and photo of your new car on social media, to let your friends and family know!\n\nToby\nDemo Auto Sales`;
  document.getElementById('prefilledMessage').value = msgTemplate;
}

// --------------
// Camera Functions
function startCamera() {
  const video = document.getElementById('cameraPreview');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        cameraStream = stream;
        video.srcObject = stream;
        video.play();
        // Hide zoom slider in favor of pinch gestures.
        // The square overlay is visible to guide framing.
      })
      .catch((err) => {
        alert('Camera access denied or not available.');
      });
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

function captureFromCamera() {
  const video = document.getElementById('cameraPreview');
  const canvas = document.createElement('canvas');
  // Use the video dimensions to capture
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg');
  stopCamera();
  loadImageForCrop(dataUrl);
}

// --------------
// Load image into cropping section and initialize Cropper.js
function loadImageForCrop(src) {
  originalImage = new Image();
  originalImage.onload = () => {
    document.getElementById('cropImage').src = src;
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
    initializeCropper();
  };
  originalImage.onerror = () => {
    alert('Failed to load image.');
  };
  originalImage.src = src;
}

// Initialize Cropper.js on the #cropImage element
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
      // Adjust initial zoom so the image fills the fixed crop container
      const imageData = cropper.getImageData();
      const containerData = cropper.getContainerData();
      const scale = Math.max(containerData.width / imageData.naturalWidth, containerData.height / imageData.naturalHeight);
      cropper.zoomTo(scale);
    }
  });
}

// Reset all data for a fresh start
function resetAll() {
  customerData = {};
  croppedDataUrl = '';
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById('customerForm').reset();
  resetPhotoProcess();
  hideAllPhotoSections();
}
