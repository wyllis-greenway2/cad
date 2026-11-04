# OCCT corpus results (replicad build, Node)

| case | verdict | volume | expected | rel. error | ms |
|---|---|---|---|---|---|
| fillet all 12 edges of 40x30x20 box, r=2 | ok | 23701.7 | 23701.7 | 0.0e+0 | 48 |
| fillet all edges of 20 cube, r=9.9 (almost a sphere) | ok | 4251.51 | 4251.51 | 1.1e-15 | 11 |
| fillet all edges of 20 cube, r=11 (impossible) | IMPOSSIBLE RESULT (volume 8980.2 > original 8000; solid valid=false) | 8980.21 | - | - | 319 |
| fillet top circular edge of cylinder R=10 h=20, f=3 | ok | 6169.96 | 6169.96 | 0.0e+0 | 9 |
| 40x30x20 box, 5 mm hole 0.2 mm from the wall, fillet 4 corners r=3 | ok | 23452.8 | 23452.8 | 1.6e-16 | 78 |
| fuse two boxes sharing a face (coincident faces) | ok | 8000.00 | 8000.00 | 2.3e-16 | 30 |
| cut a pocket flush with the top face | ok | 23500.0 | 23500.0 | 3.1e-16 | 7 |
| fuse cylinder tangent to a box side (line contact) | ok | 31570.8 | 31570.8 | 0.0e+0 | 19 |
| chamfer all 12 edges of 40x30x20 box, c=2 | ok | 23322.7 | - | - | 38 |
| shell 40x30x20 box to 2 mm, top face open | ok | 7152.00 | 7152.00 | 0.0e+0 | 50 |
| two perpendicular equal cylinders R=10 (Steinmetz) | ok | 5333.33 | 5333.33 | 1.2e-11 | 32 |
| fillet vertical edges r=5, then fillet the top loop r=2 (chained) | ok | 31443.2 | - | - | 15 |
| 0.01 mm hole through 40x30x20 box | ok | 24000.0 | 24000.0 | 0.0e+0 | 13 |
| 50-hole grid (5x10, d=3) in 100x60x10 plate | ok | 56465.7 | 56465.7 | 4.3e-15 | 1105 |
| sphere R=10 intersect half-space box (hemisphere) | ok | 2094.40 | 2094.40 | 1.1e-15 | 8 |
| rounded rect 40x30 r=6 extruded 15, fillet top edge r=3 | ok | 17294.1 | 17294.1 | 2.1e-16 | 22 |
| overlap by 1e-4 mm: fuse boxes | ok | 7999.96 | 7999.96 | 0.0e+0 | 15 |
| gap of 1e-4 mm: fuse boxes (two bodies) | ok | 8000.00 | 8000.00 | 2.3e-16 | 3 |
| hole tangent to the outer wall (zero-thickness wall) | ok | 22429.2 | 22429.2 | 1.6e-16 | 10 |

Tally: ok: 18, IMPOSSIBLE RESULT (volume 8980.2 > original 8000; solid valid=false): 1
