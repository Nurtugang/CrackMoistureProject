# defect_detection_pipeline.py
"""Building Defect Detection - Cracks & Moisture
------------------------------------------------
Production-ready helper that uses Google Gemini 2.5 multimodal models via the
`google-genai` SDK on Vertex AI to locate and classify masonry cracks and surface
moisture in inspection photographs.

Features
~~~~~~~~
 Works with Gemini 2.5 Pro/Flash (vision-capable) models.
 Single request returns both crack (damage) and moisture detections
  (bounding boxes + structured metadata).
 Fully-typed pydantic schema describing the JSON response.
 Built-in retries (exponential back-off) using tenacity.
 Rich logging (Python’s logging std-lib).
 Minimal external deps: ``google-genai>=0.7``, ``pydantic>=2``,
  ``tenacity>=8``.

Environment
~~~~~~~~~~~
Export all of the following before running so that the SDK automatically
selects Vertex AI and your project/region::

    export GOOGLE_GENAI_USE_VERTEXAI=true
    export GOOGLE_CLOUD_PROJECT="my-gcp-project"
    export GOOGLE_CLOUD_LOCATION="us-central1"   # or your region

(If you must call the public Gemini Developer API instead, set
``GOOGLE_API_KEY`` and remove the Vertex AI vars.)

Usage
~~~~~
```bash
python defect_detection_pipeline.py /path/to/img1.jpg /path/to/img2.png \
  --model gemini-2.5-pro --out results.json
```

The script prints JSON to stdout by default and optionally writes it to the
path supplied by ``--out``.

"""
from __future__ import annotations

import os
import argparse
import logging
import mimetypes
from pathlib import Path
from typing import List, Literal

from pydantic import BaseModel, Field, ValidationError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from google import genai
from google.genai.types import (
    GenerateContentConfig,
    Part,
)

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=LOG_LEVEL,
)
logger = logging.getLogger("defect-detector")


# Pydantic response schema
class DamageFinding(BaseModel):
    bbox: List[int]
    category: int = Field(ge=0, le=5)
    classification: Literal["Aesthetic", "Serviceability", "Stability"]


class MoistureFinding(BaseModel):
    bbox: List[int]
    moisture_type: Literal["RD", "PD", "C"]


class DefectDetectionResult(BaseModel):
    damage: List[DamageFinding] = []
    moisture: List[MoistureFinding] = []


_DAM_CAT_PROMPT = """
Damage category definitions (width is crack opening):
0 - Hairline (< 0.1 mm) - Aesthetic
1 - Fine (≤ 1 mm) - Aesthetic
2 - >1-≤5 mm - Aesthetic
3 - >5-≤15 mm - Serviceability
4 - >15-≤25 mm - Serviceability
5 - >25 mm - Stability
"""

_MOISTURE_PROMPT = """
Moisture type definitions:
- Rising Damp (RD) - moisture rising from ground or bridging of DPC.
- Penetrating Damp (PD) - moisture ingress through external walls/roof.
- Condensation (C) - surface moisture from vapour condensing inside.
"""

_SYSTEM_INSTRUCTION = (
    "You are a building-fabric defect-detection expert. Analyse every image and "
    "output only JSON conforming to this schema: {damage: list, moisture: list}. "
    "Detect all masonry cracks and damp/moisture patches – they may appear "
    "independently or together.\n\n"
    "Rules:\n"
    '- If the image contains no cracks, return "damage": [].\n'
    '- If the image contains no moisture, return "moisture": [].\n'
    "- Provide for each crack: bbox, category (0-5), classification exactly one of ['Aesthetic','Serviceability','Stability'] (case-sensitive)."
    "- Provide for each moisture patch: bbox, moisture_type exactly one of ['RD','PD','C'] (case-sensitive).\n"
    "- List at most 25 objects total.\n\n"
    "Reference information:\n" + _DAM_CAT_PROMPT + "\n\n" + _MOISTURE_PROMPT
)


def _image_part_from_path(path: Path) -> Part:
    """Convert local image path to a GenAI Part."""
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError(f"Unsupported file type: {path} (detected {mime_type})")
    with path.open("rb") as f:
        return Part.from_bytes(data=f.read(), mime_type=mime_type)


def _build_client() -> genai.Client:
    """Create a GenAI client, auto-detecting Developer vs Vertex AI."""
    logger.debug("Initialising Google GenAI client …")

    # Developer API
    api_key = "AIzaSyAOH4H0YE9PFtR7aJK3MBb3FNlJgIL-kjU"
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY must be set for Gemini Developer API (free tier)."
        )
    logger.debug("Using Developer API backend (defaults to v1beta endpoint).")
    return genai.Client(api_key=api_key)


# Core detection call
@retry(
    wait=wait_exponential(multiplier=1, min=2, max=20),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type(Exception),
    reraise=True,
)
def _detect_once(
    client: genai.Client, parts: List[Part], model: str
) -> DefectDetectionResult:
    """Single API invocation (wrapped by tenacity for retries)."""
    logger.info("Calling Gemini model %s with %d image(s)…", model, len(parts))

    config = GenerateContentConfig(
        system_instruction=_SYSTEM_INSTRUCTION,
        response_schema=DefectDetectionResult,
        response_mime_type="application/json",
        temperature=0.0,
    )

    response = client.models.generate_content(
        model=model,
        contents=parts,
        config=config,
    )

    logger.debug("Raw model response:\n%s", response.text)
    try:
        parsed: DefectDetectionResult = response.parsed
        return parsed
    except (AttributeError, ValidationError) as exc:
        logger.exception("Failed to parse structured response - raising for retry.")
        raise exc


def detect_defects(
    image_paths: List[str | Path],
    *,
    model: str = "gemini-2.5-pro",
) -> DefectDetectionResult:
    """High-level helper - returns :class:`DefectDetectionResult`.

    Parameters
    ----------
    image_paths : list[str | Path]
        One or more local image paths.
    model : str, default "gemini-2.5-pro"
        Gemini vision-capable model ID. Examples: ``gemini-2.5-pro``,
        ``gemini-2.5-flash``.
    """
    paths = [Path(p) for p in image_paths]
    for p in paths:
        if not p.exists():
            raise FileNotFoundError(p)

    client = _build_client()
    parts = [_image_part_from_path(p) for p in paths]

    return _detect_once(client, parts, model=model)


# CLI
def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Detect masonry cracks & moisture defects using Gemini 2.5 models"
    )
    parser.add_argument("images", nargs="+", help="Path(s) to image files")
    parser.add_argument(
        "--model",
        default="gemini-2.5-pro",
        help="Gemini model ID (default: gemini-2.5-pro)",
    )
    parser.add_argument("--out", type=Path, help="Optional output JSON file path")

    args = parser.parse_args()

    try:
        result = detect_defects(args.images, model=args.model)
    except Exception as exc:
        logger.error("Detection failed: %s", exc)
        raise SystemExit(1) from exc

    try:
        json_payload = result.model_dump_json(indent=2, exclude_none=True)
    except AttributeError:
        json_payload = result.json(indent=2, exclude_none=True)
    print(json_payload)

    if args.out:
        args.out.write_text(json_payload + "\n", encoding="utf-8")
        logger.info("Results written to %s", args.out)


if __name__ == "__main__":
    _cli()
