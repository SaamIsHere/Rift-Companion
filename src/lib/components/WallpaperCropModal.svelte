<script lang="ts">
  import { createEventDispatcher, onMount, tick } from "svelte";
  import {
    saveWallpaperCropState,
    loadWallpaperCropState,
    type WallpaperCropState,
  } from "../utils/wallpaperDb";

  export let isOpen: boolean = false;
  export let imageSrc: string = "";

  const dispatch = createEventDispatcher<{
    apply: { croppedDataUrl: string; rawDataUrl: string };
    close: void;
  }>();

  let imgEl: HTMLImageElement | null = null;
  let previewCanvas: HTMLCanvasElement | null = null;
  let containerEl: HTMLDivElement | null = null;

  let naturalW = 0;
  let naturalH = 0;
  let displayW = 0;
  let displayH = 0;

  // Crop box in display coordinates
  let cropX = 0;
  let cropY = 0;
  let cropW = 160;
  let cropH = 90;

  let isDragging = false;
  let dragHandle: "move" | "nw" | "ne" | "sw" | "se" | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let startCropX = 0;
  let startCropY = 0;
  let startCropW = 0;
  let startCropH = 0;

  let zoomScale = 100; // 20% to 100% of maximum fitting 16:9 box

  $: isPortrait = naturalH > naturalW;

  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  function handleImageLoaded() {
    if (!imgEl) return;
    naturalW = imgEl.naturalWidth;
    naturalH = imgEl.naturalHeight;
    updateDisplayDimensions();

    const saved = loadWallpaperCropState();
    if (saved && typeof saved.xNorm === "number" && typeof saved.wNorm === "number" && saved.wNorm > 0) {
      applySavedCropState(saved);
    } else {
      initCropBox();
    }
  }

  function applySavedCropState(saved: WallpaperCropState) {
    if (!displayW || !displayH || !naturalW || !naturalH) return;
    const scale = displayW / naturalW;
    const w = Math.round(saved.wNorm * naturalW * scale);
    const h = Math.round(saved.hNorm * naturalH * scale);
    const x = Math.round(saved.xNorm * naturalW * scale);
    const y = Math.round(saved.yNorm * naturalH * scale);

    cropW = clamp(w, 80, displayW);
    cropH = clamp(h, 45, displayH);
    cropX = clamp(x, 0, displayW - cropW);
    cropY = clamp(y, 0, displayH - cropH);
    zoomScale = saved.zoomScale ?? 100;
    updatePreview();
  }

  function updateDisplayDimensions() {
    if (!imgEl) return;
    displayW = imgEl.clientWidth;
    displayH = imgEl.clientHeight;
  }

  function initCropBox() {
    if (!displayW || !displayH) return;

    const targetRatio = 16 / 9;
    const currentRatio = displayW / displayH;

    let initialW = 0;
    let initialH = 0;

    if (currentRatio < targetRatio) {
      // Image is taller than 16:9 (e.g. portrait)
      initialW = displayW;
      initialH = displayW / targetRatio;
      cropX = 0;
      // Default to top for portrait images to prevent cutting off heads/faces
      cropY = 0;
    } else {
      // Image is wider than 16:9
      initialH = displayH;
      initialW = displayH * targetRatio;
      cropX = (displayW - initialW) / 2;
      cropY = 0;
    }

    cropW = Math.round(initialW);
    cropH = Math.round(initialH);
    zoomScale = 100;
    updatePreview();
  }

  function setPreset(preset: "top" | "center" | "bottom" | "left" | "right") {
    if (!displayW || !displayH) return;

    if (preset === "top") {
      cropY = 0;
    } else if (preset === "center") {
      cropX = clamp((displayW - cropW) / 2, 0, displayW - cropW);
      cropY = clamp((displayH - cropH) / 2, 0, displayH - cropH);
    } else if (preset === "bottom") {
      cropY = Math.max(0, displayH - cropH);
    } else if (preset === "left") {
      cropX = 0;
    } else if (preset === "right") {
      cropX = Math.max(0, displayW - cropW);
    }

    updatePreview();
  }

  function handleZoomChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    zoomScale = val;

    if (!displayW || !displayH) return;
    const targetRatio = 16 / 9;

    // Maximum possible 16:9 width bounded by container
    let maxFittingW = displayW;
    if (maxFittingW / targetRatio > displayH) {
      maxFittingW = displayH * targetRatio;
    }

    const newW = clamp(maxFittingW * (val / 100), 80, maxFittingW);
    const newH = newW / targetRatio;

    // Zoom centered on current crop box center
    const centerX = cropX + cropW / 2;
    const centerY = cropY + cropH / 2;

    cropW = Math.round(newW);
    cropH = Math.round(newH);
    cropX = Math.round(clamp(centerX - cropW / 2, 0, displayW - cropW));
    cropY = Math.round(clamp(centerY - cropH / 2, 0, displayH - cropH));

    updatePreview();
  }

  function startDrag(e: PointerEvent, handle: "move" | "nw" | "ne" | "sw" | "se") {
    e.preventDefault();
    e.stopPropagation();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isDragging = true;
    dragHandle = handle;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startCropX = cropX;
    startCropY = cropY;
    startCropW = cropW;
    startCropH = cropH;
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging || !dragHandle || !displayW || !displayH) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const targetRatio = 16 / 9;

    if (dragHandle === "move") {
      cropX = clamp(startCropX + dx, 0, displayW - cropW);
      cropY = clamp(startCropY + dy, 0, displayH - cropH);
    } else if (dragHandle === "se") {
      let newW = startCropW + dx;
      let newH = newW / targetRatio;

      // Bound to display bounds
      if (cropX + newW > displayW) {
        newW = displayW - cropX;
        newH = newW / targetRatio;
      }
      if (cropY + newH > displayH) {
        newH = displayH - cropY;
        newW = newH * targetRatio;
      }
      if (newW >= 80 && newH >= 45) {
        cropW = Math.round(newW);
        cropH = Math.round(newH);
      }
    } else if (dragHandle === "sw") {
      let newW = startCropW - dx;
      let newH = newW / targetRatio;

      if (startCropX + dx < 0) {
        newW = startCropX + startCropW;
        newH = newW / targetRatio;
      }
      if (cropY + newH > displayH) {
        newH = displayH - cropY;
        newW = newH * targetRatio;
      }
      if (newW >= 80 && newH >= 45) {
        cropX = Math.round(startCropX + startCropW - newW);
        cropW = Math.round(newW);
        cropH = Math.round(newH);
      }
    } else if (dragHandle === "ne") {
      let newW = startCropW + dx;
      let newH = newW / targetRatio;

      if (cropX + newW > displayW) {
        newW = displayW - cropX;
        newH = newW / targetRatio;
      }
      if (startCropY + startCropH - newH < 0) {
        newH = startCropY + startCropH;
        newW = newH * targetRatio;
      }
      if (newW >= 80 && newH >= 45) {
        cropY = Math.round(startCropY + startCropH - newH);
        cropW = Math.round(newW);
        cropH = Math.round(newH);
      }
    } else if (dragHandle === "nw") {
      let newW = startCropW - dx;
      let newH = newW / targetRatio;

      if (startCropX + dx < 0) {
        newW = startCropX + startCropW;
        newH = newW / targetRatio;
      }
      if (startCropY + startCropH - newH < 0) {
        newH = startCropY + startCropH;
        newW = newH * targetRatio;
      }
      if (newW >= 80 && newH >= 45) {
        cropX = Math.round(startCropX + startCropW - newW);
        cropY = Math.round(startCropY + startCropH - newH);
        cropW = Math.round(newW);
        cropH = Math.round(newH);
      }
    }

    updatePreview();
  }

  function stopDrag(e: PointerEvent) {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      isDragging = false;
      dragHandle = null;
    }
  }

  function updatePreview() {
    if (!previewCanvas || !imgEl || !displayW || !displayH || !naturalW || !naturalH) return;

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;

    const scale = naturalW / displayW;
    const sx = Math.max(0, Math.min(Math.round(cropX * scale), naturalW));
    const sy = Math.max(0, Math.min(Math.round(cropY * scale), naturalH));
    const sw = Math.min(Math.round(cropW * scale), naturalW - sx);
    const sh = Math.min(Math.round(cropH * scale), naturalH - sy);

    if (sw > 0 && sh > 0) {
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, previewCanvas.width, previewCanvas.height);
    }
  }

  function handleApply() {
    if (!imgEl || !naturalW || !naturalH || !displayW || !displayH) return;

    const scale = naturalW / displayW;
    const sx = Math.max(0, Math.min(Math.round(cropX * scale), naturalW));
    const sy = Math.max(0, Math.min(Math.round(cropY * scale), naturalH));
    const sw = Math.min(Math.round(cropW * scale), naturalW - sx);
    const sh = Math.min(Math.round(cropH * scale), naturalH - sy);

    // Persist normalized crop framing so future adjustments start right here
    saveWallpaperCropState({
      xNorm: sx / naturalW,
      yNorm: sy / naturalH,
      wNorm: sw / naturalW,
      hNorm: sh / naturalH,
      zoomScale,
    });

    // Export in standard crisp 1920x1080 HD
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 1920;
    exportCanvas.height = 1080;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, 1920, 1080);

    const croppedDataUrl = exportCanvas.toDataURL("image/jpeg", 0.92);
    dispatch("apply", { croppedDataUrl, rawDataUrl: imageSrc });
  }

  function handleCancel() {
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cropY = clamp(cropY - 5, 0, displayH - cropH);
      updatePreview();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      cropY = clamp(cropY + 5, 0, displayH - cropH);
      updatePreview();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      cropX = clamp(cropX - 5, 0, displayW - cropW);
      updatePreview();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      cropX = clamp(cropX + 5, 0, displayW - cropW);
      updatePreview();
    }
  }

  // Window resize observer to adapt crop display coordinates without resetting
  onMount(() => {
    const handleResize = () => {
      if (imgEl && displayW && displayH && naturalW && naturalH) {
        const scale = naturalW / displayW;
        const currentCrop: WallpaperCropState = {
          xNorm: (cropX * scale) / naturalW,
          yNorm: (cropY * scale) / naturalH,
          wNorm: (cropW * scale) / naturalW,
          hNorm: (cropH * scale) / naturalH,
          zoomScale,
        };
        updateDisplayDimensions();
        applySavedCropState(currentCrop);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });
</script>

<svelte:window on:keydown={isOpen ? handleKeydown : undefined} />

{#if isOpen && imageSrc}
  <div
    class="fixed inset-0 z-[60] grid place-items-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
    on:click={handleCancel}
    on:keydown={(e) => e.key === "Escape" && handleCancel()}
    role="presentation"
  >
    <div
      class="glass w-[900px] max-w-[96vw] max-h-[94vh] flex flex-col rounded-2xl p-5 shadow-2xl border border-purple-500/30 overflow-hidden"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-label="Adjust wallpaper framing"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div class="mb-4 flex items-center justify-between border-b border-purple-500/20 pb-3 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="grid h-8 w-8 place-items-center rounded-lg bg-purple-600/30 text-purple-300 border border-purple-400/30">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14" />
              <path d="M18 22V8a2 2 0 0 0-2-2H2" />
            </svg>
          </div>
          <h2 class="text-sm font-bold uppercase tracking-wider text-slate-100">
            Adjust Framing
          </h2>
        </div>

        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close"
          on:click={handleCancel}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <!-- Main Workspace (Editor + Sidebar) -->
      <div class="flex flex-1 min-h-0 flex-col md:flex-row gap-4 overflow-hidden">
        <!-- Interactive Cropping Canvas Area -->
        <div
          bind:this={containerEl}
          class="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-purple-500/20 bg-black/60 p-2 shadow-inner"
        >
          <div
            class="relative inline-block select-none"
            role="presentation"
            on:pointermove={onPointerMove}
            on:pointerup={stopDrag}
          >
            <!-- Source Image -->
            <img
              bind:this={imgEl}
              src={imageSrc}
              alt="Source Wallpaper"
              on:load={handleImageLoaded}
              class="max-h-[50vh] max-w-full rounded object-contain pointer-events-none block"
            />

            {#if displayW > 0 && displayH > 0}
              <!-- Darkened overlay outside the crop box -->
              <!-- Top rect -->
              <div
                class="absolute left-0 top-0 bg-black/65 pointer-events-none transition-colors"
                style="width: {displayW}px; height: {cropY}px;"
              ></div>
              <!-- Bottom rect -->
              <div
                class="absolute left-0 bg-black/65 pointer-events-none transition-colors"
                style="top: {cropY + cropH}px; width: {displayW}px; height: {displayH - (cropY + cropH)}px;"
              ></div>
              <!-- Left rect -->
              <div
                class="absolute left-0 bg-black/65 pointer-events-none transition-colors"
                style="top: {cropY}px; width: {cropX}px; height: {cropH}px;"
              ></div>
              <!-- Right rect -->
              <div
                class="absolute bg-black/65 pointer-events-none transition-colors"
                style="left: {cropX + cropW}px; top: {cropY}px; width: {displayW - (cropX + cropW)}px; height: {cropH}px;"
              ></div>

              <!-- 16:9 Active Crop Box -->
              <div
                class="absolute cursor-move border-2 border-purple-400 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
                style="left: {cropX}px; top: {cropY}px; width: {cropW}px; height: {cropH}px;"
                on:pointerdown={(e) => startDrag(e, "move")}
                role="region"
                aria-label="Move 16:9 crop box"
              >
                <!-- Rule of Thirds subtle grid guidelines -->
                <div class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
                  <div class="border-b border-r border-white/60"></div>
                  <div class="border-b border-r border-white/60"></div>
                  <div class="border-b border-white/60"></div>
                  <div class="border-b border-r border-white/60"></div>
                  <div class="border-b border-r border-white/60"></div>
                  <div class="border-b border-white/60"></div>
                  <div class="border-r border-white/60"></div>
                  <div class="border-r border-white/60"></div>
                  <div></div>
                </div>

                <!-- Corner Resize Handles -->
                <!-- NW -->
                <button
                  type="button"
                  class="absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full bg-white border-2 border-purple-500 shadow-md hover:scale-125 transition-transform"
                  on:pointerdown={(e) => startDrag(e, "nw")}
                  aria-label="Resize top-left corner"
                  tabindex="-1"
                ></button>
                <!-- NE -->
                <button
                  type="button"
                  class="absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-full bg-white border-2 border-purple-500 shadow-md hover:scale-125 transition-transform"
                  on:pointerdown={(e) => startDrag(e, "ne")}
                  aria-label="Resize top-right corner"
                  tabindex="-1"
                ></button>
                <!-- SW -->
                <button
                  type="button"
                  class="absolute -left-2 -bottom-2 h-4 w-4 cursor-nesw-resize rounded-full bg-white border-2 border-purple-500 shadow-md hover:scale-125 transition-transform"
                  on:pointerdown={(e) => startDrag(e, "sw")}
                  aria-label="Resize bottom-left corner"
                  tabindex="-1"
                ></button>
                <!-- SE -->
                <button
                  type="button"
                  class="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full bg-white border-2 border-purple-500 shadow-md hover:scale-125 transition-transform"
                  on:pointerdown={(e) => startDrag(e, "se")}
                  aria-label="Resize bottom-right corner"
                  tabindex="-1"
                ></button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Sidebar Tools & Live Preview -->
        <div class="flex w-full md:w-72 shrink-0 flex-col gap-4 overflow-y-auto pr-0.5">
          <!-- Live Preview Box -->
          <div class="rounded-xl border border-purple-500/25 bg-void-950/70 p-3 shadow-md">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                Live Preview
              </span>
              <span class="text-[10px] text-emerald-300 font-semibold">16:9</span>
            </div>

            <!-- 16:9 Preview Canvas with minimalist overlay -->
            <div class="relative w-full aspect-video overflow-hidden rounded-lg border border-purple-500/30 bg-black/60 shadow-inner">
              <canvas
                bind:this={previewCanvas}
                width="320"
                height="180"
                class="h-full w-full object-cover"
              ></canvas>

              <!-- Atmospheric Vignette -->
              <div class="pointer-events-none absolute inset-0 bg-radial-gradient from-transparent via-[var(--theme-bg-base)]/40 to-[var(--theme-bg-base)]/85"></div>
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--theme-bg-base)]/80 via-transparent to-[var(--theme-bg-base)]/50"></div>

              <!-- Live Preview Overlay: Topbar with Logo only; Center with App Name and Search Bar accurately positioned -->
              <div class="pointer-events-none absolute inset-0 select-none">
                <!-- Topbar: Only Logo -->
                <div class="absolute top-2 left-2.5 flex items-center">
                  <img
                    src="/app-icon.png"
                    alt=""
                    class="h-3 w-3 rounded object-contain drop-shadow"
                    on:error={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = '/logo.png';
                    }}
                  />
                </div>

                <!-- Center: App Name & Search Bar precisely positioned to match client layout -->
                <div class="absolute inset-x-0 top-[42%] -translate-y-1/2 flex flex-col items-center text-center px-4">
                  <!-- Name of Application (centered at ~38% of canvas) -->
                  <h3 class="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] leading-tight">
                    Rift Companion
                  </h3>

                  <!-- Search Bar (centered at ~46% of canvas, above character eyes) -->
                  <div class="mt-1.5 flex w-[84%] items-center gap-1.5 rounded-full border border-purple-400/40 bg-void-950/75 px-2.5 py-0.5 shadow backdrop-blur-xs">
                    <svg class="h-2 w-2 text-purple-300/80 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                    </svg>
                    <span class="text-[6px] text-slate-300/80 truncate">Search specific player or champion...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3">
            <span class="text-[11px] font-bold uppercase tracking-wider text-purple-300 block mb-2">
              Quick Alignment
            </span>

            {#if isPortrait}
              <!-- Vertical Portrait Presets (Top, Center, Bottom) -->
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  on:click={() => setPreset("top")}
                  class="flex items-center justify-center rounded-lg border border-purple-500/25 bg-void-950/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:border-purple-400 hover:text-white"
                >
                  ⬆ Top
                </button>
                <button
                  type="button"
                  on:click={() => setPreset("center")}
                  class="flex items-center justify-center rounded-lg border border-purple-500/25 bg-void-950/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:border-purple-400 hover:text-white"
                >
                  ⏺ Center
                </button>
                <button
                  type="button"
                  on:click={() => setPreset("bottom")}
                  class="flex items-center justify-center rounded-lg border border-purple-500/25 bg-void-950/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:border-purple-400 hover:text-white"
                >
                  ⬇ Bottom
                </button>
              </div>
            {:else}
              <!-- Horizontal Presets (Left, Center, Right) -->
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  on:click={() => setPreset("left")}
                  class="flex items-center justify-center rounded-lg border border-purple-500/25 bg-void-950/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:border-purple-400 hover:text-white"
                >
                  ⬅ Left
                </button>
                <button
                  type="button"
                  on:click={() => setPreset("center")}
                  class="flex items-center justify-center rounded-lg border border-purple-500/25 bg-void-950/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:border-purple-400 hover:text-white"
                >
                  ⏺ Center
                </button>
                <button
                  type="button"
                  on:click={() => setPreset("right")}
                  class="flex items-center justify-center rounded-lg border border-purple-500/25 bg-void-950/60 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:border-purple-400 hover:text-white"
                >
                  ➡ Right
                </button>
              </div>
            {/if}
          </div>

          <!-- Size / Zoom Slider -->
          <div class="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                Framing Size
              </span>
              <span class="font-mono text-xs text-purple-200 font-semibold">{zoomScale}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              step="1"
              value={zoomScale}
              on:input={handleZoomChange}
              class="w-full accent-purple-500 cursor-pointer h-1.5 rounded-lg bg-void-950"
            />
            <div class="flex justify-between text-[9px] text-slate-400 mt-1">
              <span>Zoom / Tight</span>
              <span>Full Image</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="mt-4 flex items-center justify-end gap-3 border-t border-purple-500/20 pt-3 shrink-0">
        <button
          type="button"
          on:click={handleCancel}
          class="rounded-xl border border-purple-500/20 bg-void-950/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          Cancel
        </button>

        <button
          type="button"
          on:click={handleApply}
          class="flex items-center gap-2 rounded-xl border border-purple-400/40 bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-purple-950/50 transition hover:bg-purple-500 hover:scale-[1.02] active:scale-[0.98]"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Apply &amp; Save Wallpaper</span>
        </button>
      </div>
    </div>
  </div>
{/if}
