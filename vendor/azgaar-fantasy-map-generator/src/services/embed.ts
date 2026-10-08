/* MIR embeds the editor in two ways: as its own web page under /fmg/, and inside the single-file mir.html,
   where the editor runs as an about:srcdoc frame. A srcdoc frame has no hostname, path or query of its own,
   so the shell passes its load parameters through `globalThis.MIR_FMG_HOST` instead of the address bar.
   The web build never sets that global, so it keeps reading the URL as before. */

type EmbedHost = { query: string };

const embedHost = (): EmbedHost | undefined => (globalThis as { MIR_FMG_HOST?: EmbedHost }).MIR_FMG_HOST;

/** True when the page was handed to the editor by MIR rather than loaded from a server */
export const isEmbedded = (): boolean => embedHost() !== undefined;

/** The URL whose query string carries the load parameters: the address bar, or the shell's query when embedded */
export const pageURL = (): URL => {
  const host = embedHost();
  return host ? new URL(host.query, "https://embedded.invalid/") : new URL(window.location.href);
};
