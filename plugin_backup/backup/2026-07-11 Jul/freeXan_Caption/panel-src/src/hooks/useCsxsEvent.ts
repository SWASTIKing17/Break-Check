/**
 * freeXan Caption — useCsxsEvent Hook
 *
 * Subscribe to a CSXS event with automatic cleanup on unmount.
 */
import { useEffect } from 'react';
import { csi } from '@/lib/csi';

/**
 * Subscribe to a CSXS event. The handler is automatically
 * unsubscribed when the component unmounts.
 *
 * @param eventId - The CSXS event type string
 * @param handler - Callback receiving the event data string
 */
export function useCsxsEvent(
  eventId: string,
  handler: (data: string) => void
): void {
  useEffect(() => {
    const listener = (event: CSEvent) => {
      handler(event.data);
    };

    csi.on(eventId, listener);
    return () => csi.off(eventId, listener);
  }, [eventId, handler]);
}
