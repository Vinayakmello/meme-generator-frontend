(() => {
  const fileInput = document.getElementById("image-input");
  const topTextInput = document.getElementById("top-text");
  const bottomTextInput = document.getElementById("bottom-text");
  const downloadBtn = document.getElementById("download-btn");
  const statusMessage = document.getElementById("status-message");
  const canvas = document.getElementById("meme-canvas");
  const placeholder = document.getElementById("preview-placeholder");

  if (!canvas || !fileInput || !topTextInput || !bottomTextInput || !downloadBtn) {
    // Basic guard: if something is missing, bail out quietly.
    console.warn("Meme generator: Missing required DOM elements.");
    return;
  }

  const ctx = canvas.getContext("2d");
  let image = null;
  
  // Text position tracking (x, y coordinates)
  let topTextPos = { x: 0, y: 0 };
  let bottomTextPos = { x: 0, y: 0 };
  
  // Drag state
  let isDragging = false;
  let draggedText = null; // 'top' or 'bottom' or null
  let dragOffset = { x: 0, y: 0 };

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

  function drawTextLine(text, x, y, fontSizePx) {
    if (!text) return;

    ctx.font = `bold ${fontSizePx}px Impact, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    // Classic meme style: white text with black outline
    const strokeWidth = Math.max(4, Math.floor(fontSizePx / 12));
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "white";

    const textUpper = text.toUpperCase();
    ctx.strokeText(textUpper, x, y);
    ctx.fillText(textUpper, x, y);
  }
  
  // Get text bounding box for click detection
  function getTextBounds(text, x, y, fontSizePx) {
    if (!text) return null;
    
    ctx.font = `bold ${fontSizePx}px Impact, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    const textUpper = text.toUpperCase();
    const metrics = ctx.measureText(textUpper);
    const textWidth = metrics.width;
    const textHeight = fontSizePx;
    
    // Add padding around text for easier clicking
    const padding = fontSizePx * 0.3;
    
    return {
      left: x - textWidth / 2 - padding,
      right: x + textWidth / 2 + padding,
      top: y - textHeight / 2 - padding,
      bottom: y + textHeight / 2 + padding
    };
  }
  
  // Detect which text (if any) was clicked
  function getTextAtPoint(mouseX, mouseY, fontSizePx) {
    const topText = topTextInput.value.trim();
    const bottomText = bottomTextInput.value.trim();
    
    if (topText) {
      const bounds = getTextBounds(topText, topTextPos.x, topTextPos.y, fontSizePx);
      if (bounds && mouseX >= bounds.left && mouseX <= bounds.right &&
          mouseY >= bounds.top && mouseY <= bounds.bottom) {
        return 'top';
      }
    }
    
    if (bottomText) {
      const bounds = getTextBounds(bottomText, bottomTextPos.x, bottomTextPos.y, fontSizePx);
      if (bounds && mouseX >= bounds.left && mouseX <= bounds.right &&
          mouseY >= bounds.top && mouseY <= bounds.bottom) {
        return 'bottom';
      }
    }
    
    return null;
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

    const topText = topTextInput.value.trim();
    const bottomText = bottomTextInput.value.trim();

    const baseFontSize = canvas.width / 10; // Adjust relative to canvas width
    const fontSize = Math.max(18, Math.round(baseFontSize));
    const margin = canvas.height * 0.06; // Top/bottom margin for text

    // Initialize positions if not set (first time or after image change)
    if (topTextPos.x === 0 && topTextPos.y === 0) {
      topTextPos.x = canvas.width / 2;
      topTextPos.y = margin;
    }
    if (bottomTextPos.x === 0 && bottomTextPos.y === 0) {
      bottomTextPos.x = canvas.width / 2;
      bottomTextPos.y = canvas.height - margin;
    }

    // Draw text at tracked positions
    drawTextLine(topText, topTextPos.x, topTextPos.y, fontSize);
    drawTextLine(bottomText, bottomTextPos.x, bottomTextPos.y, fontSize);
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
        // Reset text positions when new image loads
        topTextPos = { x: 0, y: 0 };
        bottomTextPos = { x: 0, y: 0 };
        drawMeme();
        downloadBtn.disabled = false;
        setStatus("Image loaded. You can now add text and download your meme. Click and drag text to reposition.");
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
    if (!image) return;
    
    const mousePos = getCanvasMousePos(event);
    const baseFontSize = canvas.width / 10;
    const fontSize = Math.max(18, Math.round(baseFontSize));
    
    const clickedText = getTextAtPoint(mousePos.x, mousePos.y, fontSize);
    
    if (clickedText) {
      isDragging = true;
      draggedText = clickedText;
      const textPos = clickedText === 'top' ? topTextPos : bottomTextPos;
      dragOffset.x = mousePos.x - textPos.x;
      dragOffset.y = mousePos.y - textPos.y;
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
    }
  }
  
  function handleMouseMove(event) {
    if (!image) return;
    
    const mousePos = getCanvasMousePos(event);
    const baseFontSize = canvas.width / 10;
    const fontSize = Math.max(18, Math.round(baseFontSize));
    
    if (isDragging && draggedText) {
      // Update text position during drag
      const newX = mousePos.x - dragOffset.x;
      const newY = mousePos.y - dragOffset.y;
      
      // Keep text within canvas bounds
      const textPos = draggedText === 'top' ? topTextPos : bottomTextPos;
      textPos.x = Math.max(0, Math.min(canvas.width, newX));
      textPos.y = Math.max(0, Math.min(canvas.height, newY));
      
      drawMeme();
    } else {
      // Update cursor to show draggable text
      const hoveredText = getTextAtPoint(mousePos.x, mousePos.y, fontSize);
      canvas.style.cursor = hoveredText ? 'grab' : 'default';
    }
  }
  
  function handleMouseUp(event) {
    if (isDragging) {
      isDragging = false;
      draggedText = null;
      canvas.style.cursor = 'default';
    }
  }
  
  function handleMouseLeave(event) {
    if (isDragging) {
      isDragging = false;
      draggedText = null;
      canvas.style.cursor = 'default';
    }
  }

  fileInput.addEventListener("change", handleFileChange);
  topTextInput.addEventListener("input", drawMeme);
  bottomTextInput.addEventListener("input", drawMeme);
  downloadBtn.addEventListener("click", handleDownload);
  
  // Canvas drag event listeners
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseLeave);

  // Initial placeholder state
  setPlaceholderVisible(true);
})();


