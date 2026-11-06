// The room that is reflected in the body (`in_157`): three.js's soft studio, with a few black panels ("dark sources", like the flags a photographer puts beside a shiny part) so the shine has
// dark as well as light in it, and moves across a face as the view turns.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function studio(): THREE.Scene {
  const room = new RoomEnvironment() as unknown as THREE.Scene;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  // [x, y, z, width, height, turn about the vertical axis]: tall panels standing round the middle, facing it
  for (const [x, y, z, w, h, turn] of [[-3.4, 2.2, 0.6, 3.4, 3.2, Math.PI / 2], [3.1, 2.4, -1.4, 2.6, 3.4, -Math.PI / 2], [0.6, 2.2, -3.6, 3.0, 2.6, 0]] as const) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), black);
    panel.position.set(x, y, z);
    panel.rotation.y = turn;
    room.add(panel);
  }
  return room;
}
