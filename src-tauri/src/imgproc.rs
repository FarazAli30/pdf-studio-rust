//! Pure-Rust replacements for the OpenCV.js routines the original app used.

use image::{GrayImage, Luma, Rgb, RgbImage};
use imageproc::{
    contrast::otsu_level,
    edges::canny,
    filter::gaussian_blur_f32,
    geometric_transformations::{rotate_about_center, Interpolation},
};

/// OpenCV COLOR_RGBA2GRAY weights.
pub fn to_gray(img: &RgbImage) -> GrayImage {
    GrayImage::from_fn(img.width(), img.height(), |x, y| {
        let p = img.get_pixel(x, y).0;
        Luma([(0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32).round().clamp(0.0, 255.0) as u8])
    })
}

pub fn gray_to_rgb(g: &GrayImage) -> RgbImage {
    RgbImage::from_fn(g.width(), g.height(), |x, y| {
        let v = g.get_pixel(x, y).0[0];
        Rgb([v, v, v])
    })
}

/// Sigma OpenCV derives from a kernel size when sigma = 0.
fn sigma_for(k: u32) -> f32 {
    0.3 * ((k as f32 - 1.0) * 0.5 - 1.0) + 0.8
}

pub fn blur(g: &GrayImage, ksize: u32) -> GrayImage {
    gaussian_blur_f32(g, sigma_for(ksize).max(0.1))
}

/// cv.adaptiveThreshold(ADAPTIVE_THRESH_GAUSSIAN_C, THRESH_BINARY)
pub fn adaptive_gaussian(g: &GrayImage, block: u32, c: f32) -> GrayImage {
    let b = blur(g, block);
    GrayImage::from_fn(g.width(), g.height(), |x, y| {
        let v = g.get_pixel(x, y).0[0] as f32;
        let t = b.get_pixel(x, y).0[0] as f32 - c;
        Luma([if v > t { 255 } else { 0 }])
    })
}

pub fn threshold(g: &GrayImage, t: u8) -> GrayImage {
    GrayImage::from_fn(g.width(), g.height(), |x, y| Luma([if g.get_pixel(x, y).0[0] > t { 255 } else { 0 }]))
}

pub fn otsu(g: &GrayImage) -> GrayImage {
    threshold(g, otsu_level(g))
}

/// convertTo(alpha, beta = 0) with saturation
pub fn contrast(g: &GrayImage, alpha: f32) -> GrayImage {
    GrayImage::from_fn(g.width(), g.height(), |x, y| Luma([(g.get_pixel(x, y).0[0] as f32 * alpha).round().clamp(0.0, 255.0) as u8]))
}

/// 3x3 sharpen kernel [-1 -1 -1; -1 9 -1; -1 -1 -1] with replicated borders.
pub fn sharpen(g: &GrayImage) -> GrayImage {
    let (w, h) = (g.width() as i32, g.height() as i32);
    GrayImage::from_fn(g.width(), g.height(), |x, y| {
        let mut sum = 0i32;
        for dy in -1i32..=1 {
            for dx in -1i32..=1 {
                let px = (x as i32 + dx).clamp(0, w - 1) as u32;
                let py = (y as i32 + dy).clamp(0, h - 1) as u32;
                let v = g.get_pixel(px, py).0[0] as i32;
                sum += if dx == 0 && dy == 0 { 9 * v } else { -v };
            }
        }
        Luma([sum.clamp(0, 255) as u8])
    })
}

/// Skew angle in degrees (positive = text rotated clockwise), 0 when nothing reliable is found.
/// Canny edges + a Hough accumulator restricted to near-horizontal lines.
pub fn detect_skew(gray: &GrayImage) -> f32 {
    let edges = canny(&blur(gray, 5), 50.0, 150.0);
    let (w, h) = edges.dimensions();
    let diag = ((w * w + h * h) as f32).sqrt().ceil() as i32;
    let nr = (2 * diag + 1) as usize;
    const T0: usize = 46; // theta 46..=134  => |theta-90| < 45
    const T1: usize = 134;
    let nt = T1 - T0 + 1;
    let tabs: Vec<(f32, f32)> = (T0..=T1)
        .map(|t| {
            let r = (t as f32).to_radians();
            (r.cos(), r.sin())
        })
        .collect();
    let mut acc = vec![0u32; nt * nr];
    for (x, y, p) in edges.enumerate_pixels() {
        if p.0[0] == 0 {
            continue;
        }
        for (ti, (c, s)) in tabs.iter().enumerate() {
            let r = (x as f32 * c + y as f32 * s).round() as i32 + diag;
            acc[ti * nr + r as usize] += 1;
        }
    }
    // local maxima above the vote threshold
    let mut peaks: Vec<(u32, usize)> = vec![];
    for ti in 0..nt {
        for r in 0..nr {
            let v = acc[ti * nr + r];
            if v < 100 {
                continue;
            }
            let mut is_max = true;
            'n: for dt in -1i32..=1 {
                for dr in -1i32..=1 {
                    if dt == 0 && dr == 0 {
                        continue;
                    }
                    let (nt2, nr2) = (ti as i32 + dt, r as i32 + dr);
                    if nt2 < 0 || nt2 >= nt as i32 || nr2 < 0 || nr2 >= nr as i32 {
                        continue;
                    }
                    if acc[nt2 as usize * nr + nr2 as usize] > v {
                        is_max = false;
                        break 'n;
                    }
                }
            }
            if is_max {
                peaks.push((v, ti));
            }
        }
    }
    peaks.sort_by(|a, b| b.0.cmp(&a.0));
    let take = peaks.iter().take(50).collect::<Vec<_>>();
    if take.is_empty() {
        return 0.0;
    }
    let sum: f32 = take.iter().map(|(_, ti)| (*ti + T0) as f32 - 90.0).sum();
    sum / take.len() as f32
}

/// Rotate clockwise by `angle_deg` about the centre, filling with white.
pub fn rotate(img: &RgbImage, angle_deg: f32) -> RgbImage {
    rotate_about_center(img, angle_deg.to_radians(), Interpolation::Bilinear, Rgb([255, 255, 255]))
}

/// Bounding boxes (x, y, w, h) of the outermost connected shapes in a binary image.
pub fn outer_boxes(bin: &GrayImage) -> Vec<(u32, u32, u32, u32)> {
    use imageproc::contours::{find_contours, BorderType};
    find_contours::<i32>(bin)
        .iter()
        .filter(|c| c.border_type == BorderType::Outer && c.parent.is_none())
        .filter_map(|c| {
            let (mut x0, mut y0, mut x1, mut y1) = (i32::MAX, i32::MAX, i32::MIN, i32::MIN);
            for p in &c.points {
                x0 = x0.min(p.x);
                y0 = y0.min(p.y);
                x1 = x1.max(p.x);
                y1 = y1.max(p.y);
            }
            if x1 < x0 {
                return None;
            }
            Some((x0 as u32, y0 as u32, (x1 - x0 + 1) as u32, (y1 - y0 + 1) as u32))
        })
        .collect()
}
