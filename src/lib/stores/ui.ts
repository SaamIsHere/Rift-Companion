import { writable } from "svelte/store";

/**
 * Window "collapsed" (window-shade) state. When true the <main> body is hidden
 * and the OS window is rolled up to just the title bar. Driven by WindowControls,
 * consumed by App.svelte.
 */
export const collapsed = writable<boolean>(false);
