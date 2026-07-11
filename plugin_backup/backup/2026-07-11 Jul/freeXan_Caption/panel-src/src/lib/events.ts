/**
 * freeXan Caption — CSXS Event ID Constants
 *
 * Central registry of all event IDs used for inter-extension
 * and panel↔ExtendScript communication.
 */

export const CSXS_EVENTS = {
  /** Fired by ExtendScript after MOGRT params are modified */
  PARAMS_UPDATED: 'freexan.caption.paramsUpdated',

  /** Panel → ExtendScript: execute a named action */
  EXECUTE_ACTION: 'com.freexan.caption.executeAction',

  /** MISTER BloomX → freeXan Caption: selected MOGRT ready */
  BLOOMX_REPLACE_SELECTED: 'freexan-caption:replace_selected',

  /** freeXan Caption → MISTER BloomX: request current selection */
  BLOOMX_REQUEST_SELECTED: 'bloomx:request_selected_mogrt',
} as const;

export type CsxsEventId = typeof CSXS_EVENTS[keyof typeof CSXS_EVENTS];
