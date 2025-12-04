(() => {
  const fileInput = document.getElementById("image-input");
  const downloadBtn = document.getElementById("download-btn");
  const statusMessage = document.getElementById("status-message");
  const canvas = document.getElementById("memeCanvas");
  const placeholder = document.getElementById("preview-placeholder");
  const textColorInput = document.getElementById("text-color");
  const strokeColorInput = document.getElementById("stroke-color");
  const textEditor = document.getElementById("text-editor");
  const zoomValueEl = document.getElementById("zoom-value");
  const fontSizeIncreaseBtn = document.getElementById("font-size-increase");
  const fontSizeDecreaseBtn = document.getElementById("font-size-decrease");
  const fontSizeDisplay = document.getElementById("font-size-value");
  const textColorSwatch = document.getElementById("text-color-swatch");
  const strokeColorSwatch = document.getElementById("stroke-color-swatch");
  const memeThumbs = document.querySelectorAll("[data-meme-src]");
  const uploadTrigger = document.getElementById("upload-trigger");
  const workspace = document.getElementById("workspace");
  const artboardWrapper = document.getElementById("artboard-wrapper");

  if (!canvas || !fileInput || !downloadBtn || !workspace || !artboardWrapper) {
    console.warn("Meme generator: Missing required DOM elements.");
    return;
  }

  const ctx = canvas.getContext("2d");
  let image = null;

  // Text objects array (supports unlimited layers)
  const texts = [];
  let editingTextObj = null;
  let dragOffset = { x: 0, y: 0 };
  let mouseDownTime = 0;
  let mouseDownPos = { x: 0, y: 0 };
  const CLICK_THRESHOLD = 5; // pixels - if moved more than this, it's a drag
  const CLICK_TIME_THRESHOLD = 200; // ms - if held longer, it's a drag

  // View transform state (Figma-style pan + zoom around a floating artboard)
  let scale = 1; // zoom level
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 4;
  const SCALE_STEP = 0.1;
  let panX = 0;
  let panY = 0;

  // Panning state (drag background/image to move view)
  let isSpacePressed = false; // optional secondary shortcut
  let isPanning = false;
  let isPanCandidate = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let startMouseX = 0;
  let startMouseY = 0;
  let panStartClientX = 0;
  let panStartClientY = 0;

  // Base font size controlled via +/- UI
  let baseFontSizeValue = 25;
  const MIN_FONT_SIZE_VALUE = 12;
  const MAX_FONT_SIZE_VALUE = 120;

  function updateZoomDisplay() {
    if (zoomValueEl) {
      zoomValueEl.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  /**
   * Apply CSS transform to the artboard wrapper so that pan/zoom only affect
   * the view in the editor. The actual canvas drawing and export stay
   * completely unscaled in its internal coordinate system.
   */
  function updateTransform() {
    artboardWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
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
    const imgScale = Math.min(1, widthRatio, heightRatio);

    width = Math.round(width * imgScale);
    height = Math.round(height * imgScale);

    canvas.width = width;
    canvas.height = height;
  }

  function centerArtboardInWorkspace() {
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    const canvasWidthOnScreen = canvas.width * scale;
    const canvasHeightOnScreen = canvas.height * scale;
    panX = (rect.width - canvasWidthOnScreen) / 2;
    panY = (rect.height - canvasHeightOnScreen) / 2;
    updateTransform();
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
        bottom: textObj.y + textHeight / 2 + padding,
      };
    });
  }

  // Detect which text (if any) was clicked (top-most first)
  function getTextAtPoint(mouseX, mouseY, fontSizePx) {
    for (let i = texts.length - 1; i >= 0; i -= 1) {
      const textObj = texts[i];
      if (!textObj.text) continue;
      const bounds = getTextBounds(textObj, fontSizePx);
      if (
        bounds &&
        mouseX >= bounds.left &&
        mouseX <= bounds.right &&
        mouseY >= bounds.top &&
        mouseY <= bounds.bottom
      ) {
        return textObj;
      }
    }
    return null;
  }

  function selectText(target) {
    texts.forEach((t) => {
      t.isSelected = t === target;
    });
  }

  // Show text editor at clicked position
  function showTextEditor(textObj, canvasX, canvasY) {
    if (!textEditor) return;

    editingTextObj = textObj;
    selectText(textObj);

    const rect = canvas.getBoundingClientRect();
    const canvasWrapper = canvas.parentElement;
    const wrapperRect = canvasWrapper.getBoundingClientRect();

    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const x = rect.left - wrapperRect.left + canvasX * scaleX;
    const y = rect.top - wrapperRect.top + canvasY * scaleY;

    // Position editor above the text
    const fontSize = getCurrentFontSize();
    textEditor.style.fontSize = `${fontSize}px`;
    textEditor.style.left = `${x}px`;
    textEditor.style.top = `${Math.max(10, y - fontSize - 20)}px`; // Ensure it doesn't go off top
    textEditor.style.transform = "translateX(-50%)"; // Center horizontally
    textEditor.value = textObj.text;
    textEditor.style.display = "block";
    textEditor.focus();
    textEditor.select();
  }

  // Hide text editor and save changes
  function hideTextEditor() {
    if (!textEditor || !editingTextObj) return;

    editingTextObj.text = textEditor.value.trim();
    textEditor.style.display = "none";
    editingTextObj = null;
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

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Use font size from controls, scaled relative to canvas width
    const sliderValue = baseFontSizeValue;
    // Font size is based purely on logical canvas dimensions; the workspace
    // zoom only changes how it looks on screen, not what is drawn/exported.
    const baseFontSize = (canvas.width / 800) * sliderValue;
    const fontSize = Math.max(18, Math.round(baseFontSize));

    // Draw all text layers
    texts.forEach((textObj) => {
      drawTextLine(textObj, fontSize);
    });
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

  /**
   * Core loader for local image files (from file input or drag & drop).
   * Optionally adds a thumbnail into the "All memes" grid for re-selection.
   */
  function loadImageFromFile(file, { addToMemesGrid = true } = {}) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        image = img;
        fitCanvasToImage(img);
        // Reset text objects when new image loads
        texts.length = 0;
        editingTextObj = null;

        // Reset workspace pan/zoom for new image and center it
        scale = 1;
        centerArtboardInWorkspace();
        updateZoomDisplay();

        drawMeme();
        downloadBtn.disabled = false;
        setStatus(
          "Image loaded. Click on the canvas to add/edit text. Drag to move."
        );

        // Optionally add thumbnail to the "All memes" grid
        if (addToMemesGrid) {
          const memesGrid = document.querySelector(".memes-grid");
          if (memesGrid && typeof reader.result === "string") {
            const thumb = document.createElement("button");
            thumb.type = "button";
            thumb.className = "meme-thumb";
            thumb.setAttribute("aria-label", "Uploaded meme");
            const imgEl = document.createElement("img");
            imgEl.src = reader.result;
            imgEl.alt = "Uploaded meme thumbnail";
            thumb.appendChild(imgEl);
            thumb.addEventListener("click", () => {
              loadImageFromSrc(reader.result);
            });
            memesGrid.prepend(thumb);
          }
        }
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

    loadImageFromFile(file);
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
    // Because zoom is now handled via a CSS transform on the artboard wrapper,
    // the bounding rect already reflects the on-screen scale. Mapping back to
    // canvas coordinates is simply rect ratio *without* any zoom correction.
    return { x: xCanvas, y: yCanvas };
  }

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (!image || editingTextObj) return;

    const mousePos = getCanvasMousePos(event);
    mouseDownTime = Date.now();
    mouseDownPos = { x: mousePos.x, y: mousePos.y };

    const fontSize = getCurrentFontSize();
    const clickedTextObj = getTextAtPoint(mousePos.x, mousePos.y, fontSize);

    // If Space is held, prefer panning over text drag
    if (!isSpacePressed && clickedTextObj) {
      clickedTextObj.isDragging = true;
      selectText(clickedTextObj);
      dragOffset.x = mousePos.x - clickedTextObj.x;
      dragOffset.y = mousePos.y - clickedTextObj.y;
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }

    // Otherwise, start a pan candidate (will become real pan if mouse moves)
    isPanCandidate = true;
    panStartClientX = event.clientX;
    panStartClientY = event.clientY;
    startMouseX = event.clientX;
    startMouseY = event.clientY;
    lastPanX = panX;
    lastPanY = panY;
    event.preventDefault();
  }

  function handleMouseMove(event) {
    if (!image || editingTextObj || isPanning) return;

    const mousePos = getCanvasMousePos(event);
    const fontSize = getCurrentFontSize();

    // Check if any text is being dragged
    let isDraggingAny = false;
    texts.forEach((textObj) => {
      if (!textObj.isDragging) return;
      const newX = mousePos.x - dragOffset.x;
      const newY = mousePos.y - dragOffset.y;
      textObj.x = Math.max(0, Math.min(canvas.width, newX));
      textObj.y = Math.max(0, Math.min(canvas.height, newY));
      drawMeme();
      isDraggingAny = true;
    });

    if (!isDraggingAny) {
      // Update cursor to show draggable text
      const hoveredText = getTextAtPoint(
        mousePos.x,
        mousePos.y,
        fontSize
      );
      canvas.style.cursor = hoveredText ? "grab" : "default";
    }
  }

  function handleMouseUp(event) {
    if (!image || editingTextObj) return;

    const mousePos = getCanvasMousePos(event);
    const mouseUpTime = Date.now();
    const timeDiff = mouseUpTime - mouseDownTime;
    const distance = Math.sqrt(
      Math.pow(mousePos.x - mouseDownPos.x, 2) +
        Math.pow(mousePos.y - mouseDownPos.y, 2)
    );

    // Determine if it was a click (edit) or drag (move)
    const wasClick =
      distance < CLICK_THRESHOLD && timeDiff < CLICK_TIME_THRESHOLD;

    // End any active text dragging
    let draggedText = null;
    texts.forEach((textObj) => {
      if (textObj.isDragging) {
        textObj.isDragging = false;
        draggedText = textObj;
      }
    });

    // If we were actually panning, don't treat this as a click
    if (isPanning) {
      isPanning = false;
      isPanCandidate = false;
      if (workspace) workspace.classList.remove("is-panning");
      canvas.style.cursor = "default";
      return;
    }

    // If we armed a pan candidate but didn't move enough, treat it as a click.
    // If it wasn't a click either, just reset and bail.
    if (isPanCandidate && !wasClick) {
      isPanCandidate = false;
      canvas.style.cursor = "default";
      return;
    }

    // Clear any pending pan candidate for real clicks
    isPanCandidate = false;

    if (draggedText && wasClick) {
      // Click (no real drag) on an existing text – edit it
      showTextEditor(draggedText, draggedText.x, draggedText.y);
    } else if (wasClick) {
      // Clicked on canvas but not on text – either select or create new text
      const fontSize = getCurrentFontSize();
      const clickedTextObj = getTextAtPoint(
        mousePos.x,
        mousePos.y,
        fontSize
      );

      if (clickedTextObj) {
        selectText(clickedTextObj);
        showTextEditor(clickedTextObj, clickedTextObj.x, clickedTextObj.y);
      } else {
        // Create a brand new text object at this position
        const newText = {
          id: Date.now() + Math.random(),
          text: "",
          x: mousePos.x,
          y: mousePos.y,
          fontSize,
          fill: textColorInput ? textColorInput.value : "#ffffff",
          stroke: strokeColorInput ? strokeColorInput.value : "#000000",
          isDragging: false,
          isSelected: true,
        };
        texts.push(newText);
        selectText(newText);
        drawMeme();
        showTextEditor(newText, newText.x, newText.y);
      }
    }

    canvas.style.cursor = "default";
  }

  function handleMouseLeave() {
    texts.forEach((textObj) => {
      textObj.isDragging = false;
    });
    canvas.style.cursor = "default";
  }

  // Handle text editor events
  function handleEditorKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      hideTextEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (textEditor && editingTextObj) {
        textEditor.value = editingTextObj.text; // Reset to original
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

  fileInput.addEventListener("change", handleFileChange);
  downloadBtn.addEventListener("click", handleDownload);

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
      // Reset workspace view when switching templates and centre the artboard
      scale = 1;
      centerArtboardInWorkspace();
      updateZoomDisplay();
      // Clear any existing text layers when switching templates
      texts.length = 0;
      editingTextObj = null;
      drawMeme();
      downloadBtn.disabled = false;
      setStatus(
        "Template loaded. Click on the canvas to add/edit text. Drag to move."
      );
    };
    img.onerror = () => {
      setStatus("Could not load this template. Try another one.");
    };
    setStatus("Loading meme template...");
    img.src = src;
  }

  memeThumbs.forEach((thumb) => {
    const src = thumb.getAttribute("data-meme-src");
    if (src) {
      const imgEl = document.createElement("img");
      imgEl.src = src;
      imgEl.alt = thumb.getAttribute("aria-label") || "Meme thumbnail";
      thumb.appendChild(imgEl);
    }

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

  /**
   * Workspace zoom with scroll/trackpad, centred on cursor (Figma-style).
   * Zoom is clamped between MIN_SCALE and MAX_SCALE.
   */
  if (workspace) {
    workspace.addEventListener(
      "wheel",
      (event) => {
        // Always treat wheel/trackpad as zoom gesture inside the workspace
        event.preventDefault();

        const rect = workspace.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;

        const zoomDirection = event.deltaY < 0 ? 1 : -1; // up -> in, down -> out
        const zoomFactor = 1 + zoomDirection * SCALE_STEP;
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, scale * zoomFactor)
        );

        if (newScale === scale) {
          return;
        }

        // World coordinates of the point under the cursor before zoom
        const worldX = (cursorX - panX) / scale;
        const worldY = (cursorY - panY) / scale;

        // Adjust pan so the cursor stays over the same world point
        panX = cursorX - worldX * newScale;
        panY = cursorY - worldY * newScale;
        scale = newScale;

        updateTransform();
        updateZoomDisplay();
      },
      { passive: false }
    );
  }

  /**
   * Optional: Space key shows hand cursor but panning works with left-drag
   * on empty canvas / workspace even without Space.
   */
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      // Avoid stealing space from focused inputs (e.g. text editor)
      const target = event.target;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      event.preventDefault();
      isSpacePressed = true;
      if (workspace) workspace.classList.add("is-space-pressed");
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      isSpacePressed = false;
      if (workspace) {
        workspace.classList.remove("is-space-pressed");
      }
    }
  });

  function startPan(event) {
    if (event.button !== 0) return;
    isPanCandidate = true;
    panStartClientX = event.clientX;
    panStartClientY = event.clientY;
    startMouseX = event.clientX;
    startMouseY = event.clientY;
    lastPanX = panX;
    lastPanY = panY;
  }

  workspace.addEventListener("mousedown", (event) => {
    // Canvas mousedown handles its own logic (text vs pan); only start pan
    // here for clicks on empty workspace chrome.
    if (event.target === canvas) return;
    startPan(event);
  });

  window.addEventListener("mousemove", (event) => {
    if (!isPanCandidate && !isPanning) return;

    const dxFromStart = event.clientX - panStartClientX;
    const dyFromStart = event.clientY - panStartClientY;
    const distanceFromStart = Math.sqrt(
      dxFromStart * dxFromStart + dyFromStart * dyFromStart
    );

    // Promote to real pan once we move past the click threshold
    if (!isPanning && distanceFromStart > CLICK_THRESHOLD) {
      isPanning = true;
      if (workspace) workspace.classList.add("is-panning");
    }

    if (!isPanning) return;

    const dx = event.clientX - startMouseX;
    const dy = event.clientY - startMouseY;
    panX = lastPanX + dx;
    panY = lastPanY + dy;
    updateTransform();
  });

  window.addEventListener("mouseup", () => {
    if (!isPanning && !isPanCandidate) return;
    isPanning = false;
    isPanCandidate = false;
    if (workspace) workspace.classList.remove("is-panning");
  });

  /**
   * Drag & drop image upload:
   * - Supports dropping on the main workspace (including artboard)
   * - Supports dropping directly on the "Upload your own" button
   */
  function isImageFile(file) {
    return file && file.type && file.type.startsWith("image/");
  }

  function handleDropFiles(event, { addHighlightTo } = {}) {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;
    const file = Array.from(dt.files).find(isImageFile);
    if (!file) {
      setStatus("Please drop an image file (JPG, PNG, GIF).");
      return;
    }
    if (addHighlightTo) {
      addHighlightTo.classList.remove("is-drag-over");
    }
    loadImageFromFile(file);
  }

  function attachDropTarget(element) {
    if (!element) return;

    element.addEventListener("dragover", (event) => {
      const dt = event.dataTransfer;
      if (dt && Array.from(dt.items || []).some((i) => i.kind === "file")) {
        event.preventDefault();
        element.classList.add("is-drag-over");
      }
    });

    element.addEventListener("dragleave", (event) => {
      // Only clear highlight when leaving the element, not when moving between children
      if (!element.contains(event.relatedTarget)) {
        element.classList.remove("is-drag-over");
      }
    });

    element.addEventListener("drop", (event) => {
      handleDropFiles(event, { addHighlightTo: element });
    });
  }

  // Upload button still uses outline-style highlight
  attachDropTarget(uploadTrigger);

  // Workspace drag & drop uses drag-overlay + .drag-over on #workspace
  ["dragenter", "dragover"].forEach((type) => {
    workspace.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      workspace.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    workspace.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      workspace.classList.remove("drag-over");
    });
  });

  workspace.addEventListener("drop", (event) => {
    const dt = event.dataTransfer;
    const file = dt && dt.files && dt.files[0];
    if (!file || !file.type || !file.type.startsWith("image/")) return;
    loadImageFromFile(file);
  });

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
  updateTransform();
})();
