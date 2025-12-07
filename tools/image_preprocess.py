#!/usr/bin/env python3
"""
NEURON Visual Fidelity - Image Preprocessing Utilities
======================================================

Provides deterministic image normalization for reference and generated screenshots.
Used by the visual-check pipeline to ensure consistent comparison.

Functions:
  - load_and_normalize(path, width=1200): Load, convert to sRGB, resize, auto-crop
  - to_grayscale(img): Convert to grayscale for edge/threshold detection
  - auto_crop_content(img): Detect and crop to main content area
  - save_normalized(img, output_path): Save normalized image

Usage:
  python image_preprocess.py --input <image.png> --output <normalized.png> [--width 1200]

Dependencies:
  pip install pillow opencv-python numpy
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Tuple, Optional, Union

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageOps
    HAS_DEPS = True
except ImportError as e:
    HAS_DEPS = False
    MISSING_DEP = str(e)


def check_dependencies():
    """Check if required dependencies are installed."""
    if not HAS_DEPS:
        print(json.dumps({
            "success": False,
            "error": f"Missing dependency: {MISSING_DEP}",
            "install": "pip install pillow opencv-python numpy"
        }))
        sys.exit(1)


def to_grayscale(img: Union[Image.Image, np.ndarray]) -> np.ndarray:
    """
    Convert image to grayscale for edge/threshold detection.
    
    Args:
        img: PIL Image or numpy array (BGR or RGB)
    
    Returns:
        Grayscale numpy array
    """
    if isinstance(img, Image.Image):
        img_array = np.array(img)
    else:
        img_array = img
    
    if len(img_array.shape) == 2:
        return img_array
    
    if img_array.shape[2] == 4:
        # RGBA -> RGB
        img_array = img_array[:, :, :3]
    
    # Convert RGB to grayscale
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    return gray


def detect_content_bounds(img: np.ndarray, threshold: int = 10, margin: int = 5) -> Tuple[int, int, int, int]:
    """
    Detect the bounding box of main content using edge detection and thresholding.
    
    Args:
        img: Grayscale numpy array
        threshold: Minimum edge intensity to consider as content
        margin: Pixels to add around detected bounds
    
    Returns:
        Tuple of (x, y, width, height) for content bounding box
    """
    h, w = img.shape[:2]
    
    # Apply edge detection
    edges = cv2.Canny(img, 50, 150)
    
    # Also use threshold for high-contrast areas
    _, thresh = cv2.threshold(img, 250, 255, cv2.THRESH_BINARY_INV)
    
    # Combine edges and threshold
    combined = cv2.bitwise_or(edges, thresh)
    
    # Dilate to connect nearby elements
    kernel = np.ones((5, 5), np.uint8)
    dilated = cv2.dilate(combined, kernel, iterations=2)
    
    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return (0, 0, w, h)
    
    # Find bounding box of all contours
    all_points = np.vstack(contours)
    x, y, bw, bh = cv2.boundingRect(all_points)
    
    # Add margin and clamp to image bounds
    x = max(0, x - margin)
    y = max(0, y - margin)
    bw = min(w - x, bw + 2 * margin)
    bh = min(h - y, bh + 2 * margin)
    
    # Ensure minimum size (at least 50% of original)
    if bw < w * 0.5:
        x = 0
        bw = w
    if bh < h * 0.5:
        y = 0
        bh = h
    
    return (x, y, bw, bh)


def auto_crop_content(img: Image.Image, margin_percent: float = 0.02) -> Image.Image:
    """
    Auto-crop image to main content area using edge detection.
    
    Args:
        img: PIL Image
        margin_percent: Margin to add around content (as percent of image size)
    
    Returns:
        Cropped PIL Image
    """
    gray = to_grayscale(img)
    x, y, w, h = detect_content_bounds(gray, margin=int(min(gray.shape) * margin_percent))
    
    # Crop the original image
    return img.crop((x, y, x + w, y + h))


def load_and_normalize(
    path: str,
    width: int = 1200,
    auto_crop: bool = True,
    convert_srgb: bool = True
) -> Image.Image:
    """
    Load image, convert to sRGB, resize to specified width, and optionally auto-crop.
    
    This function provides deterministic preprocessing for both reference
    and generated screenshots to ensure consistent comparison.
    
    Args:
        path: Path to input image
        width: Target width in pixels (height scales proportionally)
        auto_crop: Whether to auto-crop to main content
        convert_srgb: Whether to convert to sRGB color space
    
    Returns:
        Normalized PIL Image
    """
    # Load image
    img = Image.open(path)
    
    # Convert to sRGB if needed
    if convert_srgb:
        if img.mode == 'RGBA':
            # Create white background for transparency
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
    
    # Auto-crop to content if enabled
    if auto_crop:
        img = auto_crop_content(img)
    
    # Resize to target width while maintaining aspect ratio
    if img.width != width:
        ratio = width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((width, new_height), Image.Resampling.LANCZOS)
    
    return img


def save_normalized(img: Image.Image, output_path: str, quality: int = 95) -> str:
    """
    Save normalized image to file.
    
    Args:
        img: PIL Image to save
        output_path: Path for output file
        quality: JPEG quality (if saving as JPEG)
    
    Returns:
        Absolute path to saved file
    """
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    
    # Determine format from extension
    ext = output.suffix.lower()
    if ext in ['.jpg', '.jpeg']:
        img.save(str(output), 'JPEG', quality=quality)
    else:
        img.save(str(output), 'PNG')
    
    return str(output.absolute())


def compute_image_hash(img: Image.Image) -> str:
    """
    Compute perceptual hash of image for quick comparison.
    
    Args:
        img: PIL Image
    
    Returns:
        Hex string of perceptual hash
    """
    # Resize to 8x8 and convert to grayscale
    small = img.resize((8, 8), Image.Resampling.LANCZOS)
    gray = small.convert('L')
    
    # Get pixels and compute average
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    
    # Create hash from bits
    bits = ''.join('1' if p > avg else '0' for p in pixels)
    return hex(int(bits, 2))[2:].zfill(16)


def get_image_stats(img: Image.Image) -> dict:
    """
    Get statistical information about an image.
    
    Args:
        img: PIL Image
    
    Returns:
        Dictionary with image statistics
    """
    arr = np.array(img)
    
    stats = {
        "width": img.width,
        "height": img.height,
        "aspect_ratio": round(img.width / img.height, 3),
        "mode": img.mode,
        "mean_rgb": [int(arr[:, :, i].mean()) for i in range(min(3, arr.shape[2] if len(arr.shape) > 2 else 1))],
        "std_rgb": [round(float(arr[:, :, i].std()), 2) for i in range(min(3, arr.shape[2] if len(arr.shape) > 2 else 1))],
    }
    
    if img.mode == 'RGB' or img.mode == 'RGBA':
        # Compute dominant color
        pixels = arr.reshape(-1, arr.shape[2])[:, :3]
        avg_color = pixels.mean(axis=0).astype(int)
        stats["dominant_color"] = f"#{avg_color[0]:02x}{avg_color[1]:02x}{avg_color[2]:02x}"
    
    return stats


def main():
    """CLI entry point for image preprocessing."""
    check_dependencies()
    
    parser = argparse.ArgumentParser(
        description='NEURON Image Preprocessing - Normalize screenshots for visual comparison'
    )
    parser.add_argument('--input', '-i', required=True, help='Input image path')
    parser.add_argument('--output', '-o', help='Output path (default: <input>_normalized.png)')
    parser.add_argument('--width', '-w', type=int, default=1200, help='Target width (default: 1200)')
    parser.add_argument('--no-crop', action='store_true', help='Disable auto-crop')
    parser.add_argument('--stats', action='store_true', help='Output image statistics as JSON')
    parser.add_argument('--json', action='store_true', help='Output result as JSON')
    
    args = parser.parse_args()
    
    input_path = Path(args.input)
    if not input_path.exists():
        result = {"success": False, "error": f"Input file not found: {input_path}"}
        if args.json:
            print(json.dumps(result))
        else:
            print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)
    
    # Determine output path
    if args.output:
        output_path = args.output
    else:
        output_path = str(input_path.parent / f"{input_path.stem}_normalized.png")
    
    try:
        # Load and normalize
        img = load_and_normalize(
            str(input_path),
            width=args.width,
            auto_crop=not args.no_crop
        )
        
        # Save normalized image
        saved_path = save_normalized(img, output_path)
        
        result = {
            "success": True,
            "input": str(input_path.absolute()),
            "output": saved_path,
            "width": img.width,
            "height": img.height,
            "hash": compute_image_hash(img)
        }
        
        if args.stats:
            result["stats"] = get_image_stats(img)
        
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"✓ Normalized image saved to: {saved_path}")
            print(f"  Dimensions: {img.width}x{img.height}")
            if args.stats:
                stats = result["stats"]
                print(f"  Dominant color: {stats.get('dominant_color', 'N/A')}")
        
    except Exception as e:
        result = {"success": False, "error": str(e)}
        if args.json:
            print(json.dumps(result))
        else:
            print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
