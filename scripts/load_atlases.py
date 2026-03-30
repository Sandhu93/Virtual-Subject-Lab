#!/usr/bin/env python3
"""load_atlases.py — populate packages/atlas-assets/ with mesh and ROI data.

Running this script is required before the WebGL cortical viewer can show
anatomically correct vertex positions. It produces:

  packages/atlas-assets/fsaverage5/
      left_mesh.bin          raw float32 xyz positions  (10242 × 3 floats)
      right_mesh.bin         raw float32 xyz positions  (10242 × 3 floats)
      vertex_normals_left.bin  raw float32 normals (10242 × 3 floats)
      vertex_normals_right.bin
      faces_left.bin         raw uint32 triangle indices (triangles × 3 ints)
      faces_right.bin
      metadata.json

  packages/atlas-assets/lab_roi_pack_v1/
      roi_index.json         ROI metadata (ids, labels, groups, hemispheres)
      roi_membership.json    vertex index ranges for each ROI

  packages/atlas-assets/hcp_glasser_v1/
      roi_groups.json        Glasser group labels (stub — real parcels need license)

Strategy
--------
If `nilearn` and `nibabel` are installed the script downloads the real
fsaverage5 surface from the FreeSurfer average brain included in nilearn.
Otherwise it falls back to generating a level-5 icosphere approximation
(10242 vertices per hemisphere) which is geometrically correct but does NOT
preserve the anatomical vertex ordering of fsaverage5.

Install nilearn for real positions:
    pip install nilearn nibabel

Usage:
    python scripts/load_atlases.py [--force]
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ATLAS_DIR = REPO_ROOT / "packages" / "atlas-assets"
FORCE = "--force" in sys.argv


# ── helpers ───────────────────────────────────────────────────────────────────

def write_bin(path: Path, data: list[float] | list[int], fmt_char: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    packed = struct.pack(f"<{len(data)}{fmt_char}", *data)
    path.write_bytes(packed)
    print(f"  wrote {path.relative_to(REPO_ROOT)}  ({len(packed):,} bytes)")


def normalize(v: list[float]) -> list[float]:
    length = math.sqrt(sum(x * x for x in v))
    if length < 1e-10:
        return v
    return [x / length for x in v]


# ── icosphere fallback ────────────────────────────────────────────────────────

def _icosphere(subdivisions: int = 5):
    """Return (vertices, faces) for a unit icosphere.

    At subdivisions=5 this produces exactly 10242 vertices — matching the
    fsaverage5 vertex count per hemisphere.
    """
    phi = (1.0 + math.sqrt(5.0)) / 2.0
    raw = [
        [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
        [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
        [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
    ]
    vertices = [normalize(v) for v in raw]
    faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ]

    midpoint_cache: dict[tuple[int, int], int] = {}

    def midpoint(a: int, b: int) -> int:
        key = (min(a, b), max(a, b))
        if key in midpoint_cache:
            return midpoint_cache[key]
        mid = normalize([
            (vertices[a][0] + vertices[b][0]) / 2,
            (vertices[a][1] + vertices[b][1]) / 2,
            (vertices[a][2] + vertices[b][2]) / 2,
        ])
        vertices.append(mid)
        idx = len(vertices) - 1
        midpoint_cache[key] = idx
        return idx

    for _ in range(subdivisions):
        new_faces = []
        for a, b, c in faces:
            ab, bc, ca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
            new_faces += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        faces = new_faces

    return vertices, faces


def _compute_normals(vertices: list, faces: list) -> list[list[float]]:
    normals = [[0.0, 0.0, 0.0] for _ in vertices]
    for a, b, c in faces:
        va, vb, vc = vertices[a], vertices[b], vertices[c]
        ab = [vb[i] - va[i] for i in range(3)]
        ac = [vc[i] - va[i] for i in range(3)]
        cross = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        ]
        for idx in [a, b, c]:
            normals[idx] = [normals[idx][i] + cross[i] for i in range(3)]
    return [normalize(n) for n in normals]


# ── main ──────────────────────────────────────────────────────────────────────

def write_fsaverage5_icosphere():
    out = ATLAS_DIR / "fsaverage5"
    if (out / "metadata.json").exists() and not FORCE:
        print("  fsaverage5/ already present — skipping (use --force to overwrite)")
        return

    print("Generating level-5 icosphere approximation of fsaverage5 …")
    print("  NOTE: run 'pip install nilearn nibabel' and re-run this script")
    print("  to get the real fsaverage5 vertex positions.")
    verts, faces = _icosphere(5)
    normals = _compute_normals(verts, faces)

    flat_verts = [x for v in verts for x in v]
    flat_norms = [x for n in normals for x in n]
    flat_faces = [x for f in faces for x in f]

    # Left hemisphere: shift to x < 0
    left_verts = [v[0] - 1.6 if i % 3 == 0 else v[i % 3] for i, v in enumerate(
        [(x - 1.6, y, z) for x, y, z in verts]
    )]
    # Actually, flatten properly:
    left_flat = []
    for x, y, z in verts:
        left_flat += [x - 1.6, y, z]
    right_flat = []
    for x, y, z in verts:
        right_flat += [x + 1.6, y, z]

    write_bin(out / "left_mesh.bin", left_flat, "f")
    write_bin(out / "right_mesh.bin", right_flat, "f")
    write_bin(out / "vertex_normals_left.bin", flat_norms, "f")
    write_bin(out / "vertex_normals_right.bin", flat_norms, "f")
    write_bin(out / "faces_left.bin", flat_faces, "I")
    write_bin(out / "faces_right.bin", flat_faces, "I")

    meta = {
        "source": "icosphere_approximation",
        "n_vertices_per_hemisphere": len(verts),
        "n_faces_per_hemisphere": len(faces),
        "vertex_dtype": "float32",
        "face_dtype": "uint32",
        "note": (
            "Sphere approximation — vertex positions do NOT match fsaverage5 anatomy. "
            "Install nilearn + nibabel and re-run load_atlases.py for real positions."
        ),
    }
    (out / "metadata.json").write_text(json.dumps(meta, indent=2))
    print(f"  wrote {(out / 'metadata.json').relative_to(REPO_ROOT)}")


def write_fsaverage5_real():
    """Attempt to use nilearn to pull the real fsaverage5 surface."""
    try:
        import nibabel as nib
        from nilearn import datasets
    except ImportError:
        return False

    out = ATLAS_DIR / "fsaverage5"
    if (out / "metadata.json").exists() and not FORCE:
        return True

    print("Fetching real fsaverage5 surface via nilearn …")
    fs5 = datasets.fetch_surf_fsaverage("fsaverage5")
    for hemi, key_pial in [("left", "pial_left"), ("right", "pial_right")]:
        coords, triangles = nib.load(fs5[key_pial]).agg_data()
        # coords: (n_vertices, 3) float32, triangles: (n_faces, 3) int32
        # Normalise coordinates to unit sphere range for the viewer
        import numpy as np
        scale = np.max(np.abs(coords))
        coords_norm = (coords / scale).astype("float32")
        normals = np.zeros_like(coords_norm)
        for tri in triangles:
            a, b, c = tri
            ab = coords_norm[b] - coords_norm[a]
            ac = coords_norm[c] - coords_norm[a]
            n = np.cross(ab, ac)
            normals[a] += n; normals[b] += n; normals[c] += n
        lengths = np.linalg.norm(normals, axis=1, keepdims=True)
        normals /= np.where(lengths == 0, 1, lengths)

        write_bin(out / f"{hemi}_mesh.bin", coords_norm.flatten().tolist(), "f")
        write_bin(out / f"vertex_normals_{hemi}.bin", normals.flatten().tolist(), "f")
        write_bin(out / f"faces_{hemi}.bin", triangles.flatten().tolist(), "I")

    meta = {
        "source": "nilearn_fsaverage5",
        "n_vertices_per_hemisphere": int(coords.shape[0]),
        "n_faces_per_hemisphere": int(triangles.shape[0]),
        "vertex_dtype": "float32",
        "face_dtype": "uint32",
        "note": "Real fsaverage5 positions from FreeSurfer average brain via nilearn.",
    }
    (out / "metadata.json").write_text(json.dumps(meta, indent=2))
    print(f"  wrote {(out / 'metadata.json').relative_to(REPO_ROOT)}")
    return True


def write_lab_roi_pack():
    from virtual_subject.domain.constants import CURATED_ROIS, HEMISPHERE_VERTEX_COUNT

    out = ATLAS_DIR / "lab_roi_pack_v1"
    if (out / "roi_index.json").exists() and not FORCE:
        print("  lab_roi_pack_v1/ already present — skipping (use --force to overwrite)")
        return

    per_roi = HEMISPHERE_VERTEX_COUNT // len(CURATED_ROIS)
    remainder = HEMISPHERE_VERTEX_COUNT % len(CURATED_ROIS)

    roi_index = []
    membership = {}
    start_left = 0
    start_right = HEMISPHERE_VERTEX_COUNT

    for idx, spec in enumerate(CURATED_ROIS):
        width = per_roi + (1 if idx < remainder else 0)
        for hemi, start in [("left", start_left), ("right", start_right)]:
            roi_id = f"{spec.base_id}_{'L' if hemi == 'left' else 'R'}"
            roi_index.append({
                "roi_id": roi_id,
                "base_roi": spec.base_id,
                "label": f"{spec.label} ({'L' if hemi == 'left' else 'R'})",
                "group": spec.group,
                "hemisphere": hemi,
                "x": spec.left_position[0] if hemi == "left" else spec.right_position[0],
                "y": spec.left_position[1] if hemi == "left" else spec.right_position[1],
            })
            membership[roi_id] = {"start": start, "end": start + width}
        start_left += width
        start_right += width

    out.mkdir(parents=True, exist_ok=True)
    (out / "roi_index.json").write_text(json.dumps(roi_index, indent=2))
    (out / "roi_membership.json").write_text(json.dumps(membership, indent=2))
    print(f"  wrote {(out / 'roi_index.json').relative_to(REPO_ROOT)}")
    print(f"  wrote {(out / 'roi_membership.json').relative_to(REPO_ROOT)}")


def write_hcp_glasser_stub():
    out = ATLAS_DIR / "hcp_glasser_v1"
    if (out / "roi_groups.json").exists() and not FORCE:
        print("  hcp_glasser_v1/ already present — skipping (use --force to overwrite)")
        return

    groups = {
        "Early visual": ["V1", "V2", "V3", "V4"],
        "Dorsal visual": ["V3A", "V3B", "V6", "V6A", "V7", "IPS1"],
        "Ventral visual": ["V8", "PIT", "FFC", "VVC"],
        "Auditory": ["A1", "MBelt", "LBelt", "PBelt", "RI"],
        "Language": ["STSdp", "STSda", "STSvp", "STSva", "STGa", "TE1a", "TE1p", "44", "45"],
        "Multisensory / TPJ": ["TPOJ1", "TPOJ2", "TPOJ3", "STV", "PSL"],
        "Default mode": ["PCC", "RSC", "POS1", "POS2", "7m", "31pd", "31pv"],
        "Inferior frontal": ["IFJa", "IFJp", "IFSp", "IFSa", "p47r", "a47r"],
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "roi_groups.json").write_text(json.dumps(groups, indent=2))
    stub_note = {
        "note": (
            "Stub file with group → parcel name mappings. Full per-vertex parcel labels "
            "require the HCP multimodal parcellation (MMP1.0) which is available under "
            "a separate license from ConnectomeDB. Add parcel_labels_left.npy / "
            "parcel_labels_right.npy here once obtained."
        )
    }
    (out / "metadata.json").write_text(json.dumps(stub_note, indent=2))
    print(f"  wrote {(out / 'roi_groups.json').relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    sys.path.insert(0, str(REPO_ROOT / "src"))

    print("=== load_atlases.py ===")

    print("\n[1/3] fsaverage5 mesh …")
    if not write_fsaverage5_real():
        write_fsaverage5_icosphere()

    print("\n[2/3] Lab ROI pack …")
    write_lab_roi_pack()

    print("\n[3/3] HCP Glasser stub …")
    write_hcp_glasser_stub()

    print("\nDone.")
