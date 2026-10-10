import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import type { Beacon } from './world';

/**
 * Needs you attention alerts are disabled for every worker. Keep the feature's installation
 * contract without banners, flashes, beacons or alarms; waiting statuses stay in the Workers panel.
 */
export function installNeedsYou(_ctx: Ctx, _parts: Pick<Parts, 'views' | 'waiting'>) {
  return { beacons: new Map<string, Beacon>() };
}
