/**
 * All sittable seats in the current scene (filled by SceneCanvas from the
 * manifest). Lets the X shortcut snap onto the nearest chair instead of
 * seating you in mid-air between two seats.
 */
export interface SeatEntry {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const seatRegistry: { seats: SeatEntry[] } = { seats: [] };
