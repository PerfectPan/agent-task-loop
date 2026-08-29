import os from 'node:os';
import type { RoomLabTextPresenterPort } from '../application/ports';

/** Keeps machine-specific paths out of the local Room read model. */
export class LocalTextPresenter implements RoomLabTextPresenterPort {
  error(error: unknown): string {
    return this.text(error instanceof Error ? error.message : 'Unknown Room lab error');
  }

  text(value: string): string {
    return value.replaceAll(os.homedir(), '~');
  }
}
