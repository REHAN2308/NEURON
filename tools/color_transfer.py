#!/usr/bin/env python3
"""
NEURON Visual Fidelity - Color Transfer & Palette Utilities
============================================================

Implements Reinhard color transfer to match generated preview tone to reference,
and k-means palette extraction for color analysis.

Functions:
  - reinhard_color_transfer(source, target): Apply Reinhard color transfer
  - extract_palette(image, k=6): Extract dominant colors using k-means
  - compute_color_distance(color1, color2): Compute perceptual color distance
  - suggest_color_adjustments(ref_palette, gen_palette): Suggest adjustments

Usage:
  python color_transfer.py --source <generated.png> --target <reference.png> --output <matched.png>
  python color_transfer.py --palette <image.png> --k 6

Dependencies:
  pip install pillow opencv-python numpy scikit-learn scikit-image
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Tuple, Dict, Optional
from collections import Counter

try:
    import cv2
    import numpy as np
    from PIL import Image
    from sklearn.cluster import KMeans
    HAS_DEPS = True
except ImportError as e:
    HAS_DEPS = False
    MISSING_DEP = str(e)

# Optional: scikit-image for SSIM
try:
    from skimage.metrics import structural_similarity as ssim
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False


def check_dependencies():
    """Check if required dependencies are installed."""
    if not HAS_DEPS:
        print(json.dumps({
            "success": False,
            "error": f"Missing dependency: {MISSING_DEP}",
            "install": "pip install pillow opencv-python numpy scikit-learn"
        }))
        sys.exit(1)


def rgb_to_lab(img: np.ndarray) -> np.ndarray:
    """Convert RGB image to LAB color space."""
    # Ensure image is in BGR for OpenCV
    if img.shape[2] == 4:
        img = img[:, :, :3]
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    return lab


def lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    """Convert LAB image to RGB color space."""
    lab_uint8 = np.clip(lab, 0, 255).astype(np.uint8)
    bgr = cv2.cvtColor(lab_uint8, cv2.COLOR_LAB2BGR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return rgb


def reinhard_color_transfer(
    source_path: str,
    target_path: str,
    output_path: Optional[str] = None,
    preserve_luminance: bool = False
) -> Dict:
    """
    Apply Reinhard color transfer to match source image colors to target.
    
    The Reinhard algorithm transfers color statistics (mean, std) in LAB space
    from the target image to the source image.
    
    Args:
        source_path: Path to source image (to be modified)
        target_path: Path to target image (reference for color matching)
        output_path: Path for output image (default: source_matched.png)
        preserve_luminance: If True, only transfer chrominance (a, b channels)
    
    Returns:
        Dictionary with result info including output path
    """
    # Load images
    source_img = np.array(Image.open(source_path).convert('RGB'))
    target_img = np.array(Image.open(target_path).convert('RGB'))
    
    # Convert to LAB
    source_lab = rgb_to_lab(source_img)
    target_lab = rgb_to_lab(target_img)
    
    # Compute channel statistics
    source_mean = np.mean(source_lab, axis=(0, 1))
    source_std = np.std(source_lab, axis=(0, 1))
    target_mean = np.mean(target_lab, axis=(0, 1))
    target_std = np.std(target_lab, axis=(0, 1))
    
    # Avoid division by zero
    source_std = np.where(source_std < 1e-6, 1.0, source_std)
    
    # Apply Reinhard transfer
    result_lab = source_lab.copy()
    
    if preserve_luminance:
        # Only transfer a and b channels (chrominance)
        for i in [1, 2]:
            result_lab[:, :, i] = ((source_lab[:, :, i] - source_mean[i]) * 
                                   (target_std[i] / source_std[i]) + target_mean[i])
    else:
        # Transfer all channels
        for i in range(3):
            result_lab[:, :, i] = ((source_lab[:, :, i] - source_mean[i]) * 
                                   (target_std[i] / source_std[i]) + target_mean[i])
    
    # Convert back to RGB
    result_rgb = lab_to_rgb(result_lab)
    
    # Save result
    if output_path is None:
        source_p = Path(source_path)
        output_path = str(source_p.parent / f"{source_p.stem}_matched.png")
    
    Image.fromarray(result_rgb).save(output_path)
    
    # Compute color shift statistics
    color_shift = {
        "L_shift": float(target_mean[0] - source_mean[0]),
        "a_shift": float(target_mean[1] - source_mean[1]),
        "b_shift": float(target_mean[2] - source_mean[2]),
        "brightness_change": "darker" if target_mean[0] < source_mean[0] else "lighter",
        "warmth_change": "warmer" if target_mean[2] > source_mean[2] else "cooler",
    }
    
    return {
        "success": True,
        "output": output_path,
        "source_mean_lab": source_mean.tolist(),
        "target_mean_lab": target_mean.tolist(),
        "color_shift": color_shift
    }


def extract_palette(
    image_path: str,
    k: int = 6,
    exclude_near_white: bool = True,
    exclude_near_black: bool = True
) -> Dict:
    """
    Extract dominant colors from image using k-means clustering.
    
    Args:
        image_path: Path to input image
        k: Number of colors to extract
        exclude_near_white: Exclude colors very close to white
        exclude_near_black: Exclude colors very close to black
    
    Returns:
        Dictionary with palette info including hex colors and roles
    """
    img = np.array(Image.open(image_path).convert('RGB'))
    
    # Reshape to pixel array
    pixels = img.reshape(-1, 3).astype(np.float32)
    
    # Filter out near-white and near-black if requested
    if exclude_near_white:
        mask = np.all(pixels < 250, axis=1)
        pixels = pixels[mask]
    if exclude_near_black:
        mask = np.all(pixels > 5, axis=1)
        pixels = pixels[mask]
    
    if len(pixels) < k:
        # Not enough pixels, return simple average
        avg = pixels.mean(axis=0).astype(int)
        return {
            "success": True,
            "colors": [f"#{avg[0]:02x}{avg[1]:02x}{avg[2]:02x}"],
            "primary_background": f"#{avg[0]:02x}{avg[1]:02x}{avg[2]:02x}",
            "accent": None
        }
    
    # Apply k-means
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    kmeans.fit(pixels)
    
    # Get cluster centers and counts
    centers = kmeans.cluster_centers_.astype(int)
    labels = kmeans.labels_
    counts = Counter(labels)
    
    # Sort by frequency
    sorted_indices = sorted(counts.keys(), key=lambda x: counts[x], reverse=True)
    
    colors = []
    for idx in sorted_indices:
        rgb = centers[idx]
        hex_color = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
        colors.append({
            "hex": hex_color,
            "rgb": rgb.tolist(),
            "frequency": counts[idx] / len(labels)
        })
    
    # Identify roles
    # Primary background: most frequent color
    primary_bg = colors[0]["hex"]
    
    # Accent: most saturated non-background color
    accent = None
    max_saturation = 0
    for c in colors[1:]:
        r, g, b = c["rgb"]
        # Simple saturation approximation
        saturation = max(r, g, b) - min(r, g, b)
        if saturation > max_saturation:
            max_saturation = saturation
            accent = c["hex"]
    
    return {
        "success": True,
        "colors": [c["hex"] for c in colors],
        "palette_details": colors,
        "primary_background": primary_bg,
        "accent": accent or colors[1]["hex"] if len(colors) > 1 else primary_bg
    }


def compute_color_distance(color1: str, color2: str) -> float:
    """
    Compute perceptual color distance using CIEDE2000 approximation.
    
    Args:
        color1: Hex color string (e.g., "#ff0000")
        color2: Hex color string
    
    Returns:
        Distance value (0 = identical, higher = more different)
    """
    def hex_to_rgb(h):
        h = h.lstrip('#')
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    
    rgb1 = np.array(hex_to_rgb(color1)).reshape(1, 1, 3).astype(np.uint8)
    rgb2 = np.array(hex_to_rgb(color2)).reshape(1, 1, 3).astype(np.uint8)
    
    lab1 = rgb_to_lab(rgb1)[0, 0]
    lab2 = rgb_to_lab(rgb2)[0, 0]
    
    # Simple Euclidean distance in LAB (approximation of perceptual distance)
    return float(np.sqrt(np.sum((lab1 - lab2) ** 2)))


def compute_ssim(img1_path: str, img2_path: str) -> Dict:
    """
    Compute Structural Similarity Index (SSIM) between two images.
    
    Args:
        img1_path: Path to first image
        img2_path: Path to second image
    
    Returns:
        Dictionary with SSIM value and analysis
    """
    if not HAS_SKIMAGE:
        return {
            "success": False,
            "error": "scikit-image not installed. Run: pip install scikit-image"
        }
    
    # Load and convert to grayscale for SSIM
    img1 = np.array(Image.open(img1_path).convert('RGB'))
    img2 = np.array(Image.open(img2_path).convert('RGB'))
    
    # Resize to same dimensions if needed
    if img1.shape != img2.shape:
        h = min(img1.shape[0], img2.shape[0])
        w = min(img1.shape[1], img2.shape[1])
        img1 = cv2.resize(img1, (w, h))
        img2 = cv2.resize(img2, (w, h))
    
    # Convert to grayscale
    gray1 = cv2.cvtColor(img1, cv2.COLOR_RGB2GRAY)
    gray2 = cv2.cvtColor(img2, cv2.COLOR_RGB2GRAY)
    
    # Compute SSIM
    score, diff_map = ssim(gray1, gray2, full=True)
    
    # Analyze difference regions
    diff_map_uint8 = (diff_map * 255).astype(np.uint8)
    _, thresh = cv2.threshold(diff_map_uint8, 200, 255, cv2.THRESH_BINARY_INV)
    
    # Find contours of difference regions
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    diff_regions = []
    for cnt in contours[:5]:  # Top 5 difference regions
        x, y, w, h = cv2.boundingRect(cnt)
        area = cv2.contourArea(cnt)
        if area > 100:  # Filter tiny differences
            diff_regions.append({
                "bbox": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
                "area": int(area)
            })
    
    return {
        "success": True,
        "ssim": round(float(score), 4),
        "passed": score >= 0.94,
        "difference_regions": diff_regions,
        "analysis": "excellent" if score >= 0.95 else "good" if score >= 0.90 else "fair" if score >= 0.80 else "poor"
    }


def suggest_color_adjustments(ref_palette: Dict, gen_palette: Dict) -> Dict:
    """
    Suggest CSS filter adjustments to match generated palette to reference.
    
    Args:
        ref_palette: Palette extracted from reference image
        gen_palette: Palette extracted from generated image
    
    Returns:
        Dictionary with suggested filter values
    """
    ref_colors = ref_palette.get("palette_details", [])
    gen_colors = gen_palette.get("palette_details", [])
    
    if not ref_colors or not gen_colors:
        return {"success": False, "error": "No palette data available"}
    
    # Compare primary backgrounds in LAB
    ref_bg = ref_colors[0]["rgb"]
    gen_bg = gen_colors[0]["rgb"]
    
    ref_lab = rgb_to_lab(np.array([[ref_bg]], dtype=np.uint8))[0, 0]
    gen_lab = rgb_to_lab(np.array([[gen_bg]], dtype=np.uint8))[0, 0]
    
    # Compute adjustments
    l_diff = ref_lab[0] - gen_lab[0]
    
    # Brightness adjustment (L channel)
    if abs(l_diff) > 10:
        brightness = round(1.0 + (l_diff / 100), 2)
        brightness = max(0.5, min(1.5, brightness))
    else:
        brightness = 1.0
    
    # Saturation adjustment (based on color variance)
    ref_saturation = np.std([c["rgb"] for c in ref_colors])
    gen_saturation = np.std([c["rgb"] for c in gen_colors])
    
    if gen_saturation > 0:
        saturate = round(ref_saturation / gen_saturation, 2)
        saturate = max(0.5, min(1.5, saturate))
    else:
        saturate = 1.0
    
    # Contrast (based on L channel std)
    contrast = 1.0  # Default, could be refined
    
    return {
        "success": True,
        "suggested_filters": {
            "brightness": brightness,
            "contrast": contrast,
            "saturate": saturate
        },
        "css_filter": f"filter: brightness({brightness}) contrast({contrast}) saturate({saturate});",
        "tone_suggestion": "darker" if l_diff < -10 else "lighter" if l_diff > 10 else "neutral"
    }


def main():
    """CLI entry point for color transfer utilities."""
    check_dependencies()
    
    parser = argparse.ArgumentParser(
        description='NEURON Color Transfer & Palette Utilities'
    )
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Transfer command
    transfer_parser = subparsers.add_parser('transfer', help='Apply Reinhard color transfer')
    transfer_parser.add_argument('--source', '-s', required=True, help='Source image (to be modified)')
    transfer_parser.add_argument('--target', '-t', required=True, help='Target image (reference)')
    transfer_parser.add_argument('--output', '-o', help='Output path')
    transfer_parser.add_argument('--preserve-luminance', action='store_true', 
                                help='Only transfer chrominance')
    
    # Palette command
    palette_parser = subparsers.add_parser('palette', help='Extract color palette')
    palette_parser.add_argument('--image', '-i', required=True, help='Input image')
    palette_parser.add_argument('--k', type=int, default=6, help='Number of colors')
    
    # SSIM command
    ssim_parser = subparsers.add_parser('ssim', help='Compute SSIM between images')
    ssim_parser.add_argument('--ref', '-r', required=True, help='Reference image')
    ssim_parser.add_argument('--gen', '-g', required=True, help='Generated image')
    
    # Suggest command
    suggest_parser = subparsers.add_parser('suggest', help='Suggest color adjustments')
    suggest_parser.add_argument('--ref', '-r', required=True, help='Reference image')
    suggest_parser.add_argument('--gen', '-g', required=True, help='Generated image')
    
    # Global options
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    
    args = parser.parse_args()
    
    if not args.command:
        # Legacy mode: support --source --target for direct transfer
        if hasattr(args, 'source') and args.source:
            args.command = 'transfer'
        else:
            parser.print_help()
            sys.exit(1)
    
    try:
        if args.command == 'transfer':
            result = reinhard_color_transfer(
                args.source,
                args.target,
                getattr(args, 'output', None),
                getattr(args, 'preserve_luminance', False)
            )
        elif args.command == 'palette':
            result = extract_palette(args.image, args.k)
        elif args.command == 'ssim':
            result = compute_ssim(args.ref, args.gen)
        elif args.command == 'suggest':
            ref_palette = extract_palette(args.ref)
            gen_palette = extract_palette(args.gen)
            result = suggest_color_adjustments(ref_palette, gen_palette)
        else:
            result = {"success": False, "error": f"Unknown command: {args.command}"}
        
        if args.json or True:  # Always output JSON for programmatic use
            print(json.dumps(result, indent=2))
        
    except Exception as e:
        result = {"success": False, "error": str(e)}
        print(json.dumps(result))
        sys.exit(1)


if __name__ == '__main__':
    main()
