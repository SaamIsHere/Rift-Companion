<script lang="ts">
  export let type: "dragon" | "baron" | "tower";
  export let className: string = "h-4 w-4 shrink-0 inline-block";
</script>

<span class={className} aria-label={type}>
  {#if type === "dragon"}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-full w-full">
      <path d="M8 0L6 4 3 1v4H0l3 3v3l4 5h2l4-5V8l3-3h-3V1l-3 3-2-4zm2 9l2-1-1 2-2 1 1-2zm-5 1L4 8l2 1 1 2-2-1z" />
    </svg>
  {:else if type === "baron"}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-full w-full">
      <path d="M9 10c0-.552.447-1 1-1 .553 0 1 .448 1 1s-.447 1-1 1c-.553 0-1-.448-1-1zM7 8c0-.553.448-1 1-1 .553 0 1 .447 1 1 0 .552-.447 1-1 1-.552 0-1-.448-1-1zm0 4c0-.552.448-1 1-1 .553 0 1 .448 1 1 0 .553-.447 1-1 1-.552 0-1-.447-1-1zm-2-2c0-.552.448-1 1-1s1 .448 1 1-.448 1-1 1-1-.448-1-1zm5-10l2 4-1 1H9L8 4 7 5H5L4 4l2-4-6 4 2 4 3 8 1-1h4l1 1 3-8 2-4-6-4z" />
    </svg>
  {:else if type === "tower"}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="h-full w-full">
      <path d="M12 8l-2 8H6L4 8l4 4 4-4zM8 0l4 4-1.003 1.002L11 5h3l-6 6-6-6h2.999L4 4l4-4zm0 2.4L6.4 4 8 5.6 9.6 4 8 2.4z" />
    </svg>
  {/if}
</span>
