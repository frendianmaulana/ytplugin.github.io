/* ================================================================
       1. UTILITY — Ekstrak YouTube ID dari berbagai format
    ================================================================ */
function extractYouTubeId(raw) {
  if (!raw) return null;
  raw = raw.trim();

  try {
    const url = new URL(raw.startsWith("http") ? raw : "https://" + raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com") {
      // watch?v=
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      // shorts/ atau embed/
      const m = url.pathname.match(
        /\/(?:shorts|embed|v)\/([A-Za-z0-9_\-]{11})/,
      );
      if (m) return m[1];
    }
    if (host === "youtu.be") {
      return url.pathname.replace(/^\//, "").split(/[?&]/)[0] || null;
    }
  } catch (_) {
    /* bukan URL */
  }

  // Plain 11-char ID
  if (/^[A-Za-z0-9_\-]{11}$/.test(raw)) return raw;

  // Fallback: cari v=ID
  const vp = raw.match(/[?&]v=([A-Za-z0-9_\-]{11})/);
  if (vp) return vp[1];

  return null;
}

/* ================================================================
       2. ELEMEN
    ================================================================ */
const inputEl = document.getElementById("input");
const videoPreview = document.getElementById("video-preview");
const placeholder = document.getElementById("video-placeholder");
const resultSpan = document.getElementById("result");
const resultBox = document.getElementById("result-box");
const btnQR = document.getElementById("btn-qr");
const btnClear = document.getElementById("btn-clear");
const btnCopy = document.getElementById("btn-copy");
const btnShot = document.getElementById("btn-screenshot");
const qrSpinner = document.getElementById("qr-spinner");
const qrIcon = document.getElementById("qr-icon");

let currentId = null; // Video ID aktif
let screenshotDataURL = null; // Menyimpan hasil canvas

/* ================================================================
       3. RENDER VIDEO
    ================================================================ */
function renderVideo(id) {
  currentId = id || null;

  if (id) {
    placeholder.style.display = "none";
    videoPreview.innerHTML = `
          <iframe
            src="https://www.youtube.com/embed/${id}"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            loading="lazy"
          ></iframe>`;
    const link = `https://youtu.be/${id}`;
    resultSpan.innerHTML = `<a href="${link}" target="_blank" rel="noopener">${link}</a>`;
    resultBox.classList.remove("empty");
    btnCopy.classList.remove("d-none");
  } else {
    placeholder.style.display = "";
    videoPreview.innerHTML = "";
    resultSpan.textContent = "—";
    resultBox.classList.add("empty");
    btnCopy.classList.add("d-none");
  }
}

/* ================================================================
       4. AUTO-RESIZE TEXTAREA
    ================================================================ */
function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + "px";
}

/* ================================================================
       5. INPUT / PASTE EVENT
    ================================================================ */
function handleInput() {
  autoResize();
  renderVideo(extractYouTubeId(inputEl.value));
}

inputEl.addEventListener("input", handleInput);
inputEl.addEventListener("paste", () => setTimeout(handleInput, 0));

/* ================================================================
       6. DOWNLOAD QR CODE
    ================================================================ */
btnQR.addEventListener("click", async () => {
  if (!currentId) {
    Swal.fire({
      icon: "info",
      title: "Info",
      text: "Masukkan URL atau ID YouTube terlebih dahulu.",
      confirmButtonText: "OKE",
    });
    return;
  }

  // Loading state
  qrSpinner.classList.remove("d-none");
  qrIcon.classList.add("d-none");
  btnQR.disabled = true;

  try {
    const res = await fetch(
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://youtu.be/${currentId}`,
    );
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qrcode (${currentId}).jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);

    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: "QR Code berhasil didownload.",
      confirmButtonText: "OKE",
    });
  } catch {
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: "Tidak dapat mengambil QR Code. Periksa koneksi internet.",
      confirmButtonText: "OKE",
    });
  } finally {
    qrSpinner.classList.add("d-none");
    qrIcon.classList.remove("d-none");
    btnQR.disabled = false;
  }
});

/* ================================================================
       7. CLEAR
    ================================================================ */
btnClear.addEventListener("click", () => {
  if (inputEl.value !== "") {
    inputEl.value = "";
    autoResize();
    renderVideo(null);
  } else {
    Swal.fire({
      icon: "info",
      title: "Info",
      text: "Kolom sudah kosong.",
      confirmButtonText: "OKE",
    });
  }
});

/* ================================================================
       8. SALIN LINK
    ================================================================ */
btnCopy.addEventListener("click", () => {
  if (!currentId) return;
  const link = `https://youtu.be/${currentId}`;
  navigator.clipboard
    .writeText(link)
    .then(() =>
      Swal.fire({
        icon: "success",
        title: "Tersalin!",
        text: link,
        timer: 1800,
        showConfirmButton: false,
      }),
    )
    .catch(() =>
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: "Tidak dapat menyalin link.",
        confirmButtonText: "OKE",
      }),
    );
});

/* ================================================================
       9. SCREENSHOT — Pendekatan manual dengan Canvas 2D API
          (tanpa html2canvas agar lebih ringan & tidak bergantung iframe)

       Strategi:
         • Gambar kartu (background + teks label + URL link) langsung
           ke canvas menggunakan Canvas 2D API.
         • Thumbnail YouTube diambil lewat URL publik
           https://img.youtube.com/vi/{id}/hqdefault.jpg  (CORS friendly)
           dan digambar di atas canvas.
         • Hasil ditampilkan di modal Bootstrap, user bisa download.
    ================================================================ */
const screenshotModal = new bootstrap.Modal(
  document.getElementById("screenshot-modal"),
);
const screenshotImg = document.getElementById("screenshot-img");
const btnDownShot = document.getElementById("btn-download-screenshot");

btnShot.addEventListener("click", () => {
  if (!currentId) {
    Swal.fire({
      icon: "info",
      title: "Info",
      text: "Masukkan URL atau ID YouTube terlebih dahulu.",
      confirmButtonText: "OKE",
    });
    return;
  }
  buildScreenshot(currentId);
});

function buildScreenshot(id) {
  const thumbUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  const ytLink = `https://youtu.be/${id}`;

  // Ukuran canvas (px)
  const W = 800,
    H = 500;
  const PAD = 32;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Deteksi dark-mode
  const isDark =
    document.documentElement.getAttribute("data-bs-theme") === "dark";
  const BG_CARD = isDark ? "#1e2a3a" : "#dbeafe";
  const BG_THUMB = isDark ? "#0d1117" : "#e2e8f0";
  const TEXT_MAIN = isDark ? "#f8f9fa" : "#1e293b";
  const TEXT_SUB = isDark ? "#94a3b8" : "#475569";
  const ACCENT = "#dc3545";

  /* — Background card — */
  roundRect(ctx, 0, 0, W, H, 20, BG_CARD);

  /* — Header bar — */
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 6);

  /* — YouTube icon (emoji) + Judul — */
  ctx.font = "bold 26px Courgette, Georgia, serif";
  ctx.fillStyle = ACCENT;
  ctx.fillText("▶", PAD, PAD + 30);
  ctx.fillStyle = TEXT_MAIN;
  ctx.fillText(" Youtube Plugin Inputan", PAD + 4, PAD + 30);

  /* — Garis pemisah — */
  ctx.strokeStyle = isDark ? "#334155" : "#bfdbfe";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 44);
  ctx.lineTo(W - PAD, PAD + 44);
  ctx.stroke();

  /* — Area thumbnail — */
  const thumbX = PAD;
  const thumbY = PAD + 56;
  const thumbW = W - PAD * 2;
  const thumbH = Math.round((thumbW * 9) / 16); // 16:9

  // Placeholder abu sementara thumbnail load
  roundRect(ctx, thumbX, thumbY, thumbW, thumbH, 10, BG_THUMB);
  ctx.fillStyle = TEXT_SUB;
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Memuat thumbnail…", W / 2, thumbY + thumbH / 2);
  ctx.textAlign = "left";

  // Load thumbnail
  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = () => {
    // Gambar ulang dengan thumbnail
    roundRect(ctx, 0, 0, W, H, 20, BG_CARD);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, W, 6);

    ctx.font = "bold 26px Courgette, Georgia, serif";
    ctx.fillStyle = ACCENT;
    ctx.fillText("▶", PAD, PAD + 30);
    ctx.fillStyle = TEXT_MAIN;
    ctx.fillText(" Youtube Plugin Inputan", PAD + 4, PAD + 30);

    ctx.strokeStyle = isDark ? "#334155" : "#bfdbfe";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 44);
    ctx.lineTo(W - PAD, PAD + 44);
    ctx.stroke();

    // Clip thumbnail dengan radius
    ctx.save();
    roundRect(ctx, thumbX, thumbY, thumbW, thumbH, 10, null, true);
    ctx.clip();
    ctx.drawImage(img, thumbX, thumbY, thumbW, thumbH);
    ctx.restore();

    // Overlay play button di tengah thumbnail
    drawPlayButton(ctx, W / 2, thumbY + thumbH / 2);

    // Footer info
    drawFooter(ctx, ytLink, id, W, H, PAD, TEXT_MAIN, TEXT_SUB, isDark);

    finalizeScreenshot(canvas, id);
  };

  img.onerror = () => {
    // Thumbnail gagal — gambar placeholder dengan pesan
    roundRect(ctx, thumbX, thumbY, thumbW, thumbH, 10, BG_THUMB);
    ctx.fillStyle = TEXT_SUB;
    ctx.font = "italic 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Thumbnail tidak tersedia (iframe tidak bisa di-capture)",
      W / 2,
      thumbY + thumbH / 2,
    );
    ctx.textAlign = "left";

    drawPlayButton(ctx, W / 2, thumbY + thumbH / 2);
    drawFooter(ctx, ytLink, id, W, H, PAD, TEXT_MAIN, TEXT_SUB, isDark);
    finalizeScreenshot(canvas, id);
  };

  img.src = thumbUrl;
}

/* Simpan hasil & tampilkan modal */
function finalizeScreenshot(canvas, id) {
  screenshotDataURL = canvas.toDataURL("image/png");
  screenshotImg.src = screenshotDataURL;

  btnDownShot.onclick = () => {
    const a = document.createElement("a");
    a.href = screenshotDataURL;
    a.download = `screenshot (${id}).png`;
    a.click();
  };

  screenshotModal.show();
}

/* Helper: Tombol play di tengah thumbnail */
function drawPlayButton(ctx, cx, cy) {
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "#dc3545";
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 16);
  ctx.lineTo(cx + 22, cy);
  ctx.lineTo(cx - 10, cy + 16);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* Helper: Footer (link + ID) */
function drawFooter(ctx, link, id, W, H, PAD, TEXT_MAIN, TEXT_SUB, isDark) {
  const footerY = H - PAD - 10;

  ctx.font = "13px monospace";
  ctx.fillStyle = TEXT_SUB;
  ctx.fillText(`ID: ${id}`, PAD, footerY - 18);

  ctx.font = "13px sans-serif";
  ctx.fillStyle = isDark ? "#93c5fd" : "#1d4ed8";
  ctx.fillText(`🔗 ${link}`, PAD, footerY);

  // Watermark kanan bawah
  ctx.font = "11px sans-serif";
  ctx.fillStyle = TEXT_SUB;
  ctx.textAlign = "right";
  ctx.fillText("YouTube Plugin Inputan", W - PAD, footerY);
  ctx.textAlign = "left";
}

/* Helper: roundRect (kompatibel semua browser) */
function roundRect(ctx, x, y, w, h, r, fill, clipOnly = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (!clipOnly && fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}
