(() => {
  const fileInput = document.getElementById("image-input");
  const downloadBtn = document.getElementById("download-btn");
  const statusMessage = document.getElementById("status-message");
  const canvas = document.getElementById("meme-canvas");
  const placeholder = document.getElementById("preview-placeholder");
  const fontSizeSlider = document.getElementById("font-size");
  const fontSizeValue = document.getElementById("font-size-value");
  const textColorInput = document.getElementById("text-color");
  const strokeColorInput = document.getElementById("stroke-color");
  const textEditor = document.getElementById("text-editor");

  if (!canvas || !fileInput || !downloadBtn) {
    console.warn("Meme generator: Missing required DOM elements.");
    return;
  }

  const ctx = canvas.getContext("2d");
  let image = null;
  
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
    const maxWidth = 800;
    const maxHeight = 800;
    let { width, height } = img;

    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const scale = Math.min(1, widthRatio, heightRatio);

    width = Math.round(width * scale);
    height = Math.round(height * scale);

    canvas.width = width;
    canvas.height = height;
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
    
    const rect = canvas.getBoundingClientRect();
    const canvasWrapper = canvas.parentElement;
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    
    // Calculate position relative to canvas wrapper
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const x = rect.left - wrapperRect.left + (canvasX * scaleX);
    const y = rect.top - wrapperRect.top + (canvasY * scaleY);
    
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
    if (!image) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setPlaceholderVisible(true);
      return;
    }

    setPlaceholderVisible(false);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Use font size from slider, scaled relative to canvas width
    const sliderValue = fontSizeSlider ? parseInt(fontSizeSlider.value) : 60;
    const baseFontSize = (canvas.width / 800) * sliderValue; // Scale based on canvas size
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
    const sliderValue = fontSizeSlider ? parseInt(fontSizeSlider.value) : 60;
    const baseFontSize = (canvas.width / 800) * sliderValue;
    return Math.max(18, Math.round(baseFontSize));
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
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
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
    if (fontSizeValue && fontSizeSlider) {
      fontSizeValue.textContent = fontSizeSlider.value;
    }
  }
  
  // Update color label (optional helper for better UX)
  function updateColorLabels() {
    // This could be enhanced to show color names, but for now we'll keep it simple
  }

  fileInput.addEventListener("change", handleFileChange);
  downloadBtn.addEventListener("click", handleDownload);
  
  // Control event listeners
  if (fontSizeSlider) {
    fontSizeSlider.addEventListener("input", () => {
      updateFontSizeDisplay();
      drawMeme();
    });
  }
  
  if (textColorInput) {
    textColorInput.addEventListener("input", drawMeme);
  }
  
  if (strokeColorInput) {
    strokeColorInput.addEventListener("input", drawMeme);
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
  setPlaceholderVisible(true);
})();


