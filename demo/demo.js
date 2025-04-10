// demo.js

// === CONFIGURATION ===
const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632'; // Your imgbb API key
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
let userReview = ""; // To store the review text from the Review Form page

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

async function uploadToImgbb(dataUrl) {
  const base64Image = dataUrl.split(',')[1]; // Remove the data header
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

// === DOM HELPERS ===
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

// === NEW: QR CODE PAGE FUNCTION ===
function showQRPage() {
  const shareLink = "https://GetMy.Deal/MichaelJones";
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent(shareLink);
  const qrImg = document.getElementById("qrCodeImage");
  if (qrImg) {
    qrImg.src = qrUrl;
  }
  showStep("qrSharePage");
}

// === EVENT LISTENER FOR "COPY LINK" & NATIVE SHARE (Customer Share Page) ===
document.getElementById('shareNowButton')?.addEventListener('click', async () => {
  const shareLink = "https://GetMy.Deal/MichaelJones";
  try {
    await navigator.clipboard.writeText(shareLink);
    Swal.fire({
      title: `<strong>Link Copied!</strong>`,
      html: `
        <p>Help friends and family contact him directly for any car shopping needs. We copied a link to make it easy peasy to contact him directly to your clipboard so all you will need to do is paste it in your post/story when you share the image!</p>
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
        const finalImgSrc = document.getElementById('finalImage').src;
        if (finalImgSrc && navigator.share) {
          try {
            const response = await fetch(finalImgSrc);
            const blob = await response.blob();
            const fileType = finalImgSrc.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const file = new File([blob], `review.${fileType.split('/')[1]}`, { type: fileType });
            await navigator.share({
              files: [file],
              title: 'My Vehicle Purchase Review'
              // No text description to maximize share options
            });
          } catch (error) {
            console.error('Error sharing image', error);
          }
        } else {
          console.log('Final image not found or Web Share API not supported.');
        }
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        window.location.href = 'https://shareinstructions.embrfyr.com/dealershipdemo';
      }
    });
  } catch (err) {
    alert("Failed to copy link");
  }
});

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
      const zoomIndicator = document.getElementById('zoomIndicator');
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

// === IMAGE CAPTURE & PROCESSING ===
// For "Take Photo", capture using a 2160×1400 canvas to yield a 1080×700 final image.
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

// === NEW: REVIEW FORM PAGE FUNCTIONALITY ===
document.getElementById('submitReviewForm')?.addEventListener('click', () => {
  // Get review from textarea and update character count if necessary.
  const reviewTextElem = document.getElementById('reviewText');
  if (!reviewTextElem) return;
  const reviewValue = reviewTextElem.value.trim();
  if (reviewValue.length === 0) {
    alert("Please enter your review.");
    return;
  }
  // Save user review for later use.
  userReview = reviewValue;
  // Build the personalized Review Share image URL using Hyperise parameters.
  // The URL parameters: first_name (customerData.name) and job_title (review text).
  const reviewShareUrl = `https://my.reviewshare.pics/i/pGdj8g8st.png?first_name=${encodeURIComponent(customerData.name)}&job_title=${encodeURIComponent(reviewValue)}`;
  // Set the review share image source.
  document.getElementById('reviewShareImage').src = reviewShareUrl;
  // Navigate to the Review Share Page.
  showStep('reviewSharePage');
});

// Update character count on review text input.
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

// === NEW: REVIEW SHARE PAGE FUNCTIONALITY ===
document.getElementById('reviewShareButton')?.addEventListener('click', async () => {
  const shareLink = "https://GetMy.Deal/MichaelJones";
  try {
    await navigator.clipboard.writeText(shareLink);
    Swal.fire({
      title: `<strong>Link Copied!</strong>`,
      html: `
        <p>Help friends and family contact him directly for any car shopping needs. We copied a link to make it easy peasy to contact him directly to your clipboard so all you will need to do is paste it in your post/story when you share the image!</p>
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
        const reviewImgSrc = document.getElementById('reviewShareImage').src;
        if (reviewImgSrc && navigator.share) {
          try {
            const response = await fetch(reviewImgSrc);
            const blob = await response.blob();
            const fileType = reviewImgSrc.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const file = new File([blob], `review.${fileType.split('/')[1]}`, { type: fileType });
            await navigator.share({
              files: [file],
              title: 'My Review of Michael Jones - Demo Auto Sales'
            });
          } catch (error) {
            console.error('Error sharing image', error);
          }
        } else {
          console.log('Review image not found or Web Share API not supported.');
        }
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        window.location.href = 'https://shareinstructions.embrfyr.com/dealershipdemo';
      }
    });
  } catch (err) {
    alert("Failed to copy link");
  }
});

// === NEW: NAVIGATION FROM CUSTOMER SHARE PAGE TO REVIEW FORM PAGE ===
// Instead of going back to the text message page, we now navigate to the review form page.
document.getElementById('backFromCustomerShare')?.addEventListener('click', () => {
  showStep('reviewFormPage');
});

// === NEW: GOOGLE REVIEW PAGE FUNCTIONALITY ===
document.getElementById('googleReviewButton')?.addEventListener('click', async () => {
  // Copy user's review text to clipboard from the review text area.
  const reviewTextElem = document.getElementById('reviewText');
  if (!reviewTextElem) return;
  const reviewTextValue = reviewTextElem.value.trim();
  try {
    await navigator.clipboard.writeText(reviewTextValue);
    Swal.fire({
      title: `<strong>Review Copied!</strong>`,
      html: `
        <p>Your review has been copied to your clipboard. We'd love if you included a photo of your car with the review.</p>
        <p>Instructions:</p>
        <ol style="text-align: left;">
          <li>Add the photo of your car.</li>
          <li>Tap your star rating.</li>
          <li>Long press in the review box and select "paste".</li>
        </ol>
      `,
      icon: 'info',
      confirmButtonText: 'Post Photo and Review on Google'
    }).then(() => {
      window.location.href = 'https://search.google.com/local/writereview?placeid=ChIJAQB0dE1YkWsRXSuDBDHLr3M';
    });
  } catch (err) {
    alert("Failed to copy review text");
  }
});

// === NEW: FINAL OPTIONS PAGE FUNCTIONALITY ===
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

// === EVENT LISTENERS SETUP (existing parts) ===
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

  // Capture Photo
  document.getElementById('capturePhoto')?.addEventListener('click', captureFromCamera);

  // Swap / flash
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

  // Crop → upload & show final page (for uploads/cropping)
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

  // Fit Entire Image
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

  // Change Photo
  document.getElementById('changePhoto')?.addEventListener('click', () => {
    resetPhotoProcess();
    document.getElementById('photoOptions').style.display = 'block';
    showStep('step2');
  });

  // Salesperson Final Page – Text Link shows simulated SMS
  document.getElementById('textLink')?.addEventListener('click', () => {
    showStep('textMessagePage');
  });
  document.getElementById('backToStep3')?.addEventListener('click', () => {
    showStep('step3');
  });
  // QR Code button – show QR page
  document.getElementById('showQRButton')?.addEventListener('click', () => {
    showQRPage();
  });
  // Text Message Page – clicking link goes to Customer Share Page
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
});
  
// === END OF EVENT LISTENERS ===

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
