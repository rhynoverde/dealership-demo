// demo.js

// === CONFIGURATION ===
const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632'; // Your imgbb API key
const FINAL_WIDTH = 1080;
const FINAL_HEIGHT = 700;
const ASPECT_RATIO = FINAL_WIDTH / FINAL_HEIGHT; // ≈1.542857

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
let userReview = ""; // To store review text from the Review Form page
let selectedRating = 0; // For star rating

// =======================
// UTILITY FUNCTIONS
// =======================
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

async function uploadToImgbb(dataUrl) {
  const base64Image = dataUrl.split(',')[1]; // Remove header
  const formData = new FormData();
  formData.append('image', base64Image);
  formData.append('key', IMGBB_API_KEY);
  
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

// =======================
// STAR RATING FUNCTIONS (Review Form)
// =======================
function initStarRating() {
  const starContainer = document.getElementById('reviewStarRating');
  if (!starContainer) return;
  const stars = starContainer.querySelectorAll('span');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.getAttribute('data-value'));
      stars.forEach(s => {
        if (parseInt(s.getAttribute('data-value')) <= selectedRating) {
          s.classList.add('selected');
        } else {
          s.classList.remove('selected');
        }
      });
    });
    star.addEventListener('mouseover', () => {
      const hoverValue = parseInt(star.getAttribute('data-value'));
      stars.forEach(s => {
        if (parseInt(s.getAttribute('data-value')) <= hoverValue) {
          s.classList.add('selected');
        } else {
          s.classList.remove('selected');
        }
      });
    });
    star.addEventListener('mouseout', () => {
      stars.forEach(s => {
        if (parseInt(s.getAttribute('data-value')) <= selectedRating) {
          s.classList.add('selected');
        } else {
          s.classList.remove('selected');
        }
      });
    });
  });
}

// =======================
// CAMERA & IMAGE FUNCTIONS
// =======================
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
      const zoomIndicator = document.getElementById('zoomIndicator');
      if (activePointers.size < 2 && zoomIndicator) {
        zoomIndicator.style.display = 'none';
      }
    });
  });
}

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

// For "Take Photo": capture a frame using a 2160×1400 canvas yielding a final 1080×700 image.
function captureFromCamera() {
  const video = document.getElementById('cameraPreview');
  if (!video) return;
  const CAPTURE_WIDTH = 2160; // 2 × 1080
  const CAPTURE_HEIGHT = 1400; // 2 × 700
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = CAPTURE_WIDTH;
  fullCanvas.height = CAPTURE_HEIGHT;
  const ctx = fullCanvas.getContext('2d');
  if (ctx) {
    const scale = Math.max(CAPTURE_WIDTH / video.videoWidth, CAPTURE_HEIGHT / video.videoHeight);
    const newWidth = video.videoWidth * scale;
    const newHeight = video.videoHeight * scale;
    const offsetX = (CAPTURE_WIDTH - newWidth) / 2;
    const offsetY = (CAPTURE_HEIGHT - newHeight) / 2;
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, offsetX, offsetY, newWidth, newHeight);
  }
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = FINAL_WIDTH;
  cropCanvas.height = FINAL_HEIGHT;
  const cropCtx = cropCanvas.getContext('2d');
  if (cropCtx) {
    cropCtx.drawImage(fullCanvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT, 0, 0, FINAL_WIDTH, FINAL_HEIGHT);
  }
  originalCapturedDataUrl = fullCanvas.toDataURL('image/jpeg');
  croppedDataUrl = cropCanvas.toDataURL('image/jpeg');
  stopCamera();
  uploadToImgbb(croppedDataUrl)
    .then(publicUrl => {
      document.getElementById('finalImage').src =
        'https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=' + encodeURIComponent(publicUrl);
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
    ready() {}
  });
}

// =======================
// EVENT LISTENERS SETUP
// =======================
document.addEventListener('DOMContentLoaded', () => {
  // Step 1 → Step 2: Customer Info Submission
  document.getElementById('toStep2')?.addEventListener('click', () => {
    const name = document.getElementById('customerName')?.value.trim();
    if (!name) return alert('Please enter the customer name.');
    customerData.name = name;
    customerData.email = document.getElementById('customerEmail')?.value.trim() || '';
    customerData.phone = document.getElementById('customerPhone')?.value.trim() || '';
    showStep('step2');
  });

  // Photo Option Buttons
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

  // Back-to-Options Buttons (for Upload and URL sections)
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

  // File Upload Event
  document.getElementById('uploadInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadImageForCrop(ev.target.result);
    reader.readAsDataURL(file);
  });

  // Paste URL Event
  document.getElementById('loadUrlImage')?.addEventListener('click', () => {
    const url = document.getElementById('imageUrlInput')?.value.trim();
    if (!url) return alert('Please enter a valid URL.');
    loadImageForCrop(url, true);
  });

  // Capture Photo Event
  document.getElementById('capturePhoto')?.addEventListener('click', captureFromCamera);

  // Swap Camera / Flash Events
  document.getElementById('swapCamera')?.addEventListener('click', () => {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    stopCamera();
    startCamera();
  });
  document.getElementById('flashToggle')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!cameraStream) return;
    const [track] = cameraStream.getVideoTracks();
    if (!track.getCapabilities().torch) return;
    const on = btn.classList.toggle('flash-on');
    track.applyConstraints({ advanced: [{ torch: on }] });
  });

  // Crop → Upload & Show Final Page
  document.getElementById('cropButton')?.addEventListener('click', () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: FINAL_WIDTH, height: FINAL_HEIGHT });
    croppedDataUrl = canvas.toDataURL('image/jpeg');
    cropper.destroy();
    cropper = null;
    uploadToImgbb(croppedDataUrl)
      .then(publicUrl => {
        document.getElementById('finalImage').src =
          'https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=' + encodeURIComponent(publicUrl);
        setupPrefilledMessage();
        showStep('step3');
      })
      .catch(err => alert(err));
  });

  // Fit Entire Image Event
  document.getElementById('fitEntireButton')?.addEventListener('click', () => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FINAL_WIDTH;
      canvas.height = FINAL_HEIGHT;
      const ctx = canvas.getContext('2d');
      const scaleCover = Math.max(FINAL_WIDTH / img.width, FINAL_HEIGHT / img.height);
      const coverWidth = img.width * scaleCover, coverHeight = img.height * scaleCover;
      const coverDx = (FINAL_WIDTH - coverWidth) / 2, coverDy = (FINAL_HEIGHT - coverHeight) / 2;
      const scaleFit = Math.min(FINAL_WIDTH / img.width, FINAL_HEIGHT / img.height);
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

  // Change Photo Event
  document.getElementById('changePhoto')?.addEventListener('click', () => {
    resetPhotoProcess();
    document.getElementById('photoOptions').style.display = 'block';
    showStep('step2');
  });

  // Salesperson Final Page – Text Link: Show Simulated Text Message Page
  document.getElementById('textLink')?.addEventListener('click', () => {
    showStep('textMessagePage');
  });
  document.getElementById('backToStep3')?.addEventListener('click', () => {
    showStep('step3');
  });
  
  // QR Code Button – Show QR Page
  document.getElementById('showQRButton')?.addEventListener('click', () => {
    showQRPage();
  });
  
  // Text Message Page – Clicking Link: Copy final image to Vehicle Share Page and show it.
  document.getElementById('messageLink')?.addEventListener('click', e => {
    e.preventDefault();
    const finalImgSrc = document.getElementById('finalImage')?.src || "";
    const vehicleShareImage = document.getElementById('vehicleShareImage');
    if (vehicleShareImage && finalImgSrc) {
      vehicleShareImage.src = finalImgSrc;
    }
    showStep('vehicleSharePage');
  });
  
  // Vehicle Share Page – Forward Button: Navigate to Review Form Page and initialize star rating.
  document.getElementById('forwardFromVehicleShare')?.addEventListener('click', () => {
    showStep('reviewFormPage');
    initStarRating();
  });
  
  // Vehicle Share Page – Back Button
  document.getElementById('backFromVehicleShare')?.addEventListener('click', () => {
    showStep('textMessagePage');
  });
  
  // REVIEW FORM PAGE: Submit Review Form Event
  document.getElementById('submitReviewForm')?.addEventListener('click', () => {
    const reviewTextElem = document.getElementById('reviewText');
    if (!reviewTextElem) return;
    const reviewValue = reviewTextElem.value.trim();
    if (reviewValue.length === 0) {
      alert("Please enter your review.");
      return;
    }
    userReview = reviewValue;
    // Build personalized Review Share image URL using Hyperise parameters:
    // first_name from customerData.name and job_title from review text.
    const reviewShareUrl = `https://my.reviewshare.pics/i/pGdj8g8st.png?first_name=${encodeURIComponent(customerData.name)}&job_title=${encodeURIComponent(reviewValue)}`;
    const reviewShareImageElem = document.getElementById('reviewShareImage');
    if (reviewShareImageElem) {
      reviewShareImageElem.src = reviewShareUrl;
    }
    showStep('reviewSharePage');
  });
  
  // Add Back Button on Review Form Page
  document.getElementById('backFromReviewForm')?.addEventListener('click', () => {
    showStep('vehicleSharePage');
  });
  
  // Update Character Count for Review Text Input
  document.getElementById('reviewText')?.addEventListener('input', (e) => {
    const maxChars = 130;
    const currentLength = e.target.value.length;
    const remaining = maxChars - currentLength;
    const charCountElem = document.getElementById('charCount');
    if (charCountElem) {
      charCountElem.textContent = `${remaining} characters left`;
      if (remaining <= 0) {
        charCountElem.classList.add('red');
      } else {
        charCountElem.classList.remove('red');
      }
    }
  });
  
  // REVIEW SHARE PAGE: Share Review Link Button Event
  document.getElementById('reviewShareButton')?.addEventListener('click', async () => {
    const shareLink = "https://GetMy.Deal/MichaelJones";
    try {
      await navigator.clipboard.writeText(shareLink);
      Swal.fire({
        title: `<strong>Contact Link Saved to Clipboard!</strong>`,
        html: `
          <p>Help friends and family contact Michael Jones - Demo Auto Sales directly for any car shopping needs. We copied a link so all you need to do is paste it in your post/story when you share the image!</p>
          <p>Suggestions:</p>
          <ul style="text-align: left;">
            <li>😊 Paste it as a sticker in your Instagram Story.</li>
            <li>😃 Paste it as a comment on your Facebook post.</li>
            <li>😁 Use it in your TikTok bio.</li>
          </ul>
        `,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Got it!, Share Image Now',
        cancelButtonText: 'More Instructions'
      }).then(async (result) => {
        if (result.isConfirmed) {
          const reviewImgElement = document.getElementById('reviewShareImage');
          const reviewImgSrc = reviewImgElement ? reviewImgElement.src : "";
          if (reviewImgSrc && navigator.share) {
            try {
              const response = await fetch(reviewImgSrc);
              const blob = await response.blob();
              const fileType = reviewImgSrc.endsWith('.png') ? 'image/png' : 'image/jpeg';
              const file = new File([blob], `review.${fileType.split('/')[1]}`, { type: fileType });
              await navigator.share({
                files: [file]
              });
            } catch (error) {
              console.error('Error sharing image', error);
            }
          } else {
            console.log('Review share image not found or Web Share API not supported.');
          }
          // Automatically forward to Google Review Page after sharing
          showStep('googleReviewPage');
        } else if (result.dismiss === Swal.DismissReason.cancel) {
          window.location.href = 'https://shareinstructions.embrfyr.com/dealershipdemo';
        }
      });
    } catch (err) {
      alert("Failed to copy link");
    }
  });
  
  // Review Share Page – Back Button: Navigate back to Review Form Page and reinitialize star rating.
  document.getElementById('backFromReviewShare')?.addEventListener('click', () => {
    showStep('reviewFormPage');
    initStarRating();
  });
  
  // Review Share Page – Forward Button: Navigate to Google Review Page
  document.getElementById('forwardFromReviewShare')?.addEventListener('click', () => {
    showStep('googleReviewPage');
  });
  
  // GOOGLE REVIEW PAGE: "Paste Review on Google" Button Event (Open in new tab, then forward)
  document.getElementById('googleReviewButton')?.addEventListener('click', async () => {
    const reviewTextElem = document.getElementById('reviewText');
    if (!reviewTextElem) return;
    const reviewTextValue = reviewTextElem.value.trim();
    try {
      await navigator.clipboard.writeText(reviewTextValue);
      Swal.fire({
        title: `<strong>Review Copied!</strong>`,
        html: `
          <p>Your review has been copied to your clipboard. Please paste it on our Google profile.</p>
          <ol style="text-align: left;">
            <li>Add your car photo if desired.</li>
            <li>Tap on your star rating.</li>
            <li>Long press in the review box and select "paste".</li>
          </ol>
        `,
        icon: 'info',
        confirmButtonText: 'Post Review on Google'
      }).then(() => {
        window.open('https://search.google.com/local/writereview?placeid=ChIJAQB0dE1YkWsRXSuDBDHLr3M', '_blank');
        // Automatically forward to the Final Options Page after posting
        setTimeout(() => {
          showStep('finalOptionsPage');
        }, 1000);
      });
    } catch (err) {
      alert("Failed to copy review text");
    }
  });
  
  // GOOGLE REVIEW PAGE – Back Button: Navigate back to Review Share Page
  document.getElementById('backFromGoogleReview')?.addEventListener('click', () => {
    showStep('reviewSharePage');
  });
  
  // GOOGLE REVIEW PAGE – Forward Button: Navigate to Final Options Page
  document.getElementById('forwardFromGoogleReview')?.addEventListener('click', () => {
    showStep('finalOptionsPage');
  });
  
  // FINAL OPTIONS PAGE: Copy Review Text, Text/Email Link Buttons
  document.getElementById('copyReviewText')?.addEventListener('click', () => {
    const finalReviewText = document.getElementById('finalReviewText')?.value;
    if (!finalReviewText) return;
    navigator.clipboard.writeText(finalReviewText).then(() => {
      alert("Review text copied to clipboard.");
    }).catch(() => {
      alert("Failed to copy review text.");
    });
  });
  document.getElementById('textLinkFinal')?.addEventListener('click', () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl).then(() => {
      alert("Page link copied to clipboard. We'll text you the link shortly.");
    }).catch(() => {
      alert("Failed to copy page link.");
    });
  });
  document.getElementById('emailLinkFinal')?.addEventListener('click', () => {
    const subject = encodeURIComponent("Review & Share Page Link");
    const body = encodeURIComponent(`Here is the link to the review share page: ${window.location.href}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });
});

// =======================
// END OF EVENT LISTENERS
// =======================

function getBlurredDataURL(img, blurAmount, width, height, callback) {
  callback(img);
}

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
        zoomIndicator.innerText = (newDist / initialDistance) > 1 ? "Zooming In..." : "Zooming Out...";
      }
    }
  });
  video.addEventListener('pointerup', function(e) {
    e.preventDefault();
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2 && zoomIndicator) {
      zoomIndicator.style.display = "none";
    }
  });
  video.addEventListener('pointercancel', function(e) {
    e.preventDefault();
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2 && zoomIndicator) {
      zoomIndicator.style.display = "none";
    }
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
