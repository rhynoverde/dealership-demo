// Utility function to switch steps
function showStep(stepId) {
  document.querySelectorAll('.step').forEach((el) => {
    el.classList.remove('active');
  });
  document.getElementById(stepId).classList.add('active');
}

// Global variables to store state
let customerData = {};
let originalImage = new Image(); // Holds the loaded image
let croppedDataUrl = '';

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

  // Crop Button
  document.getElementById('cropButton').addEventListener('click', () => {
    // For demo: crop the center square from the loaded image.
    croppedDataUrl = cropImageCenter(originalImage);
    // Show preview
    document.getElementById('previewImage').src = croppedDataUrl;
    hideAllPhotoSections();
    document.getElementById('previewSection').style.display = 'block';
  });

  // Recrop and Change Photo Buttons
  document.getElementById('recropFromPreview').addEventListener('click', () => {
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
  });
  document.getElementById('changePhoto').addEventListener('click', resetPhotoProcess);
  document.getElementById('changePhotoFromPreview').addEventListener('click', resetPhotoProcess);

  // Confirm photo and move to step 3
  document.getElementById('confirmPhoto').addEventListener('click', () => {
    // Here you would upload the image if needed.
    setupPrefilledMessage();
    showStep('step3');
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

  // New Copy Link Button
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
let cameraStream = null;
function startCamera() {
  const video = document.getElementById('cameraPreview');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        cameraStream = stream;
        video.srcObject = stream;
        video.play();
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

// Capture current frame from camera
function captureFromCamera() {
  const video = document.getElementById('cameraPreview');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg');
  stopCamera();
  loadImageForCrop(dataUrl);
}

// --------------
// Load image into cropping section
function loadImageForCrop(src) {
  originalImage = new Image();
  originalImage.onload = () => {
    document.getElementById('cropImage').src = src;
    hideAllPhotoSections();
    document.getElementById('cropSection').style.display = 'block';
  };
  originalImage.onerror = () => {
    alert('Failed to load image.');
  };
  originalImage.src = src;
}

// Simple center crop function using canvas
function cropImageCenter(image) {
  const squareSize = Math.min(image.width, image.height);
  const sx = (image.width - squareSize) / 2;
  const sy = (image.height - squareSize) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = squareSize;
  canvas.height = squareSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, sx, sy, squareSize, squareSize, 0, 0, squareSize, squareSize);
  return canvas.toDataURL('image/jpeg');
}

// Reset all data for a fresh start
function resetAll() {
  customerData = {};
  croppedDataUrl = '';
  document.getElementById('customerForm').reset();
  resetPhotoProcess();
  hideAllPhotoSections();
}
