(() => {
  const fileInput = document.getElementById("image-input");
  const downloadBtn = document.getElementById("download-btn");
  const statusMessage = document.getElementById("status-message");
  const canvas = document.getElementById("meme-canvas");
  const placeholder = document.getElementById("preview-placeholder");
  const textColorInput = document.getElementById("text-color");
  const strokeColorInput = document.getElementById("stroke-color");
  const textEditor = document.getElementById("text-editor");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const zoomValueEl = document.getElementById("zoom-value");
  const fontSizeIncreaseBtn = document.getElementById("font-size-increase");
  const fontSizeDecreaseBtn = document.getElementById("font-size-decrease");
  const fontSizeDisplay = document.getElementById("font-size-value");
  const textColorSwatch = document.getElementById("text-color-swatch");
  const strokeColorSwatch = document.getElementById("stroke-color-swatch");
  const memeThumbs = document.querySelectorAll("[data-meme-src]");
  const uploadTrigger = document.getElementById("upload-trigger");

  if (!canvas || !fileInput || !downloadBtn) {
    console.warn("Meme generator: Missing required DOM elements.");
    return;
  }

  const ctx = canvas.getContext("2d");
  let image = null;
  let zoom = 1;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.25;

  // Base font size controlled via +/- UI
  let baseFontSizeValue = 25;
  const MIN_FONT_SIZE_VALUE = 12;
  const MAX_FONT_SIZE_VALUE = 120;
  
  // Text objects with properties
  const topText = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isDragging: false,
    text: ""
  };
  
  const bottomText = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isDragging: false,
    text: ""
  };
  
  // Editor and drag state
  let editingText = null; // 'top' or 'bottom' or null
  let dragOffset = { x: 0, y: 0 };
  let mouseDownTime = 0;
  let mouseDownPos = { x: 0, y: 0 };
  const CLICK_THRESHOLD = 5; // pixels - if moved more than this, it's a drag
  const CLICK_TIME_THRESHOLD = 200; // ms - if held longer, it's a drag

  function updateZoomDisplay() {
    if (zoomValueEl) {
      zoomValueEl.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  function setStatus(message) {
    if (statusMessage) {
      statusMessage.textContent = message || "";
    }
  }

  function setPlaceholderVisible(visible) {
    if (!placeholder) return;
    placeholder.style.display = visible ? "flex" : "none";
  }

  function fitCanvasToImage(img) {
    const maxWidth = 1024;
    const maxHeight = 1024;
    let { width, height } = img;

    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const scale = Math.min(1, widthRatio, heightRatio);

    width = Math.round(width * scale);
    height = Math.round(height * scale);

    canvas.width = width;
    canvas.height = height;
  }

  function getCanvasCenter() {
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }

  function withIdentityTransform(fn) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const result = fn();
    ctx.restore();
    return result;
  }

  function drawTextLine(textObj, fontSizePx) {
    if (!textObj.text) return;

    ctx.font = `bold ${fontSizePx}px Impact, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    // Use colors from controls
    const strokeWidth = Math.max(4, Math.floor(fontSizePx / 12));
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColorInput ? strokeColorInput.value : "#000000";
    ctx.fillStyle = textColorInput ? textColorInput.value : "#ffffff";

    const textUpper = textObj.text.toUpperCase();
    ctx.strokeText(textUpper, textObj.x, textObj.y);
    ctx.fillText(textUpper, textObj.x, textObj.y);
    
    // Update text object dimensions
    const metrics = ctx.measureText(textUpper);
    textObj.width = metrics.width;
    textObj.height = fontSizePx;
  }
  
  // Get text bounding box for click detection
  function getTextBounds(textObj, fontSizePx) {
    if (!textObj.text) return null;

    return withIdentityTransform(() => {
      ctx.font = `bold ${fontSizePx}px Impact, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const textUpper = textObj.text.toUpperCase();
      const metrics = ctx.measureText(textUpper);
      const textWidth = metrics.width;
      const textHeight = fontSizePx;

      // Add padding around text for easier clicking
      const padding = fontSizePx * 0.3;

      return {
        left: textObj.x - textWidth / 2 - padding,
        right: textObj.x + textWidth / 2 + padding,
        top: textObj.y - textHeight / 2 - padding,
        bottom: textObj.y + textHeight / 2 + padding
      };
    });
  }
  
  // Detect which text (if any) was clicked
  function getTextAtPoint(mouseX, mouseY, fontSizePx) {
    if (topText.text) {
      const bounds = getTextBounds(topText, fontSizePx);
      if (bounds && mouseX >= bounds.left && mouseX <= bounds.right &&
          mouseY >= bounds.top && mouseY <= bounds.bottom) {
        return topText;
      }
    }
    
    if (bottomText.text) {
      const bounds = getTextBounds(bottomText, fontSizePx);
      if (bounds && mouseX >= bounds.left && mouseX <= bounds.right &&
          mouseY >= bounds.top && mouseY <= bounds.bottom) {
        return bottomText;
      }
    }
    
    return null;
  }
  
  // Show text editor at clicked position
  function showTextEditor(textObj, canvasX, canvasY) {
    if (!textEditor) return;
    
    editingText = textObj === topText ? 'top' : 'bottom';

    const center = getCanvasCenter();
    const rect = canvas.getBoundingClientRect();
    const canvasWrapper = canvas.parentElement;
    const wrapperRect = canvasWrapper.getBoundingClientRect();

    // Map logical coordinates through zoom for editor placement
    const scaledX = center.x + (canvasX - center.x) * zoom;
    const scaledY = center.y + (canvasY - center.y) * zoom;

    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const x = rect.left - wrapperRect.left + scaledX * scaleX;
    const y = rect.top - wrapperRect.top + scaledY * scaleY;

    // Position editor above the text
    const fontSize = getCurrentFontSize();
    textEditor.style.fontSize = `${fontSize}px`;
    textEditor.style.left = `${x}px`;
    textEditor.style.top = `${Math.max(10, y - fontSize - 20)}px`; // Ensure it doesn't go off top
    textEditor.style.transform = 'translateX(-50%)'; // Center horizontally
    textEditor.value = textObj.text;
    textEditor.style.display = 'block';
    textEditor.focus();
    textEditor.select();
  }
  
  // Hide text editor and save changes
  function hideTextEditor() {
    if (!textEditor || !editingText) return;
    
    const textObj = editingText === 'top' ? topText : bottomText;
    textObj.text = textEditor.value.trim();
    textEditor.style.display = 'none';
    editingText = null;
    drawMeme();
  }

  function drawMeme() {
    // Reset any existing transforms before drawing
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (!image) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setPlaceholderVisible(true);
      return;
    }

    setPlaceholderVisible(false);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom around canvas center so image + text scale together
    const center = getCanvasCenter();
    ctx.translate(center.x, center.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-center.x, -center.y);

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Use font size from controls, scaled relative to canvas width
    const sliderValue = baseFontSizeValue;
    const baseFontSize = (canvas.width / 800) * sliderValue; // logical size; zoom scales visually
    const fontSize = Math.max(18, Math.round(baseFontSize));
    const margin = canvas.height * 0.06; // Top/bottom margin for text

    // Initialize positions if not set (first time or after image change)
    if (topText.x === 0 && topText.y === 0) {
      topText.x = canvas.width / 2;
      topText.y = margin;
    }
    if (bottomText.x === 0 && bottomText.y === 0) {
      bottomText.x = canvas.width / 2;
      bottomText.y = canvas.height - margin;
    }

    // Draw text at tracked positions
    drawTextLine(topText, fontSize);
    drawTextLine(bottomText, fontSize);
  }
  
  function getCurrentFontSize() {
    if (!image) return 60;
    const sliderValue = baseFontSizeValue;
    const baseFontSize = (canvas.width / 800) * sliderValue;
    return Math.max(18, Math.round(baseFontSize));
  }

  function setBaseFontSize(value) {
    baseFontSizeValue = Math.min(
      MAX_FONT_SIZE_VALUE,
      Math.max(MIN_FONT_SIZE_VALUE, value)
    );
    if (fontSizeDisplay) {
      fontSizeDisplay.textContent = String(baseFontSizeValue);
    }
    drawMeme();
  }

  function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setStatus("No file selected.");
      image = null;
      downloadBtn.disabled = true;
      drawMeme();
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus("Please select a valid image file (JPG, PNG, GIF).");
      fileInput.value = "";
      image = null;
      downloadBtn.disabled = true;
      drawMeme();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        image = img;
        fitCanvasToImage(img);
        // Reset text objects when new image loads
        topText.x = 0;
        topText.y = 0;
        topText.text = "";
        topText.isDragging = false;
        bottomText.x = 0;
        bottomText.y = 0;
        bottomText.text = "";
        bottomText.isDragging = false;
        drawMeme();
        downloadBtn.disabled = false;
        setStatus("Image loaded. Click on the canvas to add/edit text. Drag to move.");
      };
      img.onerror = () => {
        setStatus("Could not load this image. Please try a different file.");
        image = null;
        downloadBtn.disabled = false;
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      setStatus("Error reading file. Please try again.");
    };

    setStatus("Loading image...");
    reader.readAsDataURL(file);
  }

  function handleDownload() {
    if (!image) {
      setStatus("Upload an image before downloading.");
      return;
    }

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "meme.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setStatus("Meme downloaded!");
    } catch (error) {
      console.error(error);
      setStatus("Could not generate download. Try again in a modern browser.");
    }
  }

  // Mouse drag handlers
  function getCanvasMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const xCanvas = (event.clientX - rect.left) * scaleX;
    const yCanvas = (event.clientY - rect.top) * scaleY;

    // Convert to logical coordinates (undo zoom around center)
    const center = getCanvasCenter();
    const logicalX = center.x + (xCanvas - center.x) / zoom;
    const logicalY = center.y + (yCanvas - center.y) / zoom;

    return { x: logicalX, y: logicalY };
  }
  
  function handleMouseDown(event) {
    if (!image || editingText) return;
    
    const mousePos = getCanvasMousePos(event);
    mouseDownTime = Date.now();
    mouseDownPos = { x: mousePos.x, y: mousePos.y };
    
    const fontSize = getCurrentFontSize();
    const clickedTextObj = getTextAtPoint(mousePos.x, mousePos.y, fontSize);
    
    if (clickedTextObj) {
      clickedTextObj.isDragging = true;
      dragOffset.x = mousePos.x - clickedTextObj.x;
      dragOffset.y = mousePos.y - clickedTextObj.y;
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
    }
  }
  
  function handleMouseMove(event) {
    if (!image || editingText) return;
    
    const mousePos = getCanvasMousePos(event);
    const fontSize = getCurrentFontSize();
    
    // Check if any text is being dragged
    let isDraggingAny = false;
    if (topText.isDragging) {
      const newX = mousePos.x - dragOffset.x;
      const newY = mousePos.y - dragOffset.y;
      topText.x = Math.max(0, Math.min(canvas.width, newX));
      topText.y = Math.max(0, Math.min(canvas.height, newY));
      drawMeme();
      isDraggingAny = true;
    } else if (bottomText.isDragging) {
      const newX = mousePos.x - dragOffset.x;
      const newY = mousePos.y - dragOffset.y;
      bottomText.x = Math.max(0, Math.min(canvas.width, newX));
      bottomText.y = Math.max(0, Math.min(canvas.height, newY));
      drawMeme();
      isDraggingAny = true;
    }
    
    if (!isDraggingAny) {
      // Update cursor to show draggable text
      const hoveredText = getTextAtPoint(mousePos.x, mousePos.y, fontSize);
      canvas.style.cursor = hoveredText ? 'grab' : 'default';
    }
  }
  
  function handleMouseUp(event) {
    if (!image || editingText) return;
    
    const mousePos = getCanvasMousePos(event);
    const mouseUpTime = Date.now();
    const timeDiff = mouseUpTime - mouseDownTime;
    const distance = Math.sqrt(
      Math.pow(mousePos.x - mouseDownPos.x, 2) + 
      Math.pow(mousePos.y - mouseDownPos.y, 2)
    );
    
    // Determine if it was a click (edit) or drag (move)
    const wasClick = distance < CLICK_THRESHOLD && timeDiff < CLICK_TIME_THRESHOLD;
    
    if (topText.isDragging) {
      topText.isDragging = false;
      if (wasClick) {
        // Single click - show editor
        showTextEditor(topText, topText.x, topText.y);
      }
    } else if (bottomText.isDragging) {
      bottomText.isDragging = false;
      if (wasClick) {
        // Single click - show editor
        showTextEditor(bottomText, bottomText.x, bottomText.y);
      }
    } else if (wasClick) {
      // Clicked on canvas but not on text - check if clicked in top or bottom region
      const fontSize = getCurrentFontSize();
      const clickedTextObj = getTextAtPoint(mousePos.x, mousePos.y, fontSize);
      
      if (!clickedTextObj) {
        // Clicked on empty area - determine which text to edit based on position
        const isTopRegion = mousePos.y < canvas.height / 2;
        const targetText = isTopRegion ? topText : bottomText;
        
        // If text doesn't exist at default position, initialize it
        if (targetText.x === 0 && targetText.y === 0) {
          const margin = canvas.height * 0.06;
          targetText.x = canvas.width / 2;
          targetText.y = isTopRegion ? margin : canvas.height - margin;
        } else {
          // Move text to click position
          targetText.x = mousePos.x;
          targetText.y = mousePos.y;
        }
        
        drawMeme();
        showTextEditor(targetText, targetText.x, targetText.y);
      }
    }
    
    canvas.style.cursor = 'default';
  }
  
  function handleMouseLeave(event) {
    if (topText.isDragging) {
      topText.isDragging = false;
    }
    if (bottomText.isDragging) {
      bottomText.isDragging = false;
    }
    canvas.style.cursor = 'default';
  }
  
  // Handle text editor events
  function handleEditorKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      hideTextEditor();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (textEditor && editingText) {
        const textObj = editingText === 'top' ? topText : bottomText;
        textEditor.value = textObj.text; // Reset to original
        hideTextEditor();
      }
    }
  }
  
  function handleEditorBlur() {
    hideTextEditor();
  }

  // Update font size display value
  function updateFontSizeDisplay() {
    if (fontSizeDisplay) {
      fontSizeDisplay.textContent = String(baseFontSizeValue);
    }
  }
  
  // Update color label (optional helper for better UX)
  function updateColorLabels() {
    // This could be enhanced to show color names, but for now we'll keep it simple
  }

  fileInput.addEventListener("change", handleFileChange);
  downloadBtn.addEventListener("click", handleDownload);

  // Zoom controls
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      const next = Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
      if (next !== zoom) {
        zoom = next;
        updateZoomDisplay();
        drawMeme();
      }
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      const next = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
      if (next !== zoom) {
        zoom = next;
        updateZoomDisplay();
        drawMeme();
      }
    });
  }

  // Font size controls
  if (fontSizeIncreaseBtn) {
    fontSizeIncreaseBtn.addEventListener("click", () => {
      setBaseFontSize(baseFontSizeValue + 2);
    });
  }

  if (fontSizeDecreaseBtn) {
    fontSizeDecreaseBtn.addEventListener("click", () => {
      setBaseFontSize(baseFontSizeValue - 2);
    });
  }

  // Colour controls with visible swatches
  if (textColorSwatch && textColorInput) {
    textColorSwatch.style.backgroundColor = textColorInput.value;
    textColorSwatch.addEventListener("click", () => {
      textColorInput.click();
    });
    textColorInput.addEventListener("input", () => {
      textColorSwatch.style.backgroundColor = textColorInput.value;
      drawMeme();
    });
  } else if (textColorInput) {
    textColorInput.addEventListener("input", drawMeme);
  }

  if (strokeColorSwatch && strokeColorInput) {
    strokeColorSwatch.style.backgroundColor = strokeColorInput.value;
    strokeColorSwatch.addEventListener("click", () => {
      strokeColorInput.click();
    });
    strokeColorInput.addEventListener("input", () => {
      strokeColorSwatch.style.backgroundColor = strokeColorInput.value;
      drawMeme();
    });
  } else if (strokeColorInput) {
    strokeColorInput.addEventListener("input", drawMeme);
  }

  // Meme templates
  function loadImageFromSrc(src) {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      image = img;
      fitCanvasToImage(img);
      zoom = 1;
      updateZoomDisplay();
      // Reset positions but keep text content
      topText.x = 0;
      topText.y = 0;
      bottomText.x = 0;
      bottomText.y = 0;
      drawMeme();
      downloadBtn.disabled = false;
      setStatus("Template loaded. Click on the canvas to add/edit text. Drag to move.");
    };
    img.onerror = () => {
      setStatus("Could not load this template. Try another one.");
    };
    setStatus("Loading meme template...");
    img.src = src;
  }

  memeThumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const src = thumb.getAttribute("data-meme-src");
      if (src) {
        loadImageFromSrc(src);
      }
    });
  });

  // Upload trigger button in "All memes" card
  if (uploadTrigger) {
    uploadTrigger.addEventListener("click", () => {
      fileInput.click();
    });
  }
  
  // Canvas drag event listeners
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseLeave);
  
  // Text editor event listeners
  if (textEditor) {
    textEditor.addEventListener("keydown", handleEditorKeyDown);
    textEditor.addEventListener("blur", handleEditorBlur);
  }

  // Initial setup
  updateFontSizeDisplay();
  updateZoomDisplay();
  setPlaceholderVisible(true);
})();


