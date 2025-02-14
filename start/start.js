/* start.js */

document.addEventListener('DOMContentLoaded', () => {
    // Global state
    let customerData = {};
    let currentScale = 1;
    let currentTranslateX = 0;
    let currentTranslateY = 0;
    let imageForCropping = new Image(); // holds the image source for cropping
    let stream; // for camera stream
  
    // Step elements
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
  
    // Step 1: Customer Form
    const customerForm = document.getElementById('customerForm');
    customerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const customerName = document.getElementById('customerName').value;
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      customerData = { customerName, email, phone };
      // Move to Step 2
      step1.style.display = 'none';
      step2.style.display = 'block';
    });
  
    // Step 2: Photo Method Selection
    const btnTakePhoto = document.getElementById('btnTakePhoto');
    const btnUploadPhoto = document.getElementById('btnUploadPhoto');
    const btnImageUrl = document.getElementById('btnImageUrl');
    const photoOptions = document.getElementById('photoOptions');
  
    const cameraContainer = document.getElementById('cameraContainer');
    const uploadContainer = document.getElementById('uploadContainer');
    const urlContainer = document.getElementById('urlContainer');
    const cropContainer = document.getElementById('cropContainer');
    const previewContainer = document.getElementById('previewContainer');
  
    btnTakePhoto.addEventListener('click', () => {
      photoOptions.style.display = 'block';
      cameraContainer.style.display = 'block';
      uploadContainer.style.display = 'none';
      urlContainer.style.display = 'none';
      cropContainer.style.display = 'none';
      previewContainer.style.display = 'none';
      startCamera();
    });
  
    btnUploadPhoto.addEventListener('click', () => {
      photoOptions.style.display = 'block';
      cameraContainer.style.display = 'none';
      uploadContainer.style.display = 'block';
      urlContainer.style.display = 'none';
      cropContainer.style.display = 'none';
      previewContainer.style.display = 'none';
      stopCamera();
    });
  
    btnImageUrl.addEventListener('click', () => {
      photoOptions.style.display = 'block';
      cameraContainer.style.display = 'none';
      uploadContainer.style.display = 'none';
      urlContainer.style.display = 'block';
      cropContainer.style.display = 'none';
      previewContainer.style.display = 'none';
      stopCamera();
    });
  
    // Camera functions
    const video = document.getElementById('video');
    const btnCapture = document.getElementById('btnCapture');
    const btnCancelCapture = document.getElementById('btnCancelCapture');
  
    function startCamera() {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          stream = s;
          video.srcObject = stream;
        })
        .catch(err => {
          alert("Error accessing camera: " + err);
        });
      } else {
        alert("Camera not supported on this device.");
      }
    }
  
    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
    }
  
    btnCapture.addEventListener('click', () => {
      // Capture a frame from the video stream
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL('image/png');
      prepareImageForCropping(dataURL);
      stopCamera();
      cameraContainer.style.display = 'none';
      cropContainer.style.display = 'block';
    });
  
    btnCancelCapture.addEventListener('click', () => {
      stopCamera();
      cameraContainer.style.display = 'none';
    });
  
    // File Upload handling
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          prepareImageForCropping(event.target.result);
          cropContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  
    // Image URL handling
    const imageUrlInput = document.getElementById('imageUrlInput');
    const btnLoadUrl = document.getElementById('btnLoadUrl');
    btnLoadUrl.addEventListener('click', () => {
      const url = imageUrlInput.value;
      if (url) {
        prepareImageForCropping(url);
        cropContainer.style.display = 'block';
      }
    });
  
    // Prepare image for cropping
    const cropImageElement = document.getElementById('crop-image');
    const zoomSlider = document.getElementById('zoomSlider');
  
    function prepareImageForCropping(src) {
      imageForCropping = new Image();
      imageForCropping.onload = () => {
        // Set the crop image element's source
        cropImageElement.src = src;
        // Reset transform variables
        currentScale = 1;
        currentTranslateX = 0;
        currentTranslateY = 0;
        zoomSlider.value = 1;
        // Adjust the image width to match the crop area's width
        const cropArea = document.getElementById('crop-area');
        cropImageElement.style.width = cropArea.clientWidth + "px";
        cropImageElement.style.height = "auto";
        // Center vertically if the displayed height is less than the container
        const displayedHeight = cropImageElement.offsetHeight;
        if (displayedHeight < cropArea.clientHeight) {
          currentTranslateY = (cropArea.clientHeight - displayedHeight) / 2;
        }
        updateCropImageTransform();
      };
      imageForCropping.src = src;
    }
  
    function updateCropImageTransform() {
      cropImageElement.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
    }
  
    // Zoom slider handling
    zoomSlider.addEventListener('input', (e) => {
      currentScale = parseFloat(e.target.value);
      updateCropImageTransform();
    });
  
    // Dragging for panning the image within the crop area
    let isDragging = false;
    let startX, startY, initialX, initialY;
  
    cropImageElement.addEventListener('pointerdown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = currentTranslateX;
      initialY = currentTranslateY;
      cropImageElement.setPointerCapture(e.pointerId);
    });
  
    cropImageElement.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      currentTranslateX = initialX + dx;
      currentTranslateY = initialY + dy;
      updateCropImageTransform();
    });
  
    cropImageElement.addEventListener('pointerup', (e) => {
      isDragging = false;
      cropImageElement.releasePointerCapture(e.pointerId);
    });
  
    // Crop button handling
    const btnCrop = document.getElementById('btnCrop');
    btnCrop.addEventListener('click', () => {
      performCrop();
    });
  
    const btnCancelCrop = document.getElementById('btnCancelCrop');
    btnCancelCrop.addEventListener('click', () => {
      cropContainer.style.display = 'none';
    });
  
    function performCrop() {
      const cropArea = document.getElementById('crop-area');
      const rect = cropArea.getBoundingClientRect();
      const imgRect = cropImageElement.getBoundingClientRect();
      // Calculate the ratio between the natural image size and its displayed width
      const ratio = imageForCropping.naturalWidth / cropImageElement.offsetWidth;
      const sx = (rect.left - imgRect.left) * ratio;
      const sy = (rect.top - imgRect.top) * ratio;
      const sWidth = rect.width * ratio;
      const sHeight = rect.height * ratio;
      
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageForCropping, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
      
      const croppedDataUrl = canvas.toDataURL('image/png');
      // Show preview
      const previewImage = document.getElementById('previewImage');
      previewImage.src = croppedDataUrl;
      cropContainer.style.display = 'none';
      previewContainer.style.display = 'block';
    }
  
    // Preview buttons
    const btnAcceptPhoto = document.getElementById('btnAcceptPhoto');
    const btnRecrop = document.getElementById('btnRecrop');
    const btnChangePhoto = document.getElementById('btnChangePhoto');
  
    btnAcceptPhoto.addEventListener('click', () => {
      // Proceed to Step 3
      step2.style.display = 'none';
      step3.style.display = 'block';
      prefillMessage();
    });
  
    btnRecrop.addEventListener('click', () => {
      previewContainer.style.display = 'none';
      cropContainer.style.display = 'block';
    });
  
    btnChangePhoto.addEventListener('click', () => {
      previewContainer.style.display = 'none';
      // Return to photo method selection
      photoOptions.style.display = 'none';
    });
  
    // Step 3: Share Link
    const shortLinkSpan = document.getElementById('shortLink');
    const prefilledMessage = document.getElementById('prefilledMessage');
  
    function prefillMessage() {
      const message = `${customerData.customerName}, Thanks for purchasing a car with me today. I would appreciate if you followed the link to share a review and photo of your new car on social media, to let your friends and family know!
  
  Toby
  Demo Auto Sales`;
      prefilledMessage.value = message;
    }
  
    // Share options buttons
    const btnTextLink = document.getElementById('btnTextLink');
    const btnEmailLink = document.getElementById('btnEmailLink');
    const btnTextEmailLink = document.getElementById('btnTextEmailLink');
    const btnShowQr = document.getElementById('btnShowQr');
    const btnCopyMessage = document.getElementById('btnCopyMessage');
    const qrContainer = document.getElementById('qrContainer');
    const btnCloseQr = document.getElementById('btnCloseQr');
  
    btnTextLink.addEventListener('click', () => {
      alert("Simulating texting link: " + shortLinkSpan.textContent);
    });
  
    btnEmailLink.addEventListener('click', () => {
      alert("Simulating emailing link: " + shortLinkSpan.textContent);
    });
  
    btnTextEmailLink.addEventListener('click', () => {
      alert("Simulating texting & emailing link: " + shortLinkSpan.textContent);
    });
  
    btnShowQr.addEventListener('click', () => {
      qrContainer.style.display = 'block';
    });
  
    btnCloseQr.addEventListener('click', () => {
      qrContainer.style.display = 'none';
    });
  
    btnCopyMessage.addEventListener('click', () => {
      navigator.clipboard.writeText(prefilledMessage.value)
        .then(() => {
          alert("Message copied to clipboard!");
        })
        .catch(err => {
          alert("Failed to copy: " + err);
        });
    });
  });
  