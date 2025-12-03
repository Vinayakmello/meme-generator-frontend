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

  function drawTextLine(text, y, fontSizePx) {
    if (!text) return;

    ctx.font = `bold ${fontSizePx}px Impact, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    const x = canvas.width / 2;

    // Classic meme style: white text with black outline
    const strokeWidth = Math.max(4, Math.floor(fontSizePx / 12));
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "white";

    const textUpper = text.toUpperCase();
    ctx.strokeText(textUpper, x, y);
    ctx.fillText(textUpper, x, y);
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

    // Top text
    drawTextLine(topText, margin, fontSize);

    // Bottom text
    drawTextLine(bottomText, canvas.height - margin, fontSize);
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
        drawMeme();
        downloadBtn.disabled = false;
        setStatus("Image loaded. You can now add text and download your meme.");
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

  fileInput.addEventListener("change", handleFileChange);
  topTextInput.addEventListener("input", drawMeme);
  bottomTextInput.addEventListener("input", drawMeme);
  downloadBtn.addEventListener("click", handleDownload);

  // Initial placeholder state
  setPlaceholderVisible(true);
})();


