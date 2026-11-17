/**
 * Round state for this Node process. The engine keeps the live round on globalThis.
 * Do not import this module from a Client Component.
 */
export { ensureClock, getRoundSnapshot as getRound, startRound, subscribeRound } from "@/lib/engine/round";
