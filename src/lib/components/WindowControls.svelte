<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { collapsed } from "../stores/ui";

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const appWindow = isTauri ? getCurrentWindow() : null;

  let maximized = false;
  let restore: { w: number; h: number } | null = null;
  let unlisten: (() => void) | undefined;

  onMount(async () => {
    if (!appWindow) return;
    try {
      maximized = await appWindow.isMaximized();
      // Keep the maximize/restore glyph in sync with double-click-to-maximize etc.
      unlisten = await appWindow.onResized(async () => {
        maximized = await appWindow.isMaximized();
      });
    } catch {
      /* best-effort state sync; ignore if unavailable */
    }
  });
  onDestroy(() => unlisten?.());

  const minimize = () => appWindow?.minimize();
  const close = () => appWindow?.close();

  async function toggleMaximize() {
    if (!appWindow) return;
    if ($collapsed) await toggleCollapse(); // expand first; the two don't mix
    await appWindow.toggleMaximize();
    maximized = await appWindow.isMaximized();
  }

  /** Window-shade: roll the window up to just the title bar, and back. */
  async function toggleCollapse() {
    if (!appWindow) {
      collapsed.update((v) => !v);
      return;
    }
    if (!$collapsed) {
      const sz = await appWindow.innerSize();
      const sf = await appWindow.scaleFactor();
      restore = { w: Math.round(sz.width / sf), h: Math.round(sz.height / sf) };
      const header = document.querySelector("header");
      const barH = header ? Math.ceil(header.getBoundingClientRect().height) : 64;
      collapsed.set(true); // hide <main> before shrinking so it doesn't flash
      // Temporarily lower the min height (tauri.conf sets minHeight:640) so we can roll up.
      await appWindow.setMinSize(new LogicalSize(restore.w, barH));
      await appWindow.setSize(new LogicalSize(restore.w, barH));
    } else {
      const w = restore?.w ?? 1180;
      const h = restore?.h ?? 760;
      await appWindow.setSize(new LogicalSize(w, h));
      await appWindow.setMinSize(new LogicalSize(980, 640)); // restore configured constraints
      collapsed.set(false);
    }
  }

  const btn =
    "grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-slate-100";
</script>

<div class="flex items-center gap-1">
  <!-- Collapse / expand (window-shade) -->
  <button class={btn} title={$collapsed ? "Expand" : "Collapse"} aria-label={$collapsed ? "Expand window" : "Collapse window"} on:click={toggleCollapse}>
    {#if $collapsed}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
    {:else}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
    {/if}
  </button>

  <!-- Minimize -->
  <button class={btn} title="Minimize" aria-label="Minimize window" on:click={minimize}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14" /></svg>
  </button>

  <!-- Maximize / Restore -->
  <button class={btn} title={maximized ? "Restore" : "Maximize"} aria-label={maximized ? "Restore window" : "Maximize window"} on:click={toggleMaximize}>
    {#if maximized}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="8.5" y="3.5" width="12" height="12" rx="1.6" /><path d="M15.5 16v3A1.5 1.5 0 0 1 14 20.5H4.5A1.5 1.5 0 0 1 3 19V9.5A1.5 1.5 0 0 1 4.5 8h3.5" /></svg>
    {:else}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1.8" /></svg>
    {/if}
  </button>

  <!-- Close -->
  <button class="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-red-500/80 hover:text-white" title="Close" aria-label="Close window" on:click={close}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </button>
</div>
